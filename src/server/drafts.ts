import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "./db";

type Draft = { key: string; date: string; topic: string; notes: string; updated_at: string };

const keyParam = z.object({ key: z.string().regex(/^(new|\d+)$/) });
const draftInput = z.object({ date: z.string(), topic: z.string(), notes: z.string() });

const getDraft = db.prepare("SELECT * FROM drafts WHERE key = ?");
const saveDraft = db.prepare(`
	INSERT INTO drafts (key, date, topic, notes) VALUES (?, ?, ?, ?)
	ON CONFLICT(key) DO UPDATE SET
		date = excluded.date, topic = excluded.topic, notes = excluded.notes, updated_at = CURRENT_TIMESTAMP
`);
const deleteDraft = db.prepare("DELETE FROM drafts WHERE key = ?");

export const drafts = new Hono()
	.get("/:key", zValidator("param", keyParam), (c) =>
		c.json((getDraft.get(c.req.valid("param").key) as Draft | undefined) ?? null),
	)
	.put("/:key", zValidator("param", keyParam), zValidator("json", draftInput), (c) => {
		const { date, topic, notes } = c.req.valid("json");
		saveDraft.run(c.req.valid("param").key, date, topic, notes);
		return c.body(null, 204);
	})
	.delete("/:key", zValidator("param", keyParam), (c) => {
		deleteDraft.run(c.req.valid("param").key);
		return c.body(null, 204);
	});
