import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, today } from "../shared/dates";
import type { Language } from "../shared/languages";
import { db } from "./db";
import { nextReview, type ReviewState } from "./spacing";

type DueExercise = { id: number; prompt: string; answer: string; language: Language | null; topic: string };

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listDue = db.prepare(`
	SELECT exercises.id, exercises.prompt, exercises.answer, exercises.language, entries.topic
	FROM exercises
	JOIN entries ON entries.id = exercises.entry_id
	WHERE exercises.retired = 0 AND exercises.due_date <= ?
	ORDER BY exercises.due_date, exercises.id
`);
const getState = db.prepare("SELECT interval_days, streak FROM exercises WHERE id = ?");
const saveOutcome = db.prepare(
	"UPDATE exercises SET interval_days = ?, streak = ?, retired = ?, due_date = ? WHERE id = ?",
);

export const reviews = new Hono()
	.get("/due", (c) => c.json(listDue.all(today()) as DueExercise[]))
	.post("/:id/result", zValidator("param", idParam), zValidator("json", z.object({ got: z.boolean() })), (c) => {
		const { id } = c.req.valid("param");
		const state = getState.get(id) as ReviewState | undefined;
		if (!state) return c.notFound();
		const next = nextReview(state, c.req.valid("json").got);
		saveOutcome.run(next.interval_days, next.streak, next.retired ? 1 : 0, addDays(today(), next.interval_days), id);
		return c.body(null, 204);
	});
