import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const path = process.env.DB_PATH ?? "data/etch.db";
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
// SQLite leaves foreign keys off unless every connection turns them on.
db.exec("PRAGMA foreign_keys = ON");
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
