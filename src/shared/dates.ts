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

export function formatDate(iso: string) {
	return parseDate(iso).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatTime(time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
