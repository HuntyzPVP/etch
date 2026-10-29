// en-CA formats as YYYY-MM-DD in the local timezone, matching how dates are stored.
export const today = () => new Date().toLocaleDateString("en-CA");

export function addDays(iso: string, days: number) {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day + days).toLocaleDateString("en-CA");
}
