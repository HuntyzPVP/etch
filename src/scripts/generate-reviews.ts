import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { z } from "zod";
import { db, transaction } from "../server/db";
import { readSettings } from "../server/settings";
import { addDays, today } from "../shared/dates";
import type { Language } from "../shared/languages";

const MAX_ENTRIES = 10;

const replySchema = z.object({
	exercises: z.array(
		z.object({
			entry_id: z.number().int(),
			snippet_id: z.number().int().nullable(),
			prompt: z.string().min(1),
			answer: z.string().min(1),
		}),
	),
});

const SYSTEM_PROMPT = `You write spaced-repetition review exercises for someone learning to program. You are given JSON describing recent entries from their learning log.

For each snippet, write one or two exercises linked to it by snippet_id. Vary the kind: sometimes straight recall ("Write the code that ..."), sometimes a small twist that changes one detail so they have to think instead of copying. The answer is the code that solves the prompt, in the snippet's language.

For each entry that includes notes, write one to three short questions about the ideas in the notes, with snippet_id null, answered in a sentence or two of plain words.

Every snippet and every entry with notes gets at least one exercise. A prompt must never give away its answer. Keep answers short. Speak to the learner directly.`;

type Material = {
	entry_id: number;
	topic: string;
	notes?: string;
	snippets: { snippet_id: number; language: Language; code: string }[];
};

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare(
	"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
// Entries never reviewed that have notes, or any entry holding a snippet without exercises.
const listPending = db.prepare(`
	SELECT id, topic, notes FROM entries e
	WHERE (trim(notes) != '' AND NOT EXISTS (SELECT 1 FROM exercises x WHERE x.entry_id = e.id))
		OR EXISTS (
			SELECT 1 FROM snippets s
			WHERE s.entry_id = e.id AND NOT EXISTS (SELECT 1 FROM exercises x WHERE x.snippet_id = s.id)
		)
	ORDER BY date, id
	LIMIT ?
`);
const hasExercises = db.prepare("SELECT 1 FROM exercises WHERE entry_id = ? LIMIT 1");
const listNewSnippets = db.prepare(`
	SELECT id, language, code FROM snippets s
	WHERE entry_id = ? AND NOT EXISTS (SELECT 1 FROM exercises x WHERE x.snippet_id = s.id)
	ORDER BY position
`);
const insertExercise = db.prepare(
	"INSERT INTO exercises (entry_id, snippet_id, prompt, answer, language, due_date) VALUES (?, ?, ?, ?, ?, ?)",
);

function log(message: string) {
	appendFileSync("data/generate.log", `${new Date().toLocaleString()}  ${message}\n`);
}

function shouldRun() {
	if (process.argv.includes("--now")) return true;
	const last = (getSetting.get("last_generated") as { value: string } | undefined)?.value;
	const now = new Date().toTimeString().slice(0, 5);
	return last !== today() && now >= readSettings().review_time;
}

function gatherMaterial(): Material[] {
	const entries = listPending.all(MAX_ENTRIES) as { id: number; topic: string; notes: string }[];
	return entries.map((entry) => ({
		entry_id: entry.id,
		topic: entry.topic,
		notes: entry.notes.trim() && !hasExercises.get(entry.id) ? entry.notes : undefined,
		snippets: (listNewSnippets.all(entry.id) as { id: number; language: Language; code: string }[]).map((s) => ({
			snippet_id: s.id,
			language: s.language,
			code: s.code,
		})),
	}));
}

function askClaude(material: Material[]) {
	// No tools, MCP servers, settings or skills: keeps each run small and limits Claude to replying with text.
	const output = execFileSync(
		"claude",
		[
			"-p",
			"--model",
			"sonnet",
			"--tools",
			"",
			"--strict-mcp-config",
			"--setting-sources",
			"",
			"--disable-slash-commands",
			"--no-session-persistence",
			"--system-prompt",
			SYSTEM_PROMPT,
			"--output-format",
			"json",
			"--json-schema",
			JSON.stringify(z.toJSONSchema(replySchema, { target: "draft-7" })),
		],
		{ input: JSON.stringify(material), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
	);
	const reply = JSON.parse(output) as { is_error: boolean; result: string; structured_output?: unknown };
	if (reply.is_error) throw new Error(`Claude returned an error: ${reply.result}`);
	return replySchema.parse(reply.structured_output).exercises;
}

function save(material: Material[], exercises: ReturnType<typeof askClaude>) {
	const entryIds = new Set(material.map((m) => m.entry_id));
	const snippets = new Map(
		material.flatMap((m) => m.snippets.map((s) => [s.snippet_id, { ...s, entry_id: m.entry_id }])),
	);
	const due = addDays(today(), 1);
	let saved = 0;
	transaction(() => {
		for (const ex of exercises) {
			const snippet = ex.snippet_id === null ? undefined : snippets.get(ex.snippet_id);
			const valid = entryIds.has(ex.entry_id) && (ex.snippet_id === null || snippet?.entry_id === ex.entry_id);
			if (!valid) continue;
			insertExercise.run(ex.entry_id, ex.snippet_id, ex.prompt, ex.answer, snippet?.language ?? null, due);
			saved++;
		}
	});
	return saved;
}

try {
	if (shouldRun()) {
		const material = gatherMaterial();
		if (material.length === 0) {
			log("Nothing new to review.");
		} else {
			const exercises = askClaude(material);
			const saved = save(material, exercises);
			log(`Saved ${saved} of ${exercises.length} exercises from ${material.length} entries.`);
		}
		setSetting.run("last_generated", today());
	}
} catch (error) {
	// A failed claude call carries its real reason in stderr; the message alone repeats the whole command.
	const stderr = (error as { stderr?: string }).stderr?.trim();
	log(`Failed: ${stderr || (error instanceof Error ? error.message : String(error))}`);
	process.exitCode = 1;
}
