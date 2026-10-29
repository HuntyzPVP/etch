import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Language } from "../shared/languages";
import { db, transaction } from "./db";
import { splitNotes } from "./fences";

type Entry = { id: number; date: string; topic: string; notes: string; created_at: string };
type Snippet = { id: number; entry_id: number; language: Language; code: string; position: number };

const entryInput = z.object({
	date: z.iso.date(),
	topic: z.string().trim().min(1),
	notes: z.string().default(""),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

const listEntries = db.prepare("SELECT * FROM entries ORDER BY date DESC, id DESC");
const getEntry = db.prepare("SELECT * FROM entries WHERE id = ?");
const insertEntry = db.prepare("INSERT INTO entries (date, topic, notes) VALUES (?, ?, ?)");
const updateEntry = db.prepare("UPDATE entries SET date = ?, topic = ?, notes = ? WHERE id = ?");
const deleteEntry = db.prepare("DELETE FROM entries WHERE id = ?");
const deleteDraft = db.prepare("DELETE FROM drafts WHERE key = ?");
// Each title names one note, so [[links]] know where to go.
const findTitle = db.prepare("SELECT id FROM entries WHERE lower(trim(topic)) = lower(?) AND id != ?");
const listSnippets = db.prepare("SELECT * FROM snippets WHERE entry_id = ? ORDER BY position");
const insertSnippet = db.prepare("INSERT INTO snippets (entry_id, language, code, position) VALUES (?, ?, ?, ?)");
const moveSnippet = db.prepare("UPDATE snippets SET position = ? WHERE id = ?");
const deleteSnippet = db.prepare("DELETE FROM snippets WHERE id = ?");

function withSnippets(entry: Entry) {
	return { ...entry, snippets: listSnippets.all(entry.id) as Snippet[] };
}

// Snippets come from the code fences in the notes. One whose code is unchanged keeps its id, and with it its exercises.
function saveSnippets(entryId: number, notes: string) {
	const unused = listSnippets.all(entryId) as Snippet[];
	splitNotes(notes).snippets.forEach((fence, position) => {
		const same = unused.findIndex((s) => s.language === fence.language && s.code === fence.code);
		if (same === -1) {
			insertSnippet.run(entryId, fence.language, fence.code, position);
		} else {
			moveSnippet.run(position, unused[same].id);
			unused.splice(same, 1);
		}
	});
	for (const stale of unused) deleteSnippet.run(stale.id);
}

export const entries = new Hono()
	.get("/", (c) => c.json((listEntries.all() as Entry[]).map(withSnippets)))
	.get("/:id", zValidator("param", idParam), (c) => {
		const entry = getEntry.get(c.req.valid("param").id) as Entry | undefined;
		return entry ? c.json(withSnippets(entry)) : c.notFound();
	})
	.post("/", zValidator("json", entryInput), (c) => {
		const { date, topic, notes } = c.req.valid("json");
		if (findTitle.get(topic, 0)) return c.text("A note with this title already exists", 409);
		const id = transaction(() => {
			const entryId = Number(insertEntry.run(date, topic, notes).lastInsertRowid);
			saveSnippets(entryId, notes);
			deleteDraft.run("new");
			return entryId;
		});
		return c.json(withSnippets(getEntry.get(id) as Entry), 201);
	})
	.put("/:id", zValidator("param", idParam), zValidator("json", entryInput), (c) => {
		const { id } = c.req.valid("param");
		const { date, topic, notes } = c.req.valid("json");
		if (findTitle.get(topic, id)) return c.text("A note with this title already exists", 409);
		const found = transaction(() => {
			if (updateEntry.run(date, topic, notes, id).changes === 0) return false;
			saveSnippets(id, notes);
			deleteDraft.run(String(id));
			return true;
		});
		return found ? c.json(withSnippets(getEntry.get(id) as Entry)) : c.notFound();
	})
	.delete("/:id", zValidator("param", idParam), (c) => {
		const { id } = c.req.valid("param");
		deleteDraft.run(String(id));
		return deleteEntry.run(id).changes === 0 ? c.notFound() : c.body(null, 204);
	});
