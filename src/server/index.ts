import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { entries } from "./entries";
import { planner } from "./planner";
import { reviews } from "./reviews";
import { settings } from "./settings";

const port = Number(process.env.PORT ?? 8787);
const app = new Hono()
	.basePath("/api")
	.route("/entries", entries)
	.route("/reviews", reviews)
	.route("/settings", settings)
	.route("/planner", planner);

export type AppType = typeof app;

serve({ fetch: app.fetch, port }, (info) => console.log(`API listening on http://localhost:${info.port}`));
