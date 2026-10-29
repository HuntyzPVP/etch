import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
	HighlightStyle,
	Language as EditorLanguage,
	LanguageSupport,
	syntaxHighlighting,
	syntaxTree,
} from "@codemirror/language";
import { Facet, Prec, type Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
	keymap,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useState } from "react";
import { languageFromFence } from "../shared/languages";
import { LINK, titleKey } from "../shared/links";
import { OPEN_NOTE } from "./api";
import { codeHighlighting } from "./CodeBlock";
import { LANGUAGE_INFO } from "./codeLanguages";
import { highlight, insertCodeBlock, insertImages, setHeading, toggleList, toggleWrap } from "./markdownCommands";
import { NoteToolbar, OPEN_LINK_PICKER } from "./NoteToolbar";

// Titles of existing notes, for [[link]] suggestions and for marking links to notes that don't exist yet.
const noteTitles = Facet.define<readonly string[], readonly string[]>({ combine: (values) => values.flat() });

const HIDDEN_MARKS = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "QuoteMark"]);

// Underline, highlights and text color aren't Markdown, so they're stored as small HTML tags (or ==text==) and found by pattern.
const INLINE_STYLES: { pattern: RegExp; close: number; className: (m: RegExpMatchArray) => string }[] = [
	{ pattern: /<u>(.+?)<\/u>/g, close: 4, className: () => "md-underline" },
	{ pattern: /==([^=\n]+?)==/g, close: 2, className: () => "md-highlight yellow" },
	{ pattern: /<mark data-color="(\w+)">(.+?)<\/mark>/g, close: 7, className: (m) => `md-highlight ${m[1]}` },
	{ pattern: /<span data-color="(\w+)">(.+?)<\/span>/g, close: 7, className: (m) => `md-color ${m[1]}` },
];

const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);

// Highlights the code inside a fence in the language named after its backticks.
function fenceLanguage(info: string) {
	const extension = LANGUAGE_INFO[languageFromFence(info)].extension();
	if (extension instanceof LanguageSupport) return extension.language;
	return extension instanceof EditorLanguage ? extension : null;
}

class Label extends WidgetType {
	constructor(
		readonly text: string,
		readonly className: string,
	) {
		super();
	}
	toDOM() {
		const span = document.createElement("span");
		span.className = this.className;
		span.textContent = this.text;
		return span;
	}
	eq(other: Label) {
		return other.text === this.text && other.className === this.className;
	}
}

class ImageWidget extends WidgetType {
	constructor(
		readonly src: string,
		readonly alt: string,
	) {
		super();
	}
	toDOM(view: EditorView) {
		const img = document.createElement("img");
		img.className = "md-image";
		img.src = this.src;
		img.alt = this.alt;
		// The editor measured the line before the picture loaded.
		img.onload = () => view.requestMeasure();
		return img;
	}
	eq(other: ImageWidget) {
		return other.src === this.src && other.alt === this.alt;
	}
}

class Checkbox extends WidgetType {
	constructor(readonly checked: boolean) {
		super();
	}
	toDOM(view: EditorView) {
		const box = document.createElement("input");
		box.type = "checkbox";
		box.className = "md-checkbox";
		box.checked = this.checked;
		box.disabled = view.state.readOnly;
		box.addEventListener("mousedown", (event) => {
			event.preventDefault();
			if (view.state.readOnly) return;
			// The widget stands in for "[ ]", so the character inside is one past its start.
			const at = view.posAtDOM(box) + 1;
			view.dispatch({ changes: { from: at, to: at + 1, insert: this.checked ? " " : "x" } });
		});
		return box;
	}
	eq(other: Checkbox) {
		return other.checked === this.checked;
	}
}

const IMAGE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)$/;

const bullet = Decoration.replace({ widget: new Label("•", "md-bullet") });
const divider = Decoration.replace({ widget: new Label("", "md-hr") });
const hidden = Decoration.replace({});
const inlineCode = Decoration.mark({ class: "md-inline-code" });
const fenceLine = (extra = "") => Decoration.line({ class: `md-fence ${extra}`.trim() });

// Markdown symbols stay visible only on the lines you're editing, so the rest reads like the finished note.
function previewDecorations(view: EditorView): DecorationSet {
	const { state } = view;
	const { doc } = state;
	const active = new Set<number>();
	if (view.hasFocus) {
		for (const range of state.selection.ranges) {
			for (let n = doc.lineAt(range.from).number; n <= doc.lineAt(range.to).number; n++) active.add(n);
		}
	}
	const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
	const ranges: Range<Decoration>[] = [];
	const fenceLines = new Set<number>();
	// Notes are short, so the whole tree is walked rather than just the visible part.
	syntaxTree(state).iterate({
		enter: (node) => {
			if (node.name === "FencedCode") {
				const first = doc.lineAt(node.from);
				const last = doc.lineAt(node.to);
				const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
				let editing = false;
				for (let n = first.number; n <= last.number; n++) {
					if (active.has(n)) editing = true;
					fenceLines.add(n);
					const line = doc.line(n);
					const edge = n === first.number ? "md-fence-open" : n === last.number && closed ? "md-fence-close" : "";
					ranges.push(fenceLine(edge).range(line.from));
				}
				if (!editing) {
					const info = first.text.replace(/^\s*(`{3,}|~{3,})/, "");
					const label = new Label(LANGUAGE_INFO[languageFromFence(info)].label, "md-fence-label");
					ranges.push(Decoration.replace({ widget: label }).range(first.from, first.to));
					if (closed) ranges.push(hidden.range(last.from, last.to));
				}
				return false;
			}
			if (node.name === "Blockquote") {
				const first = doc.lineAt(node.from);
				const last = doc.lineAt(node.to);
				const callout = first.text.match(/^\s*>\s*\[!(\w+)\]/);
				const kind = callout?.[1].toLowerCase();
				for (let n = first.number; n <= last.number; n++) {
					const title = n === first.number ? " md-callout-title" : "";
					const className = kind ? `md-quote md-callout ${kind}${title}` : "md-quote";
					ranges.push(Decoration.line({ class: className }).range(doc.line(n).from));
				}
				if (callout && kind && !active.has(first.number)) {
					const start = first.from + callout[0].indexOf("[");
					const label = new Label(capitalize(kind), "md-callout-label");
					ranges.push(Decoration.replace({ widget: label }).range(start, first.from + callout[0].length));
				}
				return;
			}
			if (node.name === "Task") {
				const marker = node.node.getChild("TaskMarker");
				if (!marker) return;
				const checked = /x/i.test(state.sliceDoc(marker.from, marker.to));
				if (checked) ranges.push(Decoration.mark({ class: "md-task-done" }).range(marker.to, node.to));
				if (!isActive(marker.from)) {
					ranges.push(Decoration.replace({ widget: new Checkbox(checked) }).range(marker.from, marker.to));
				}
				return;
			}
			if (node.name === "InlineCode") ranges.push(inlineCode.range(node.from, node.to));
			if (isActive(node.from)) return;
			if (node.name === "Image") {
				const match = state.sliceDoc(node.from, node.to).match(IMAGE);
				if (match) {
					ranges.push(Decoration.replace({ widget: new ImageWidget(match[2], match[1]) }).range(node.from, node.to));
				}
				return false;
			}
			if (node.name === "HorizontalRule") {
				ranges.push(divider.range(node.from, node.to));
			} else if (node.name === "ListMark" && "-*+".includes(state.sliceDoc(node.from, node.to))) {
				// A checklist item shows just its box, not a bullet too.
				if (/^ \[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 4))) ranges.push(hidden.range(node.from, node.to + 1));
				else ranges.push(bullet.range(node.from, node.to));
			} else if (HIDDEN_MARKS.has(node.name)) {
				const spaced = node.name === "HeaderMark" || node.name === "QuoteMark";
				const end = spaced && state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
				ranges.push(hidden.range(node.from, end));
			}
		},
	});
	const known = new Set(state.facet(noteTitles).map(titleKey));
	for (let n = 1; n <= doc.lines; n++) {
		if (fenceLines.has(n)) continue;
		const line = doc.line(n);
		for (const match of line.text.matchAll(LINK)) {
			const start = line.from + match.index;
			const end = start + match[0].length;
			const title = match[1].trim();
			const link = Decoration.mark({
				class: known.has(titleKey(title)) ? "md-wikilink" : "md-wikilink missing",
				attributes: { "data-title": title },
			});
			if (active.has(n)) {
				ranges.push(link.range(start, end));
				continue;
			}
			const bar = match[0].indexOf("|");
			const textFrom = bar === -1 ? start + 2 : start + bar + 1;
			ranges.push(hidden.range(start, textFrom), link.range(textFrom, end - 2), hidden.range(end - 2, end));
		}
		for (const style of INLINE_STYLES) {
			for (const match of line.text.matchAll(style.pattern)) {
				const start = line.from + match.index;
				const end = start + match[0].length;
				const content = match[match.length - 1];
				const mark = Decoration.mark({ class: style.className(match) });
				if (active.has(n)) {
					ranges.push(mark.range(start, end));
					continue;
				}
				const textFrom = end - style.close - content.length;
				ranges.push(
					hidden.range(start, textFrom),
					mark.range(textFrom, end - style.close),
					hidden.range(end - style.close, end),
				);
			}
		}
	}
	return Decoration.set(ranges, true);
}

function linkCompletions(context: CompletionContext) {
	const typed = context.matchBefore(/\[\[[^[\]\n]*/);
	if (!typed) return null;
	return {
		from: typed.from + 2,
		validFor: /^[^[\]\n]*$/,
		options: context.state.facet(noteTitles).map((title) => ({
			label: title,
			apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
				const closed = view.state.sliceDoc(to, to + 2) === "]]";
				const insert = closed ? title : `${title}]]`;
				view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + title.length + 2 } });
			},
		})),
	};
}

// A click opens the linked note when reading; while editing it takes Ctrl+click, so a plain click can still place the cursor.
const linkClicks = EditorView.domEventHandlers({
	mousedown(event, view) {
		const link = (event.target as HTMLElement).closest<HTMLElement>(".md-wikilink");
		if (!link?.dataset.title || !(view.state.readOnly || event.ctrlKey || event.metaKey)) return false;
		event.preventDefault();
		window.dispatchEvent(new CustomEvent(OPEN_NOTE, { detail: link.dataset.title }));
		return true;
	},
});

function imageFiles(data: DataTransfer | null) {
	return [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"));
}

const imageDrop = EditorView.domEventHandlers({
	paste(event, view) {
		const files = imageFiles(event.clipboardData);
		if (files.length === 0) return false;
		event.preventDefault();
		void insertImages(view, files, view.state.selection.main.head);
		return true;
	},
	drop(event, view) {
		const files = imageFiles(event.dataTransfer);
		if (files.length === 0) return false;
		event.preventDefault();
		const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
		void insertImages(view, files, at);
		return true;
	},
});

const livePreview = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = previewDecorations(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.selectionSet ||
				update.viewportChanged ||
				update.focusChanged ||
				update.startState.facet(noteTitles) !== update.state.facet(noteTitles) ||
				syntaxTree(update.startState) !== syntaxTree(update.state)
			) {
				this.decorations = previewDecorations(update.view);
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);

const openLinkPicker = (view: EditorView) => view.dom.dispatchEvent(new CustomEvent(OPEN_LINK_PICKER));

// Above the default keymap, which uses some of these (Mod-i selects syntax, for one).
const formattingKeys = Prec.high(
	keymap.of([
		{ key: "Mod-b", run: toggleWrap("**") },
		{ key: "Mod-i", run: toggleWrap("_") },
		{ key: "Mod-u", run: toggleWrap("<u>", "</u>") },
		{ key: "Mod-Shift-x", run: toggleWrap("~~") },
		{ key: "Mod-Shift-h", run: highlight("yellow") },
		{ key: "Mod-e", run: toggleWrap("`") },
		{ key: "Mod-Shift-e", run: insertCodeBlock },
		{ key: "Mod-k", run: openLinkPicker },
		{ key: "Mod-0", run: setHeading(0) },
		{ key: "Mod-1", run: setHeading(1) },
		{ key: "Mod-2", run: setHeading(2) },
		{ key: "Mod-3", run: setHeading(3) },
		{ key: "Mod-Shift-8", run: toggleList("bullet") },
		{ key: "Mod-Shift-7", run: toggleList("number") },
		{ key: "Mod-Shift-9", run: toggleList("task") },
	]),
);

const markdownTheme = [
	EditorView.theme({
		"&.cm-focused": { outline: "none" },
		".cm-content": { fontFamily: "var(--font-sans)", caretColor: "var(--accent)", padding: "0" },
		".cm-line": { padding: "0" },
		".cm-cursor": { borderLeftColor: "var(--accent)" },
		".cm-placeholder": { color: "var(--muted)" },
		"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
			backgroundColor: "var(--selection)",
		},
	}),
	syntaxHighlighting(
		HighlightStyle.define([
			{ tag: t.heading1, fontSize: "1.6em", fontWeight: "700" },
			{ tag: t.heading2, fontSize: "1.3em", fontWeight: "700" },
			{ tag: t.heading3, fontSize: "1.12em", fontWeight: "650" },
			{ tag: [t.heading4, t.heading5, t.heading6], fontWeight: "650" },
			{ tag: t.strong, fontWeight: "700" },
			{ tag: t.emphasis, fontStyle: "italic" },
			{ tag: t.strikethrough, textDecoration: "line-through" },
			{ tag: t.monospace, fontFamily: "var(--font-mono)" },
			{ tag: t.link, color: "var(--accent)" },
			{ tag: t.url, color: "var(--muted)" },
			{ tag: t.processingInstruction, color: "var(--muted)" },
		]),
	),
	codeHighlighting,
];

type Props = {
	value: string;
	// Leaving this out makes the note read-only.
	onChange?: (value: string) => void;
	placeholder?: string;
	minHeight?: string;
	titles?: readonly string[];
};

const NO_TITLES: readonly string[] = [];

export function MarkdownEditor({ value, onChange, placeholder, minHeight, titles = NO_TITLES }: Props) {
	const editable = onChange !== undefined;
	const [view, setView] = useState<EditorView | null>(null);

	const extensions = useMemo(
		() => [
			noteTitles.of(titles),
			autocompletion({ override: [linkCompletions], icons: false }),
			linkClicks,
			markdown({ base: markdownLanguage, codeLanguages: fenceLanguage }),
			livePreview,
			EditorView.lineWrapping,
			imageDrop,
			formattingKeys,
		],
		[titles],
	);

	const editor = (
		<CodeMirror
			className={editable ? "md-body" : "md-view"}
			value={value}
			onChange={onChange}
			onCreateEditor={editable ? setView : undefined}
			extensions={extensions}
			theme={markdownTheme}
			editable={editable}
			readOnly={!editable}
			placeholder={placeholder}
			minHeight={minHeight}
			basicSetup={{
				lineNumbers: false,
				foldGutter: false,
				highlightActiveLine: false,
				highlightActiveLineGutter: false,
				closeBrackets: false,
				autocompletion: false,
			}}
		/>
	);
	if (!editable) return editor;

	const words = value.trim() ? value.trim().split(/\s+/).length : 0;
	return (
		<div className="md-editor">
			<NoteToolbar view={view} titles={titles} words={words} />
			{editor}
		</div>
	);
}

// A rough plain-text version for short previews, without code blocks, pictures or formatting tags.
export function markdownToPlain(text: string) {
	let inFence = false;
	const prose = text.split("\n").filter((line) => {
		if (/^\s*(`{3,}|~{3,})/.test(line)) {
			inFence = !inFence;
			return false;
		}
		return !inFence;
	});
	return prose
		.join("\n")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(LINK, (link: string, title: string) => link.split("|")[1]?.slice(0, -2) || title)
		.replace(/<\/?(u|mark|span)\b[^>]*>|==|\[![a-z]+\]|\[[ xX]\] /gi, "")
		.replace(/^\s*(#{1,6}|>|[-*+]|-{3,})\s*|\*\*|(?<!\w)_|_(?!\w)|[*`~]/gm, "")
		.trim();
}
