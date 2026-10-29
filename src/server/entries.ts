import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { LANGUAGES, type Language } from "../shared/languages";
import { db, transaction } from "./db";

type Entry = { id: number; date: string; topic: string; notes: string; created_at: string };
type Snippet = { id: number; entry_id: number; language: Language; code: string; position: number };

const entryInput = z.object({
	date: z.iso.date(),
	topic: z.string().trim().min(1),
	notes: z.string().default(""),
	snippets: z
		.array(
			z.object({
				id: z.number().int().positive().optional(),
				language: z.enum(LANGUAGES),
				code: z.string().min(1),
			}),
		)
		.default([]),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

const listEntries = db.prepare("SELECT * FROM entries ORDER BY date DESC, id DESC");
const getEntry = db.prepare("SELECT * FROM entries WHERE id = ?");
const insertEntry = db.prepare("INSERT INTO entries (date, topic, notes) VALUES (?, ?, ?)");
const updateEntry = db.prepare("UPDATE entries SET date = ?, topic = ?, notes = ? WHERE id = ?");
const deleteEntry = db.prepare("DELETE FROM entries WHERE id = ?");
const listSnippets = db.prepare("SELECT * FROM snippets WHERE entry_id = ? ORDER BY position");
const insertSnippet = db.prepare("INSERT INTO snippets (entry_id, language, code, position) VALUES (?, ?, ?, ?)");
const updateSnippet = db.prepare(
	"UPDATE snippets SET language = ?, code = ?, position = ? WHERE id = ? AND entry_id = ?",
);
const deleteSnippet = db.prepare("DELETE FROM snippets WHERE id = ?");

function withSnippets(entry: Entry) {
	return { ...entry, snippets: listSnippets.all(entry.id) as Snippet[] };
}

// Existing snippets are updated in place so their ids, and the exercises linked to them, survive edits.
function saveSnippets(entryId: number, snippets: z.infer<typeof entryInput>["snippets"]) {
	const kept = new Set(snippets.map((s) => s.id));
	for (const existing of listSnippets.all(entryId) as Snippet[]) {
		if (!kept.has(existing.id)) deleteSnippet.run(existing.id);
	}
	snippets.forEach((s, position) => {
		if (s.id) updateSnippet.run(s.language, s.code, position, s.id, entryId);
		else insertSnippet.run(entryId, s.language, s.code, position);
	});
}

export const entries = new Hono()
	.get("/", (c) => c.json((listEntries.all() as Entry[]).map(withSnippets)))
	.get("/:id", zValidator("param", idParam), (c) => {
		const entry = getEntry.get(c.req.valid("param").id) as Entry | undefined;
		return entry ? c.json(withSnippets(entry)) : c.notFound();
	})
	.post("/", zValidator("json", entryInput), (c) => {
		const { date, topic, notes, snippets } = c.req.valid("json");
		const id = transaction(() => {
			const entryId = Number(insertEntry.run(date, topic, notes).lastInsertRowid);
			saveSnippets(entryId, snippets);
			return entryId;
		});
		return c.json(withSnippets(getEntry.get(id) as Entry), 201);
	})
	.put("/:id", zValidator("param", idParam), zValidator("json", entryInput), (c) => {
		const { id } = c.req.valid("param");
		const { date, topic, notes, snippets } = c.req.valid("json");
		const found = transaction(() => {
			if (updateEntry.run(date, topic, notes, id).changes === 0) return false;
			saveSnippets(id, snippets);
			return true;
		});
		return found ? c.json(withSnippets(getEntry.get(id) as Entry)) : c.notFound();
	})
	.delete("/:id", zValidator("param", idParam), (c) =>
		deleteEntry.run(c.req.valid("param").id).changes === 0 ? c.notFound() : c.body(null, 204),
	);
