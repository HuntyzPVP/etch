import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { daysBetween, TIME_PATTERN, today } from "../shared/dates";
import { db, transaction } from "./db";

const settingsInput = z
	.object({
		frequency: z.enum(["daily", "every2", "weekly", "manual"]),
		daily_cap: z.enum(["10", "20", "30", "none"]),
		status: z.enum(["active", "busy", "away"]),
		available_days: z.array(z.number().int().min(0).max(6)).min(1),
		available_start: z.string().regex(TIME_PATTERN),
		available_end: z.string().regex(TIME_PATTERN),
		reminders: z.enum(["on", "off"]),
	})
	.refine((s) => s.available_end > s.available_start, { message: "Available hours must end after they start." });
export type Settings = z.infer<typeof settingsInput>;

const BUSY_CAP = 5;

const listSettings = db.prepare("SELECT key, value FROM settings");
const saveSetting = db.prepare(
	"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const shiftDueDates = db.prepare("UPDATE exercises SET due_date = date(due_date, ?) WHERE retired = 0");

// Picks only user-facing keys; the generator and Away mode keep bookkeeping rows in the same table.
export function readSettings(): Settings {
	const rows = listSettings.all() as { key: string; value: string }[];
	const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	return {
		frequency: v.frequency as Settings["frequency"],
		daily_cap: v.daily_cap as Settings["daily_cap"],
		status: v.status as Settings["status"],
		available_days: v.available_days.split(",").map(Number),
		available_start: v.available_start,
		available_end: v.available_end,
		reminders: v.reminders as Settings["reminders"],
	};
}

// How many graded reviews today's list may hold, before subtracting ones already done.
export function dailyLimit(s: Settings) {
	const cap = s.daily_cap === "none" ? Infinity : Number(s.daily_cap);
	return s.status === "busy" ? Math.min(cap, BUSY_CAP) : cap;
}

// Away freezes the schedule: on return, every due date moves forward by the days spent away.
function changeStatus(from: Settings["status"], to: Settings["status"]) {
	if (from === to) return;
	if (to === "away") {
		saveSetting.run("away_since", today());
		return;
	}
	if (from === "away") {
		const since = (getSetting.get("away_since") as { value: string } | undefined)?.value;
		const days = since ? daysBetween(since, today()) : 0;
		if (days > 0) shiftDueDates.run(`+${days} days`);
	}
}

export const settings = new Hono()
	.get("/", (c) => c.json(readSettings()))
	.put("/", zValidator("json", settingsInput), (c) => {
		const next = c.req.valid("json");
		transaction(() => {
			changeStatus(readSettings().status, next.status);
			saveSetting.run("frequency", next.frequency);
			saveSetting.run("daily_cap", next.daily_cap);
			saveSetting.run("status", next.status);
			saveSetting.run("available_days", [...new Set(next.available_days)].sort().join(","));
			saveSetting.run("available_start", next.available_start);
			saveSetting.run("available_end", next.available_end);
			saveSetting.run("reminders", next.reminders);
		});
		return c.json(readSettings());
	});
