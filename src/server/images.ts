import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

// Pasted screenshots. Like the database, they stay on this PC and out of git.
const DIR = process.env.IMAGES_DIR ?? "data/images";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
};
const TYPES = Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type]));

mkdirSync(DIR, { recursive: true });

const nameParam = z.object({ name: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/) });

export const images = new Hono()
	.post("/", bodyLimit({ maxSize: MAX_BYTES, onError: (c) => c.text("Image is over 10 MB", 413) }), async (c) => {
		const ext = EXTENSIONS[c.req.header("content-type") ?? ""];
		if (!ext) return c.text("Not a PNG, JPEG, GIF or WebP image", 415);
		const name = `${randomUUID()}.${ext}`;
		writeFileSync(join(DIR, name), Buffer.from(await c.req.arrayBuffer()));
		return c.json({ url: `/api/images/${name}` }, 201);
	})
	.get("/:name", zValidator("param", nameParam), (c) => {
		const { name } = c.req.valid("param");
		let file: Buffer;
		try {
			file = readFileSync(join(DIR, name));
		} catch {
			return c.notFound();
		}
		// A name is never reused, so the browser can keep its copy.
		return c.body(new Uint8Array(file), 200, {
			"Content-Type": TYPES[name.split(".")[1]],
			"Cache-Control": "public, max-age=31536000, immutable",
		});
	});
