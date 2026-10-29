import { hc, type InferRequestType, type InferResponseType } from "hono/client";
import type { AppType } from "../server";

export const api = hc<AppType>(window.location.origin).api;

export type Entry = InferResponseType<typeof api.entries.$get>[number];
export type EntryInput = InferRequestType<typeof api.entries.$post>["json"];
export type DueExercise = InferResponseType<typeof api.reviews.due.$get>[number];
