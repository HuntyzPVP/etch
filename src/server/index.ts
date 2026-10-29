import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { entries } from "./entries";

const port = Number(process.env.PORT ?? 8787);
const app = new Hono().basePath("/api").route("/entries", entries);

export type AppType = typeof app;

serve({ fetch: app.fetch, port }, (info) => console.log(`API listening on http://localhost:${info.port}`));
