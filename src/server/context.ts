import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, today } from "../shared/dates";
import { db } from "./db";

const LOOKBACK_DAYS = 30;
const NOTES_LIMIT = 1200;
const CODE_LIMIT = 800;
const CAREER_LIMIT = 30_000;

// Machine-specific paths such as CAREER_NOTES_DIR live in .env, which stays out of git.
try {
	process.loadEnvFile();
} catch {
	// No .env file.
}

const listRecent = db.prepare(
	"SELECT id, date, topic, notes FROM entries WHERE date >= ? ORDER BY date DESC, id DESC LIMIT ?",
);
const listSnippets = db.prepare("SELECT language, code FROM snippets WHERE entry_id = ? ORDER BY position");
const resultsByTopic = db.prepare(`
	SELECT entries.topic, COUNT(*) AS reviews, SUM(review_log.got) AS got
	FROM review_log
	JOIN exercises ON exercises.id = review_log.exercise_id
	JOIN entries ON entries.id = exercises.entry_id
	WHERE review_log.reviewed_on >= ?
	GROUP BY entries.id
	ORDER BY entries.date DESC
`);
const listOpenItems = db.prepare(
	"SELECT title, due_date, due_time FROM planner_items WHERE done = 0 ORDER BY due_date IS NULL, due_date, due_time",
);
const listDoneItems = db.prepare(
	"SELECT title, date(done_at, 'localtime') AS done_on FROM planner_items WHERE done = 1 AND date(done_at, 'localtime') >= ? ORDER BY done_at DESC",
);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

export function recentLog(since: string, limit: number, { withCode }: { withCode: boolean }) {
	const entries = listRecent.all(since, limit) as { id: number; date: string; topic: string; notes: string }[];
	return entries.map((entry) => {
		const snippets = listSnippets.all(entry.id) as { language: string; code: string }[];
		return {
			date: entry.date,
			topic: entry.topic,
			notes: clip(entry.notes, NOTES_LIMIT),
			snippets: withCode
				? snippets.map((s) => ({ language: s.language, code: clip(s.code, CODE_LIMIT) }))
				: snippets.map((s) => s.language),
		};
	});
}

export const reviewResults = (since: string) =>
	resultsByTopic.all(since) as { topic: string; reviews: number; got: number }[];

export const plannerSnapshot = (doneSince: string) => ({
	open: listOpenItems.all() as { title: string; due_date: string | null; due_time: string | null }[],
	done: listDoneItems.all(doneSince) as { title: string; done_on: string }[],
});

// Markdown notes about career goals, from the folder CAREER_NOTES_DIR points at. Missing folder means none.
export function careerNotes() {
	const dir = process.env.CAREER_NOTES_DIR;
	if (!dir) return [];
	let files: string[];
	try {
		files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".md"));
	} catch {
		return [];
	}
	let room = CAREER_LIMIT;
	const notes: { file: string; text: string }[] = [];
	for (const file of files.sort()) {
		if (room <= 0) break;
		const text = clip(readFileSync(join(dir, file), "utf8"), room);
		room -= text.length;
		notes.push({ file, text });
	}
	return notes;
}

// Everything the assistant and the suggestions see about the learner.
export function studyContext() {
	const since = addDays(today(), -LOOKBACK_DAYS);
	return {
		today: today(),
		weekday: new Date().toLocaleDateString("en-US", { weekday: "long" }),
		log: recentLog(since, 30, { withCode: true }),
		review_results: reviewResults(since),
		planner: plannerSnapshot(since),
		career_notes: careerNotes(),
	};
}
