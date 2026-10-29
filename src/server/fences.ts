import { type Language, languageFromFence } from "../shared/languages";

type Fence = { language: Language; code: string };

// Splits Markdown notes into the prose and the code fences inside it. An unclosed fence runs to the end, as in Markdown.
export function splitNotes(notes: string) {
	const prose: string[] = [];
	const fences: Fence[] = [];
	let open: { marker: string; language: Language; lines: string[] } | null = null;
	for (const line of notes.split(/\r?\n/)) {
		if (open) {
			const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
			if (close && close[1][0] === open.marker[0] && close[1].length >= open.marker.length) {
				fences.push({ language: open.language, code: open.lines.join("\n") });
				open = null;
			} else {
				open.lines.push(line);
			}
			continue;
		}
		const start = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
		if (start && !(start[1][0] === "`" && start[2].includes("`"))) {
			open = { marker: start[1], language: languageFromFence(start[2]), lines: [] };
		} else {
			prose.push(line);
		}
	}
	if (open) fences.push({ language: open.language, code: open.lines.join("\n") });
	return {
		prose: prose
			.join("\n")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim(),
		snippets: fences.filter((f) => f.code.trim() !== ""),
	};
}
