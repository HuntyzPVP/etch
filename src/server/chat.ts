import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { TIME_PATTERN, today } from "../shared/dates";
import { askAgent, log } from "./agent";
import { studyContext } from "./context";
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
			kind: z.enum(["add_planner_item", "add_log_entry"]),
			title: z.string(),
			date: z.string().nullable(),
			time: z.string().nullable(),
			notes: z.string().nullable(),
		}),
	),
});

export type ChatAction =
	| { kind: "add_planner_item"; title: string; due_date: string | null; due_time: string | null }
	| { kind: "add_log_entry"; topic: string; date: string; notes: string };

const SYSTEM_PROMPT = `You are the assistant inside Etch, an app where someone learning to program logs what they studied, reviews it with spaced repetition and plans their days. You are given JSON with today's date, their recent log, review results per topic, their planner and any career notes they keep, then the conversation so far. Reply to their last message.

Be a helpful study and career partner: answer questions, explain ideas plainly (they are new to programming), and tie advice to what they have logged and to their goals. Only claim what the data shows. You are not connected to anything else and can't see their screen.

You can't change anything yourself. When they ask you to add a planner item or a log entry, or agree to one you offered, put it in actions and the app asks them to confirm each one. For add_planner_item, title is the task, and date (YYYY-MM-DD) and time (24-hour HH:MM) are optional; a time needs a date. All dates and times in Etch are the local clock of their PC, so use times exactly as they say them and never bring up time zones. For add_log_entry, title is the topic, notes are what they learned in their own words, and date defaults to today. Say in your reply what you're proposing. Otherwise leave actions empty. When reminders_on is true, Etch sends a Windows notification at a timed planner item's time, and one when their available hours start listing that day's untimed items, so offer a timed planner item when they want reminding. Etch can't remind them of anything else.

Reply in plain text without Markdown, briefly, like a chat message.`;

const isDate = (value: string | null): value is string => value !== null && z.iso.date().safeParse(value).success;

// Drops anything malformed instead of failing the whole reply.
function toAction(action: z.infer<typeof replySchema>["actions"][number]): ChatAction[] {
	const title = action.title.trim();
	if (!title) return [];
	if (action.kind === "add_log_entry") {
		return [
			{
				kind: "add_log_entry",
				topic: title,
				date: isDate(action.date) ? action.date : today(),
				notes: action.notes ?? "",
			},
		];
	}
	const due_date = isDate(action.date) ? action.date : null;
	const due_time = due_date && action.time && TIME_PATTERN.test(action.time) ? action.time : null;
	return [{ kind: "add_planner_item", title, due_date, due_time }];
}

export const chat = new Hono().post("/", zValidator("json", chatInput), async (c) => {
	const { messages } = c.req.valid("json");
	const settings = readSettings();
	try {
		const { reply, actions } = await askAgent(
			SYSTEM_PROMPT,
			{
				...studyContext(),
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
