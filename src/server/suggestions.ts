import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, today } from "../shared/dates";
import { askAgent, log } from "./agent";
import { studyContext } from "./context";
import { db, transaction } from "./db";

type Suggestion = { id: number; kind: "topic" | "task"; title: string; reason: string };

const replySchema = z.object({
	suggestions: z.array(
		z.object({
			kind: z.enum(["topic", "task"]),
			title: z.string().min(1),
			reason: z.string().min(1),
		}),
	),
});

const SYSTEM_PROMPT = `You coach someone learning to program. You are given JSON with their recent learning log, how their spaced-repetition reviews went per topic, their planner, suggestions you made before and any career notes they keep.

Suggest two or three topics to learn next (kind "topic") and two or three small practice tasks (kind "task"). Build on what they logged and aim at weak spots, where reviews were often missed. When career notes are given, lean toward what those goals need. A task is something they can finish in one sitting, like a short program to write.

Never repeat a past suggestion or something already on the planner. Each title is a short planner item that starts with a verb ("Learn how Python dictionaries work", "Write a function that ..."). Each reason is one sentence, spoken to them directly, saying why.`;

const PAST_DAYS = 60;

const idParam = z.object({ id: z.coerce.number().int().positive() });

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare(
	"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const listOpen = db.prepare("SELECT id, kind, title, reason FROM suggestions WHERE status = 'open' ORDER BY kind, id");
const listPast = db.prepare(
	"SELECT title, status FROM suggestions WHERE date(created_at, 'localtime') >= ? ORDER BY id DESC LIMIT 40",
);
const clearOpen = db.prepare("DELETE FROM suggestions WHERE status = 'open'");
const insertSuggestion = db.prepare("INSERT INTO suggestions (kind, title, reason) VALUES (?, ?, ?)");
const getOpen = db.prepare("SELECT title FROM suggestions WHERE id = ? AND status = 'open'");
const closeSuggestion = db.prepare("UPDATE suggestions SET status = ? WHERE id = ? AND status = 'open'");
const insertItem = db.prepare("INSERT INTO planner_items (title) VALUES (?)");
// The newest entry and review a batch has seen. Ids only grow, so a different mark means something new happened.
const getActivityMark = db.prepare(`
	SELECT (SELECT COALESCE(MAX(id), 0) FROM entries) || ',' || (SELECT COALESCE(MAX(id), 0) FROM review_log) AS mark
`);
const activityMark = () => (getActivityMark.get() as { mark: string }).mark;

// Only worth asking again once something was logged or reviewed since the last batch.
export function areSuggestionsDue() {
	return (getSetting.get("suggested_through") as { value: string } | undefined)?.value !== activityMark();
}

let running = false;

export const isSuggesting = () => running;

// A new batch replaces the open suggestions; accepted and dismissed ones stay as history so they aren't repeated.
export async function generateSuggestions() {
	running = true;
	try {
		const mark = activityMark();
		const context = studyContext();
		let saved = 0;
		if (context.log.length === 0) {
			log("Nothing recent to suggest from.");
		} else {
			const past = listPast.all(addDays(today(), -PAST_DAYS));
			const { suggestions } = await askAgent(SYSTEM_PROMPT, { ...context, past_suggestions: past }, replySchema);
			transaction(() => {
				clearOpen.run();
				for (const s of suggestions) insertSuggestion.run(s.kind, s.title, s.reason);
			});
			saved = suggestions.length;
			log(`Saved ${saved} suggestions.`);
		}
		setSetting.run("suggested_through", mark);
		return saved;
	} catch (error) {
		log(`Suggestions failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	} finally {
		running = false;
	}
}

export const suggestions = new Hono()
	.get("/", (c) => c.json(listOpen.all() as Suggestion[]))
	.post("/generate", async (c) => {
		if (isSuggesting()) return c.json({ error: "Already thinking of suggestions." }, 409);
		try {
			return c.json({ saved: await generateSuggestions() });
		} catch {
			return c.json({ error: "Couldn't get suggestions. Details are in data/generate.log." }, 500);
		}
	})
	// Accepting puts the suggestion on the planner as an undated item.
	.post("/:id/accept", zValidator("param", idParam), (c) => {
		const { id } = c.req.valid("param");
		const found = transaction(() => {
			const suggestion = getOpen.get(id) as { title: string } | undefined;
			if (!suggestion) return false;
			insertItem.run(suggestion.title);
			closeSuggestion.run("accepted", id);
			return true;
		});
		return found ? c.body(null, 204) : c.notFound();
	})
	.post("/:id/dismiss", zValidator("param", idParam), (c) =>
		closeSuggestion.run("dismissed", c.req.valid("param").id).changes === 0 ? c.notFound() : c.body(null, 204),
	);
