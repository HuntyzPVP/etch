import { hc, type InferRequestType, type InferResponseType } from "hono/client";
import { useEffect, useRef } from "react";
import type { AppType } from "../server";
import { inAvailableHours } from "../shared/dates";

export const api = hc<AppType>(window.location.origin).api;

export type Entry = InferResponseType<typeof api.entries.$get>[number];
export type EntryInput = InferRequestType<typeof api.entries.$post>["json"];
export type PlannerItem = InferResponseType<typeof api.planner.$get>[number];
export type PlannerInput = InferRequestType<typeof api.planner.$post>["json"];
export type DueExercise = InferResponseType<typeof api.reviews.due.$get>[number];
export type PracticeExercise = InferResponseType<typeof api.reviews.practice.$get>[number];
export type Stats = InferResponseType<typeof api.stats.$get>;
export type AppSettings = InferResponseType<typeof api.settings.$get>;
export type Suggestion = InferResponseType<typeof api.suggestions.$get>[number];
export type { ChatAction } from "../server/chat";

export async function fetchEntries() {
	const res = await api.entries.$get();
	return res.json();
}

// What to tell the user when saving a note fails.
export function entryProblem(status: number) {
	return status === 409
		? "There's already a note with this title. Open it and add to it instead."
		: "Couldn't save. Check the date and title.";
}

// Fired after Settings saves, so the top bar can refresh its status dot and badge.
export const SETTINGS_CHANGED = "etch-settings-changed";
// Fired when the assistant adds something, so the open page shows it.
export const DATA_CHANGED = "etch-data-changed";
// Fired when a [[link]] in a note is clicked; detail is the linked title.
export const OPEN_NOTE = "etch-open-note";

export function useDataChanged(reload: () => void) {
	const latest = useRef(reload);

	useEffect(() => {
		latest.current = reload;
	});

	useEffect(() => {
		const listener = () => latest.current();
		window.addEventListener(DATA_CHANGED, listener);
		return () => window.removeEventListener(DATA_CHANGED, listener);
	}, []);
}

// Reminders only nudge during available hours and never while Away; reviewing itself is always allowed.
export function isOnDuty(settings: AppSettings) {
	return (
		settings.status !== "away" &&
		inAvailableHours(settings.available_days, settings.available_start, settings.available_end)
	);
}
