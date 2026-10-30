import { Hono } from "hono";
import { addDays, startOfWeek, today } from "../shared/dates";
import { db } from "./db";

const ACTIVITY_WEEKS = 12;
const UPCOMING_DAYS = 7;

const countEntries = db.prepare("SELECT COUNT(*) AS n FROM entries");
const countRetired = db.prepare("SELECT COUNT(*) AS n FROM exercises WHERE retired = 1 AND cleared = 0");
const entriesByDay = db.prepare("SELECT date AS day, COUNT(*) AS n FROM entries WHERE date >= ? GROUP BY date");
const reviewsByDay = db.prepare(
	"SELECT reviewed_on AS day, COUNT(*) AS n FROM review_log WHERE reviewed_on >= ? GROUP BY reviewed_on",
);
const activeDays = db.prepare("SELECT date AS day FROM entries UNION SELECT reviewed_on FROM review_log");
const dueByDay = db.prepare(
	"SELECT due_date AS day, COUNT(*) AS n FROM exercises WHERE retired = 0 AND cleared = 0 AND due_date <= ? GROUP BY due_date",
);

type DayCount = { day: string; n: number };

// Consecutive active days ending today, or yesterday if today has nothing yet.
export function currentStreak(now: string) {
	const days = new Set((activeDays.all() as { day: string }[]).map((r) => r.day));
	let cursor = days.has(now) ? now : addDays(now, -1);
	let streak = 0;
	while (days.has(cursor)) {
		streak++;
		cursor = addDays(cursor, -1);
	}
	return streak;
}

export const stats = new Hono().get("/", (c) => {
	const now = today();
	const start = addDays(startOfWeek(now), -7 * (ACTIVITY_WEEKS - 1));

	const activity = new Map<string, number>();
	for (const { day, n } of [...entriesByDay.all(start), ...reviewsByDay.all(start)] as DayCount[]) {
		activity.set(day, (activity.get(day) ?? 0) + n);
	}

	// Overdue reviews are folded into today, since that's when they'll be done.
	const due = new Map<string, number>();
	for (const { day, n } of dueByDay.all(addDays(now, UPCOMING_DAYS - 1)) as DayCount[]) {
		const key = day < now ? now : day;
		due.set(key, (due.get(key) ?? 0) + n);
	}

	return c.json({
		entries: (countEntries.get() as { n: number }).n,
		retired: (countRetired.get() as { n: number }).n,
		streak: currentStreak(now),
		activity: Array.from({ length: ACTIVITY_WEEKS * 7 }, (_, i) => {
			const day = addDays(start, i);
			return { day, count: activity.get(day) ?? 0, future: day > now };
		}),
		upcoming: Array.from({ length: UPCOMING_DAYS }, (_, i) => {
			const day = addDays(now, i);
			return { day, count: due.get(day) ?? 0 };
		}),
	});
});
