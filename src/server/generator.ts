import { z } from "zod";
import { addDays, daysBetween, inAvailableHours, today } from "../shared/dates";
import type { Language } from "../shared/languages";
import { askAgent, log } from "./agent";
import { db, transaction } from "./db";
import { readSettings } from "./settings";

const MAX_ENTRIES = 10;
const FREQUENCY_DAYS = { daily: 1, every2: 2, weekly: 7 } as const;

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
type GeneratedExercise = z.infer<typeof replySchema>["exercises"][number];

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
// Entries with notes but no questions from them yet, or any entry holding a snippet without exercises.
const listPending = db.prepare(`
	SELECT id, topic, notes FROM entries e
	WHERE (trim(notes) != '' AND NOT EXISTS (SELECT 1 FROM exercises x WHERE x.entry_id = e.id AND x.snippet_id IS NULL))
		OR EXISTS (
			SELECT 1 FROM snippets s
			WHERE s.entry_id = e.id AND NOT EXISTS (SELECT 1 FROM exercises x WHERE x.snippet_id = s.id)
		)
	ORDER BY date, id
	LIMIT ?
`);
const hasNotesExercises = db.prepare("SELECT 1 FROM exercises WHERE entry_id = ? AND snippet_id IS NULL LIMIT 1");
const hasSnippetExercises = db.prepare("SELECT 1 FROM exercises WHERE snippet_id = ? LIMIT 1");
const listNewSnippets = db.prepare(`
	SELECT id, language, code FROM snippets s
	WHERE entry_id = ? AND NOT EXISTS (SELECT 1 FROM exercises x WHERE x.snippet_id = s.id)
	ORDER BY position
`);
const insertExercise = db.prepare(
	"INSERT INTO exercises (entry_id, snippet_id, prompt, answer, language, due_date) VALUES (?, ?, ?, ?, ?, ?)",
);

// The scheduled run: never while Away or set to manual, only on an available day after the window opens,
// and only once the chosen number of days has passed since the last run.
export function isScheduledRunDue() {
	const s = readSettings();
	if (s.status === "away" || s.frequency === "manual") return false;
	if (!inAvailableHours(s.available_days, s.available_start, "24:00")) return false;
	const last = (getSetting.get("last_generated") as { value: string } | undefined)?.value;
	return !last || daysBetween(last, today()) >= FREQUENCY_DAYS[s.frequency];
}

function gatherMaterial(): Material[] {
	const entries = listPending.all(MAX_ENTRIES) as { id: number; topic: string; notes: string }[];
	return entries.map((entry) => ({
		entry_id: entry.id,
		topic: entry.topic,
		notes: entry.notes.trim() && !hasNotesExercises.get(entry.id) ? entry.notes : undefined,
		snippets: (listNewSnippets.all(entry.id) as { id: number; language: Language; code: string }[]).map((s) => ({
			snippet_id: s.id,
			language: s.language,
			code: s.code,
		})),
	}));
}

function save(material: Material[], exercises: GeneratedExercise[], due: string) {
	const entryIds = new Set(material.map((m) => m.entry_id));
	const snippets = new Map(
		material.flatMap((m) => m.snippets.map((s) => [s.snippet_id, { ...s, entry_id: m.entry_id }])),
	);
	let saved = 0;
	transaction(() => {
		// The scheduled task and Generate now run in separate processes, so material may have been covered meanwhile.
		const covered = exercises.map((ex) =>
			Boolean(ex.snippet_id === null ? hasNotesExercises.get(ex.entry_id) : hasSnippetExercises.get(ex.snippet_id)),
		);
		for (const [i, ex] of exercises.entries()) {
			if (covered[i]) continue;
			const snippet = ex.snippet_id === null ? undefined : snippets.get(ex.snippet_id);
			const valid = entryIds.has(ex.entry_id) && (ex.snippet_id === null || snippet?.entry_id === ex.entry_id);
			if (!valid) continue;
			insertExercise.run(ex.entry_id, ex.snippet_id, ex.prompt, ex.answer, snippet?.language ?? null, due);
			saved++;
		}
	});
	return saved;
}

let running = false;

export const isGenerating = () => running;

// Scheduled runs are first due tomorrow so there's a gap before recall; ones you ask for are due right away.
export async function generateReviews({ dueToday }: { dueToday: boolean }) {
	running = true;
	try {
		const material = gatherMaterial();
		let saved = 0;
		if (material.length === 0) {
			log("Nothing new to review.");
		} else {
			const { exercises } = await askAgent(SYSTEM_PROMPT, material, replySchema);
			saved = save(material, exercises, dueToday ? today() : addDays(today(), 1));
			log(`Saved ${saved} of ${exercises.length} exercises from ${material.length} entries.`);
		}
		setSetting.run("last_generated", today());
		return saved;
	} catch (error) {
		log(`Failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	} finally {
		running = false;
	}
}
