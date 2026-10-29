import { serve } from "@hono/node-server";
import { Hono } from "hono";
import "./db";

const port = Number(process.env.PORT ?? 8787);
const app = new Hono().basePath("/api");

serve({ fetch: app.fetch, port }, (info) => console.log(`API listening on http://localhost:${info.port}`));
