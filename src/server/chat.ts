import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { TIME_PATTERN, today } from "../shared/dates";
import { askAgent, log } from "./agent";
import { allNotes, studyContext } from "./context";
import { db } from "./db";
import { readSettings } from "./settings";

// Generous so a long reply sent back as history still fits; the client limits what can be typed to less.
const MESSAGE_LIMIT = 20_000;

const MAX_MESSAGES = 40;

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
				"add_log_entry",
				"append_to_note",
				"rename_note",
				"rewrite_note",
				"delete_note",
			]),
			note_id: z.number().int().nullable(),
			title: z.string().nullable(),
			date: z.string().nullable(),
			time: z.string().nullable(),
			notes: z.string().nullable(),
		}),
	),
});

export type ChatAction =
	| { kind: "add_planner_item"; title: string; due_date: string | null; due_time: string | null }
	| { kind: "add_log_entry"; topic: string; date: string; notes: string }
	| { kind: "append_to_note" | "rewrite_note"; id: number; topic: string; notes: string }
	| { kind: "rename_note"; id: number; from: string; topic: string }
	| { kind: "delete_note"; id: number; topic: string };

const SYSTEM_PROMPT = `You are the assistant inside Etch, an app where someone studying cybersecurity (mostly TryHackMe rooms) keeps notes, reviews them with spaced repetition and plans their days. You are given JSON with today's date, all their notes (id, title, date and full text), review results per topic, their planner and any career notes they keep, then the conversation so far. Reply to their last message.

Be a helpful study and career partner: answer questions, explain ideas plainly (they are new to cybersecurity and computing), and tie advice to their notes and goals. Only claim what the data shows. You are not connected to anything else and can't see their screen.

Notes are Markdown. Each title belongs to exactly one note, and [[Title]] links to another note. Commands go in fenced code blocks with a language (\`\`\`bash), which Etch turns into review exercises.

You can't change anything yourself. When they ask for a change, or agree to one you offered, put it in actions and the app asks them to confirm each one. Set every field an action doesn't use to null.
- add_planner_item: title is the task; date (YYYY-MM-DD) and time (24-hour HH:MM) are optional, and a time needs a date. All dates and times are their PC's local clock, so use times exactly as they say them and never bring up time zones.
- add_log_entry: a new note. title is a title no note has yet, notes is its Markdown, date defaults to today.
- append_to_note: note_id, and notes is Markdown added to the end of that note. When a note on the topic exists, add to it rather than making a new one.
- rename_note: note_id, and title is the new title.
- rewrite_note: note_id, and notes is the note's complete new text. Keep everything they wrote unless they asked for it to go.
- delete_note: note_id. Only when they ask for a note to be deleted.
Say in your reply what you're proposing. Otherwise leave actions empty. When reminders_on is true, Etch sends a Windows notification at a timed planner item's time, and one when their available hours start listing that day's untimed items, so offer a timed planner item when they want reminding. Etch can't remind them of anything else.

Reply in plain text without Markdown, briefly, like a chat message.`;

const getNote = db.prepare("SELECT id, topic FROM entries WHERE id = ?");

const isDate = (value: string | null): value is string => value !== null && z.iso.date().safeParse(value).success;

// Drops anything malformed, or aimed at a note that doesn't exist, instead of failing the whole reply.
function toAction(action: z.infer<typeof replySchema>["actions"][number]): ChatAction[] {
	const title = action.title?.trim() ?? "";
	const notes = action.notes?.trim() ?? "";
	if (action.kind === "add_planner_item") {
		if (!title) return [];
		const due_date = isDate(action.date) ? action.date : null;
		const due_time = due_date && action.time && TIME_PATTERN.test(action.time) ? action.time : null;
		return [{ kind: "add_planner_item", title, due_date, due_time }];
	}
	if (action.kind === "add_log_entry") {
		if (!title) return [];
		return [{ kind: "add_log_entry", topic: title, date: isDate(action.date) ? action.date : today(), notes }];
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
