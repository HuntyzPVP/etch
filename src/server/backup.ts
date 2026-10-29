import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { today } from "../shared/dates";
import { log } from "./agent";
import { db } from "./db";

const DIR = process.env.BACKUP_DIR ?? "data/backups";
const KEEP = 14;
const CHECK_MS = 60 * 60 * 1000;

// One snapshot a day. VACUUM INTO writes a complete, consistent copy even while the app is using the database.
function backUp() {
	mkdirSync(DIR, { recursive: true });
	const file = join(DIR, `etch-${today()}.db`);
	if (existsSync(file)) return;
	db.prepare("VACUUM INTO ?").run(file);
	const old = readdirSync(DIR)
		.filter((f) => /^etch-\d{4}-\d{2}-\d{2}\.db$/.test(f))
		.sort()
		.slice(0, -KEEP);
	for (const f of old) rmSync(join(DIR, f));
}

export function startBackups() {
	const run = () => {
		try {
			backUp();
		} catch (error) {
			log(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};
	run();
	setInterval(run, CHECK_MS);
}
