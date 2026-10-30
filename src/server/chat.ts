import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, TIME_PATTERN, today } from "../shared/dates";
import { askAgent, log } from "./agent";
import { allNotes, reviewsSnapshot, studyContext } from "./context";
import { db } from "./db";
import { readSettings, type Settings } from "./settings";

// Generous so a long reply sent back as history still fits; the client limits what can be typed to less.
const MESSAGE_LIMIT = 20_000;

const MAX_MESSAGES = 40;

const DAILY_CAPS = ["3", "5", "10", "20", "30", "none"] as const;

const chatInput = z.object({
	messages: z
		.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(MESSAGE_LIMIT) }))
		.min(1)
		.max(MAX_MESSAGES)
		.refine((messages) => messages.at(-1)?.role === "user", { message: "The last message must be the user's." }),
});

// Flat rather than a union so the agent's structured output stays simple to fill in.
const replySchema = z.object({
	reply: z.string().min(1),
	actions: z.array(
		z.object({
			kind: z.enum([
				"add_planner_item",
				"edit_planner_item",
				"delete_planner_item",
				"add_log_entry",
				"append_to_note",
				"rename_note",
				"rewrite_note",
				"delete_note",
				"delete_reviews",
				"postpone_reviews",
				"spread_reviews",
				"set_daily_limit",
			]),
			note_id: z.number().int().nullable(),
			item_id: z.number().int().nullable(),
			title: z.string().nullable(),
			date: z.string().nullable(),
			time: z.string().nullable(),
			notes: z.string().nullable(),
			done: z.boolean().nullable(),
			days: z.number().int().nullable(),
			limit: z.enum(DAILY_CAPS).nullable(),
		}),
	),
});

type ReviewScope = { note_id: number | null; scope: string; count: number };

export type ChatAction =
	| { kind: "add_planner_item"; title: string; due_date: string | null; due_time: string | null }
	| {
			kind: "edit_planner_item";
			id: number;
			was: string;
			title: string;
			due_date: string | null;
			due_time: string | null;
			done: boolean;
	  }
	| { kind: "delete_planner_item"; id: number; title: string }
	| { kind: "add_log_entry"; topic: string; date: string; notes: string }
	| { kind: "append_to_note" | "rewrite_note"; id: number; topic: string; notes: string }
	| { kind: "rename_note"; id: number; from: string; topic: string }
	| { kind: "delete_note"; id: number; topic: string }
	| ({ kind: "delete_reviews" } & ReviewScope)
	| ({ kind: "postpone_reviews"; date: string } & ReviewScope)
	| ({ kind: "spread_reviews"; days: number } & ReviewScope)
	| { kind: "set_daily_limit"; limit: Settings["daily_cap"] };

const SYSTEM_PROMPT = `You are the assistant inside Etch, an app where someone studying cybersecurity (mostly TryHackMe rooms) keeps notes, reviews them with spaced repetition and plans their days. You are given JSON with today's date, all their notes (id, title, date and full text), their review exercises counted per note (due now, due later, next due date), their daily review limit, review results per topic, their planner (items with ids) and any career notes they keep, then the conversation so far. Reply to their last message.

Be a helpful study and career partner: answer questions, explain ideas plainly (they are new to cybersecurity and computing), and tie advice to their notes and goals. Only claim what the data shows. You are not connected to anything else and can't see their screen.

Notes are Markdown. Each title belongs to exactly one note, and [[Title]] links to another note. Commands go in fenced code blocks with a language (\`\`\`bash), which Etch turns into review exercises.

You can't change anything yourself, but you can propose any of the changes below. Do exactly what they ask: when they say delete, delete; when they say postpone, postpone. Don't swap in something gentler. When they ask for a change, or agree to one you offered, put it in actions and the app asks them to confirm each one. Set every field an action doesn't use to null. All dates are YYYY-MM-DD and times 24-hour HH:MM on their PC's local clock; use times exactly as they say them and never bring up time zones.

Planner:
- add_planner_item: title is the task; date and time are optional, and a time needs a date.
- edit_planner_item: item_id, then only the fields that change: title, date, time, done (true to tick it off, false to reopen). date or time "none" removes it; removing the date removes the time too.
- delete_planner_item: item_id.

Notes:
- add_log_entry: a new note. title is a title no note has yet, notes is its Markdown, date defaults to today.
- append_to_note: note_id, and notes is Markdown added to the end of that note. When a note on the topic exists, add to it rather than making a new one.
- rename_note: note_id, and title is the new title.
- rewrite_note: note_id, and notes is the note's complete new text. Keep everything they wrote unless they asked for it to go.
- delete_note: note_id.

Reviews (note_id null means every note's reviews, otherwise just that note's):
- delete_reviews: deletes the review exercises for good. They don't come back.
- postpone_reviews: date; everything due before it moves to that date.
- spread_reviews: days; what's due now is shared out evenly over that many days, starting today.
- set_daily_limit: limit is how many reviews show per day: "3", "5", "10", "20", "30" or "none".

Say in your reply what you're proposing. Otherwise leave actions empty. When reminders_on is true, Etch sends a Windows notification at a timed planner item's time, and one when their available hours start listing that day's untimed items, so offer a timed planner item when they want reminding. Etch can't remind them of anything else.

Reply in plain text without Markdown, briefly, like a chat message.`;

const getNote = db.prepare("SELECT id, topic FROM entries WHERE id = ?");
const getItem = db.prepare("SELECT id, title, due_date, due_time, done FROM planner_items WHERE id = ?");
const countReviews = db.prepare(
	"SELECT COUNT(*) AS n FROM exercises WHERE cleared = 0 AND (? IS NULL OR entry_id = ?) AND (? IS NULL OR retired = 0 AND due_date < ?)",
);

type Proposed = z.infer<typeof replySchema>["actions"][number];

const isDate = (value: string | null): value is string => value !== null && z.iso.date().safeParse(value).success;
const isTime = (value: string | null): value is string => value !== null && TIME_PATTERN.test(value);

// Which reviews an action covers and how many, for its card. Undefined when the note doesn't exist.
function reviewScope(action: Proposed, before: string | null): ReviewScope | undefined {
	const note =
		action.note_id === null ? null : (getNote.get(action.note_id) as { id: number; topic: string } | undefined);
	if (note === undefined) return undefined;
	const id = note?.id ?? null;
	const count = (countReviews.get(id, id, before, before) as { n: number }).n;
	return { note_id: id, scope: note ? note.topic : "All notes", count };
}

function editedItem(action: Proposed): ChatAction[] {
	const item = action.item_id === null ? undefined : (getItem.get(action.item_id) as PlannerRow | undefined);
	if (!item) return [];
	const title = action.title?.trim() || item.title;
	let due_date = item.due_date;
	if (action.date === "none") due_date = null;
	else if (isDate(action.date)) due_date = action.date;
	let due_time = due_date === null ? null : item.due_time;
	if (action.time === "none") due_time = null;
	else if (due_date !== null && isTime(action.time)) due_time = action.time;
	const done = action.done ?? item.done === 1;
	return [{ kind: "edit_planner_item", id: item.id, was: item.title, title, due_date, due_time, done }];
}

type PlannerRow = { id: number; title: string; due_date: string | null; due_time: string | null; done: number };

// Drops anything malformed, or aimed at something that doesn't exist, instead of failing the whole reply.
function toAction(action: Proposed): ChatAction[] {
	const title = action.title?.trim() ?? "";
	const notes = action.notes?.trim() ?? "";
	switch (action.kind) {
		case "add_planner_item": {
			if (!title) return [];
			const due_date = isDate(action.date) ? action.date : null;
			const due_time = due_date && isTime(action.time) ? action.time : null;
			return [{ kind: "add_planner_item", title, due_date, due_time }];
		}
		case "edit_planner_item":
			return editedItem(action);
		case "delete_planner_item": {
			const item = action.item_id === null ? undefined : (getItem.get(action.item_id) as PlannerRow | undefined);
			return item ? [{ kind: "delete_planner_item", id: item.id, title: item.title }] : [];
		}
		case "add_log_entry":
			if (!title) return [];
			return [{ kind: "add_log_entry", topic: title, date: isDate(action.date) ? action.date : today(), notes }];
		case "delete_reviews": {
			const scope = reviewScope(action, null);
			return scope && scope.count > 0 ? [{ kind: "delete_reviews", ...scope }] : [];
		}
		case "postpone_reviews": {
			if (!isDate(action.date) || action.date <= today()) return [];
			const scope = reviewScope(action, action.date);
			return scope && scope.count > 0 ? [{ kind: "postpone_reviews", date: action.date, ...scope }] : [];
		}
		case "spread_reviews": {
			if (!action.days || action.days < 2) return [];
			// Due now means due before tomorrow.
			const scope = reviewScope(action, addDays(today(), 1));
			return scope && scope.count > 0 ? [{ kind: "spread_reviews", days: action.days, ...scope }] : [];
		}
		case "set_daily_limit":
			return action.limit ? [{ kind: "set_daily_limit", limit: action.limit }] : [];
	}
	const note =
		action.note_id === null ? undefined : (getNote.get(action.note_id) as { id: number; topic: string } | undefined);
	if (!note) return [];
	if (action.kind === "delete_note") return [{ kind: "delete_note", id: note.id, topic: note.topic }];
	if (action.kind === "rename_note") {
		if (!title || title === note.topic) return [];
		return [{ kind: "rename_note", id: note.id, from: note.topic, topic: title }];
	}
	if (!notes) return [];
	return [{ kind: action.kind, id: note.id, topic: note.topic, notes }];
}

export const chat = new Hono().post("/", zValidator("json", chatInput), async (c) => {
	const { messages } = c.req.valid("json");
	const settings = readSettings();
	try {
		const { reply, actions } = await askAgent(
			SYSTEM_PROMPT,
			{
				...studyContext(),
				// The full notes replace the trimmed recent log the other AI features get.
				log: undefined,
				notes: allNotes(),
				reviews: reviewsSnapshot(),
				daily_review_limit: settings.daily_cap,
				reminders_on: settings.reminders === "on" && settings.status !== "away",
				conversation: messages,
			},
			replySchema,
		);
		return c.json({ reply, actions: actions.flatMap(toAction) });
	} catch (error) {
		log(`Chat failed: ${error instanceof Error ? error.message : String(error)}`);
		return c.json({ error: "The assistant couldn't reply. Details are in data/generate.log." }, 500);
	}
});
