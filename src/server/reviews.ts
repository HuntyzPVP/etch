import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, today } from "../shared/dates";
import type { Language } from "../shared/languages";
import { nextReview, type ReviewState } from "../shared/spacing";
import { db, transaction } from "./db";
import { generateReviews, isGenerating } from "./generator";
import { dailyLimit, readSettings } from "./settings";

type DueExercise = {
	id: number;
	prompt: string;
	answer: string;
	language: Language | null;
	streak: number;
	topic: string;
};

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listDue = db.prepare(`
	SELECT exercises.id, exercises.prompt, exercises.answer, exercises.language, exercises.streak, entries.topic
	FROM exercises
	JOIN entries ON entries.id = exercises.entry_id
	WHERE exercises.retired = 0 AND exercises.due_date <= ?
	ORDER BY exercises.due_date, exercises.id
	LIMIT ?
`);
const countReviewedToday = db.prepare("SELECT COUNT(*) AS n FROM review_log WHERE reviewed_on = ?");
// Every exercise, retired ones included, for practice modes that never change scheduling.
const listAll = db.prepare(`
	SELECT exercises.id, exercises.prompt, exercises.answer, exercises.language, exercises.streak, entries.topic
	FROM exercises
	JOIN entries ON entries.id = exercises.entry_id
	ORDER BY exercises.id
`);
const getState = db.prepare("SELECT interval_days, streak FROM exercises WHERE id = ?");
const saveOutcome = db.prepare(
	"UPDATE exercises SET interval_days = ?, streak = ?, retired = ?, due_date = ? WHERE id = ?",
);
const logReview = db.prepare("INSERT INTO review_log (exercise_id, got, reviewed_on) VALUES (?, ?, ?)");

export const reviews = new Hono()
	.get("/due", (c) => {
		// The daily cap counts reviews already done today; anything past it rolls over to tomorrow.
		const reviewed = (countReviewedToday.get(today()) as { n: number }).n;
		const room = Math.max(0, dailyLimit(readSettings()) - reviewed);
		const limit = Number.isFinite(room) ? room : -1;
		return c.json(listDue.all(today(), limit) as DueExercise[]);
	})
	.post("/generate", async (c) => {
		if (isGenerating()) return c.json({ error: "Already writing exercises." }, 409);
		try {
			return c.json({ saved: await generateReviews({ dueToday: true }) });
		} catch {
			return c.json({ error: "Couldn't write exercises. Details are in data/generate.log." }, 500);
		}
	})
	.get("/practice", (c) => c.json(listAll.all() as DueExercise[]))
	.post("/:id/result", zValidator("param", idParam), zValidator("json", z.object({ got: z.boolean() })), (c) => {
		const { id } = c.req.valid("param");
		const state = getState.get(id) as ReviewState | undefined;
		if (!state) return c.notFound();
		const { got } = c.req.valid("json");
		const next = nextReview(state, got);
		transaction(() => {
			saveOutcome.run(next.interval_days, next.streak, next.retired ? 1 : 0, addDays(today(), next.interval_days), id);
			logReview.run(id, got ? 1 : 0, today());
		});
		return c.json(next);
	});
