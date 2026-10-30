import { EditorSelection, type EditorState, type Line } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export const COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;
export const CALLOUTS = ["note", "tip", "warning", "danger", "question"] as const;

// Wraps each selection in open/close, or unwraps it when it's already wrapped. With nothing selected, the cursor lands between.
export function toggleWrap(open: string, close = open) {
	return (view: EditorView) => {
		const { state } = view;
		view.dispatch(
			state.changeByRange((range) => {
				const before = state.sliceDoc(range.from - open.length, range.from);
				const after = state.sliceDoc(range.to, range.to + close.length);
				if (before === open && after === close) {
					return {
						changes: [
							{ from: range.from - open.length, to: range.from },
							{ from: range.to, to: range.to + close.length },
						],
						range: EditorSelection.range(range.from - open.length, range.to - open.length),
					};
				}
				const inner = state.sliceDoc(range.from, range.to);
				if (inner.length > open.length + close.length && inner.startsWith(open) && inner.endsWith(close)) {
					const unwrapped = inner.slice(open.length, inner.length - close.length);
					return {
						changes: { from: range.from, to: range.to, insert: unwrapped },
						range: EditorSelection.range(range.from, range.from + unwrapped.length),
					};
				}
				return {
					changes: [
						{ from: range.from, insert: open },
						{ from: range.to, insert: close },
					],
					range: EditorSelection.range(range.from + open.length, range.to + open.length),
				};
			}),
		);
		return true;
	};
}

export const highlight = (color: (typeof COLORS)[number]) =>
	color === "yellow" ? toggleWrap("==") : toggleWrap(`<mark data-color="${color}">`, "</mark>");

export const textColor = (color: (typeof COLORS)[number]) => toggleWrap(`<span data-color="${color}">`, "</span>");

function selectedLines(state: EditorState) {
	const lines = new Map<number, Line>();
	for (const range of state.selection.ranges) {
		for (let n = state.doc.lineAt(range.from).number; n <= state.doc.lineAt(range.to).number; n++) {
			lines.set(n, state.doc.line(n));
		}
	}
	return [...lines.values()];
}

// 0 turns the lines back into normal text.
export function setHeading(level: number) {
	return (view: EditorView) => {
		const changes = selectedLines(view.state).map((line) => {
			const old = line.text.match(/^#{1,6}\s+/)?.[0] ?? "";
			return { from: line.from, to: line.from + old.length, insert: level > 0 ? `${"#".repeat(level)} ` : "" };
		});
		view.dispatch({ changes });
		return true;
	};
}

const LIST_PREFIX = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+[.)] )?/;
const IS_LIST = {
	bullet: /^\s*[-*+] (?!\[[ xX]\] )/,
	number: /^\s*\d+[.)] /,
	task: /^\s*[-*+] \[[ xX]\] /,
};

// Turns the selected lines into one kind of list, or back into plain lines if they already are that kind.
export function toggleList(kind: keyof typeof IS_LIST) {
	return (view: EditorView) => {
		const lines = selectedLines(view.state);
		const remove = lines.every((line) => IS_LIST[kind].test(line.text));
		const changes = lines.map((line, i) => {
			const [, indent, old = ""] = line.text.match(LIST_PREFIX)!;
			const prefix = kind === "bullet" ? "- " : kind === "number" ? `${i + 1}. ` : "- [ ] ";
			return {
				from: line.from + indent.length,
				to: line.from + indent.length + old.length,
				insert: remove ? "" : prefix,
			};
		});
		view.dispatch({ changes });
		return true;
	};
}

export function toggleQuote(view: EditorView) {
	const lines = selectedLines(view.state);
	const remove = lines.every((line) => /^\s*> ?/.test(line.text));
	const changes = lines.map((line) => {
		const old = line.text.match(/^\s*> ?/)?.[0] ?? "";
		return { from: line.from, to: line.from + old.length, insert: remove ? "" : "> " };
	});
	view.dispatch({ changes });
	return true;
}

// Replaces the main selection with a block that sits on its own lines; the cursor goes to `cursor` within it.
function insertBlock(view: EditorView, block: string, cursor: number) {
	const { from, to } = view.state.selection.main;
	const before = from === view.state.doc.lineAt(from).from ? "" : "\n";
	const after = to === view.state.doc.lineAt(to).to ? "" : "\n";
	const insert = before + block + after;
	view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + before.length + cursor } });
	return true;
}

export function insertCodeBlock(view: EditorView) {
	const { from, to } = view.state.selection.main;
	const code = view.state.sliceDoc(from, to);
	// The cursor lands right after the backticks so the language can be typed.
	return insertBlock(view, `\`\`\`bash\n${code}\n\`\`\``, 3);
}

// Dividers and tables need blank lines around them, or Markdown reads a divider as a heading underline
// and a table as part of the text beside it.
function insertStandalone(view: EditorView, block: string) {
	const { state } = view;
	const { from, to } = state.selection.main;
	const start = state.doc.lineAt(from);
	const end = state.doc.lineAt(to);
	const lineAbove = start.number > 1 ? state.doc.line(start.number - 1).text : "";
	const lineBelow = end.number < state.doc.lines ? state.doc.line(end.number + 1).text : "";
	const textBefore = state.sliceDoc(start.from, from).trim();
	const textAfter = state.sliceDoc(to, end.to).trim();
	const before = textBefore ? "\n\n" : lineAbove.trim() ? "\n" : "";
	const after = textAfter || lineBelow.trim() ? "\n\n" : "\n";
	const insert = before + block + after;
	view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + before.length + block.length + 1 } });
	return true;
}

export const insertDivider = (view: EditorView) => insertStandalone(view, "---");

// rows counts the header row.
export function insertTable(rows: number, columns: number) {
	return (view: EditorView) => {
		const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
		const header = row(Array.from({ length: columns }, (_, i) => `Column ${i + 1}`));
		const divider = row(Array<string>(columns).fill("---"));
		const body = Array.from({ length: rows - 1 }, () => row(Array<string>(columns).fill(" ")));
		return insertStandalone(view, [header, divider, ...body].join("\n"));
	};
}

export function insertCallout(kind: (typeof CALLOUTS)[number]) {
	return (view: EditorView) => {
		const { from, to } = view.state.selection.main;
		const body = view.state.sliceDoc(from, to);
		const lines = (body || "").split("\n").map((line) => `> ${line}`);
		const block = `> [!${kind}]\n${lines.join("\n")}`;
		return insertBlock(view, block, block.length);
	};
}

// Selected words become the link's shown text, so "this scan" can point at the note "Nmap".
export function insertLink(view: EditorView, title: string) {
	const { from, to } = view.state.selection.main;
	const shown = view.state.sliceDoc(from, to).trim();
	const insert = shown && shown !== title ? `[[${title}|${shown}]]` : `[[${title}]]`;
	view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
}

// Uploads each image and puts a link to it on its own line at the given spot.
export async function insertImages(view: EditorView, files: File[], at: number) {
	for (const file of files) {
		const res = await fetch("/api/images", { method: "POST", headers: { "Content-Type": file.type }, body: file });
		if (!res.ok || !view.dom.isConnected) continue;
		const { url } = (await res.json()) as { url: string };
		const pos = Math.min(at, view.state.doc.length);
		const text = `${pos === view.state.doc.lineAt(pos).from ? "" : "\n"}![](${url})\n`;
		view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
		at = pos + text.length;
	}
}
