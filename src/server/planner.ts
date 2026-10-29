import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { TIME_PATTERN } from "../shared/dates";
import { db } from "./db";

type Row = {
	id: number;
	title: string;
	due_date: string | null;
	due_time: string | null;
	done: number;
	done_at: string | null;
	created_at: string;
};

const itemInput = z
	.object({
		title: z.string().trim().min(1),
		due_date: z.iso.date().nullable().default(null),
		due_time: z.string().regex(TIME_PATTERN).nullable().default(null),
		done: z.boolean().default(false),
	})
	.refine((item) => item.due_time === null || item.due_date !== null, { message: "A time needs a date." });
const idParam = z.object({ id: z.coerce.number().int().positive() });

// Open items soonest first with undated ones last, then done items most recent first.
const listItems = db.prepare(`
	SELECT * FROM planner_items
	ORDER BY done,
		CASE WHEN done = 0 THEN due_date IS NULL END,
		CASE WHEN done = 0 THEN due_date END,
		CASE WHEN done = 0 THEN due_time END,
		done_at DESC,
		id
`);
const getItem = db.prepare("SELECT * FROM planner_items WHERE id = ?");
const insertItem = db.prepare("INSERT INTO planner_items (title, due_date, due_time) VALUES (?, ?, ?)");
// done_at keeps its first timestamp while an item stays done, and clears when reopened.
const updateItem = db.prepare(`
	UPDATE planner_items
	SET title = ?, due_date = ?, due_time = ?, done = ?,
		done_at = CASE WHEN ? THEN COALESCE(done_at, CURRENT_TIMESTAMP) ELSE NULL END
	WHERE id = ?
`);
const deleteItem = db.prepare("DELETE FROM planner_items WHERE id = ?");

const toItem = (row: Row) => ({ ...row, done: row.done === 1 });

export const planner = new Hono()
	.get("/", (c) => c.json((listItems.all() as Row[]).map(toItem)))
	.post("/", zValidator("json", itemInput), (c) => {
		const { title, due_date, due_time } = c.req.valid("json");
		const id = insertItem.run(title, due_date, due_time).lastInsertRowid;
		return c.json(toItem(getItem.get(id) as Row), 201);
	})
	.put("/:id", zValidator("param", idParam), zValidator("json", itemInput), (c) => {
		const { id } = c.req.valid("param");
		const { title, due_date, due_time, done } = c.req.valid("json");
		const flag = done ? 1 : 0;
		if (updateItem.run(title, due_date, due_time, flag, flag, id).changes === 0) return c.notFound();
		return c.json(toItem(getItem.get(id) as Row));
	})
	.delete("/:id", zValidator("param", idParam), (c) =>
		deleteItem.run(c.req.valid("param").id).changes === 0 ? c.notFound() : c.body(null, 204),
	);
