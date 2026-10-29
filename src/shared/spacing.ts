export type ReviewState = { interval_days: number; streak: number };
export type ReviewOutcome = ReviewState & { retired: boolean };

export const RETIRE_AFTER = 5;
const MISSED_INTERVAL = 1;

// Due date becomes today + interval_days, so 0 keeps the exercise in today's list.
export function nextReview(state: ReviewState, got: boolean): ReviewOutcome {
	if (got) {
		const streak = state.streak + 1;
		return { interval_days: Math.max(1, state.interval_days * 2), streak, retired: streak >= RETIRE_AFTER };
	}
	return { interval_days: MISSED_INTERVAL, streak: 0, retired: false };
}
