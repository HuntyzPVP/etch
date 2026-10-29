import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, today } from "../shared/dates";
import { askAgent, log } from "./agent";
import { plannerSnapshot, recentLog, reviewResults } from "./context";
import { currentStreak } from "./stats";

const replySchema = z.object({ report: z.string().min(1) });

const SYSTEM_PROMPT = `You write a progress report for someone learning to program. They will paste it into a chat with an AI assistant to plan their career, so it must make sense on its own. You are given JSON with what they logged, how their spaced-repetition reviews went per topic and what they finished on their planner over a period.

Write it in the first person, as them, in Markdown: a one-line opening naming the period and dates, then short sections for what I studied, how my reviews went (with numbers, naming topics I keep missing), what I finished, and what seems to come next. Stick to the facts given and never invent progress. Keep it under 300 words.`;

const reportInput = z.object({ days: z.union([z.literal(7), z.literal(30)]) });

export const report = new Hono().post("/", zValidator("json", reportInput), async (c) => {
	const { days } = c.req.valid("json");
	const since = addDays(today(), -(days - 1));
	const entries = recentLog(since, 60, { withCode: false });
	const reviews = reviewResults(since);
	if (entries.length === 0 && reviews.length === 0) {
		return c.json({ error: "Nothing was logged or reviewed in this period." }, 400);
	}
	const material = {
		period: { days, from: since, to: today() },
		day_streak: currentStreak(today()),
		log: entries,
		review_results: reviews,
		finished_on_planner: plannerSnapshot(since).done,
	};
	try {
		return c.json(await askAgent(SYSTEM_PROMPT, material, replySchema));
	} catch (error) {
		log(`Report failed: ${error instanceof Error ? error.message : String(error)}`);
		return c.json({ error: "Couldn't write the report. Details are in data/generate.log." }, 500);
	}
});
