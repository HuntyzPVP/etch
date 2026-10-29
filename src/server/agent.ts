import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { z } from "zod";

// Long enough for a big batch of exercises; a hung run is killed so nothing waits on it forever.
const TIMEOUT_MS = 5 * 60 * 1000;

export function log(message: string) {
	appendFileSync("data/generate.log", `${new Date().toLocaleString()}  ${message}\n`);
}

// The connected agent is Claude Code. No tools, MCP servers, settings or skills: keeps each run small and limits it
// to replying with JSON that matches the schema.
function runClaude(system: string, input: string, schema: z.ZodType) {
	const args = [
		"-p",
		"--model",
		"sonnet",
		"--tools",
		"",
		"--strict-mcp-config",
		"--setting-sources",
		"",
		"--disable-slash-commands",
		"--no-session-persistence",
		"--system-prompt",
		system,
		"--output-format",
		"json",
		"--json-schema",
		JSON.stringify(z.toJSONSchema(schema, { target: "draft-7" })),
	];
	return new Promise<string>((resolve, reject) => {
		const child = spawn("claude", args, { timeout: TIMEOUT_MS });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (code === 0) resolve(stdout);
			else if (signal) reject(new Error(`claude was stopped (${signal}), likely after ${TIMEOUT_MS / 60000} minutes`));
			else reject(new Error(stderr.trim() || `claude exited with code ${code}`));
		});
		child.stdin.end(input);
	});
}

export async function askAgent<T extends z.ZodType>(system: string, input: unknown, schema: T): Promise<z.output<T>> {
	const reply = JSON.parse(await runClaude(system, JSON.stringify(input), schema)) as {
		is_error: boolean;
		result: string;
		structured_output?: unknown;
	};
	if (reply.is_error) throw new Error(`Claude returned an error: ${reply.result}`);
	return schema.parse(reply.structured_output);
}
