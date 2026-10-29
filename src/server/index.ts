import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { startBackups } from "./backup";
import { chat } from "./chat";
import { entries } from "./entries";
import { planner } from "./planner";
import { startReminders } from "./reminders";
import { report } from "./report";
import { reviews } from "./reviews";
import { settings } from "./settings";
import { stats } from "./stats";
import { suggestions } from "./suggestions";

const port = Number(process.env.PORT ?? 8787);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocal(url: string) {
	try {
		return LOCAL_HOSTS.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

const api = new Hono()
	.basePath("/api")
	// Only this PC may use the API. The Host check stops a site that points its domain at 127.0.0.1 from reading it,
	// and the Origin check stops other sites' pages from sending it requests.
	.use(async (c, next) => {
		const origin = c.req.header("origin");
		if (!isLocal(`http://${c.req.header("host")}`) || (origin !== undefined && !isLocal(origin))) {
			return c.text("Forbidden", 403);
		}
		await next();
	})
	.route("/entries", entries)
	.route("/reviews", reviews)
	.route("/settings", settings)
	.route("/planner", planner)
	.route("/stats", stats)
	.route("/suggestions", suggestions)
	.route("/report", report)
	.route("/chat", chat);

export type AppType = typeof api;

const app = new Hono().route("/", api);

// --production also serves the built app, so Etch runs from this one server without the Vite dev server.
if (process.argv.includes("--production")) {
	app.use("*", async (c, next) => (c.req.path.startsWith("/api/") ? c.notFound() : next()));
	app.use("*", serveStatic({ root: "./dist/web" }));
	// Any other path is a page of the app; the browser-side router takes it from index.html.
	app.get("*", serveStatic({ path: "./dist/web/index.html" }));
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) =>
	console.log(`Etch listening on http://localhost:${info.port}`),
);
startReminders(port);
startBackups();
