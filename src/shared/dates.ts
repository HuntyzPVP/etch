// en-CA formats as YYYY-MM-DD in the local timezone, matching how dates are stored.
export const today = () => new Date().toLocaleDateString("en-CA");

// 24-hour HH:MM.
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDate(iso: string) {
	// Built from parts because new Date("2026-10-28") is read as UTC midnight and lands on the previous day in US timezones.
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day);
}

export function addDays(iso: string, days: number) {
	const date = parseDate(iso);
	date.setDate(date.getDate() + days);
	return date.toLocaleDateString("en-CA");
}

// Weeks start on Monday.
export function startOfWeek(iso: string) {
	return addDays(iso, -((parseDate(iso).getDay() + 6) % 7));
}

export function formatDate(
	iso: string,
	options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" },
) {
	return parseDate(iso).toLocaleDateString(undefined, options);
}

export function formatTime(time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function addMonths(iso: string, months: number) {
	const date = parseDate(iso);
	date.setDate(1);
	date.setMonth(date.getMonth() + months);
	return date.toLocaleDateString("en-CA");
}

export function daysBetween(from: string, to: string) {
	return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

// days uses getDay() numbering: 0 is Sunday.
export function inAvailableHours(days: number[], start: string, end: string, now = new Date()) {
	const time = now.toTimeString().slice(0, 5);
	return days.includes(now.getDay()) && time >= start && time < end;
}
