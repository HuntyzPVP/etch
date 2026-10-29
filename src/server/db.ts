import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const path = process.env.DB_PATH ?? "data/etch.db";
mkdirSync(dirname(path), { recursive: true });

// The server and the scheduled review task share this file; a write waits for the other's to finish instead of failing.
export const db = new DatabaseSync(path, { timeout: 5000 });
// SQLite leaves foreign keys off unless every connection turns them on.
db.exec("PRAGMA foreign_keys = ON");
// WAL lets one process read while the other writes.
db.exec("PRAGMA journal_mode = WAL");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

export function transaction<T>(fn: () => T): T {
	db.exec("BEGIN");
	try {
		const result = fn();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}
