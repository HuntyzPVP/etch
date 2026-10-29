import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "./db";

const settingsInput = z.object({
	// 24-hour HH:MM in the PC's local time.
	review_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
type Settings = z.infer<typeof settingsInput>;

const listSettings = db.prepare("SELECT key, value FROM settings");
const saveSetting = db.prepare("UPDATE settings SET value = ? WHERE key = ?");

export function readSettings() {
	const rows = listSettings.all() as { key: string; value: string }[];
	return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Settings;
}

export const settings = new Hono()
	.get("/", (c) => c.json(readSettings()))
	.put("/", zValidator("json", settingsInput), (c) => {
		saveSetting.run(c.req.valid("json").review_time, "review_time");
		return c.json(readSettings());
	});
