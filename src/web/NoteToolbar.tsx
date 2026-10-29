import { redo, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import {
	Baseline,
	Bold,
	ChevronDown,
	Code,
	Heading,
	Highlighter,
	ImagePlus,
	Info,
	Italic,
	Link,
	List,
	ListOrdered,
	ListTodo,
	Minus,
	Plus,
	Redo2,
	SquareCode,
	Strikethrough,
	TextQuote,
	Underline,
	Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { titleKey } from "../shared/links";
import {
	CALLOUTS,
	COLORS,
	highlight,
	insertCallout,
	insertCodeBlock,
	insertDivider,
	insertImages,
	insertLink,
	setHeading,
	textColor,
	toggleList,
	toggleQuote,
	toggleWrap,
} from "./markdownCommands";

// Fired on the editor by Ctrl+K.
export const OPEN_LINK_PICKER = "etch-open-link-picker";

const ICON = 16;
const HEADINGS = [
	{ level: 0, label: "Normal text", keys: "Ctrl+0" },
	{ level: 1, label: "Big heading", keys: "Ctrl+1" },
	{ level: 2, label: "Medium heading", keys: "Ctrl+2" },
	{ level: 3, label: "Small heading", keys: "Ctrl+3" },
];
const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);

// Buttons keep the editor's focus and selection instead of taking them.
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

function Tool({
	label,
	keys,
	onClick,
	children,
}: {
	label: string;
	keys?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className="tool"
			title={keys ? `${label} (${keys})` : label}
			aria-label={label}
			onMouseDown={keepFocus}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function Menu({
	label,
	icon,
	open,
	onOpenChange,
	chevron = true,
	children,
}: {
	label: string;
	icon: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	chevron?: boolean;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) onOpenChange(false);
		};
		document.addEventListener("pointerdown", close);
		return () => document.removeEventListener("pointerdown", close);
	}, [open, onOpenChange]);

	return (
		<div className="tool-menu" ref={ref}>
			<button
				type="button"
				className={open ? "tool open" : "tool"}
				title={label}
				aria-label={label}
				aria-expanded={open}
				onMouseDown={keepFocus}
				onClick={() => onOpenChange(!open)}
			>
				{icon}
				{chevron && <ChevronDown size={11} />}
			</button>
			{open && <div className="picker-pop align-start tool-pop">{children}</div>}
		</div>
	);
}

function LinkPicker({ view, titles, onDone }: { view: EditorView; titles: readonly string[]; onDone: () => void }) {
	const { from, to } = view.state.selection.main;
	const [query, setQuery] = useState(() => view.state.sliceDoc(from, to).trim());
	const [active, setActive] = useState(0);
	const typed = query.trim();
	const matches = titles.filter((t) => titleKey(t).includes(titleKey(typed))).slice(0, 8);
	const exact = titles.some((t) => titleKey(t) === titleKey(typed));
	const options = typed && !exact ? [...matches, typed] : matches;

	function choose(title: string) {
		insertLink(view, title);
		onDone();
		view.focus();
	}

	return (
		<div className="link-picker">
			<input
				autoFocus
				placeholder="Find a note…"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
				}}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, options.length - 1));
					else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
					else if (e.key === "Enter" && options[active]) choose(options[active]);
					else if (e.key === "Escape") {
						onDone();
						view.focus();
					} else return;
					e.preventDefault();
				}}
			/>
			{options.length === 0 && <p className="hint">No notes yet. Type a title to link a new one.</p>}
			<ul>
				{options.map((title, i) => (
					<li key={title}>
						<button
							type="button"
							className={i === active ? "active" : ""}
							onMouseDown={keepFocus}
							onMouseEnter={() => setActive(i)}
							onClick={() => choose(title)}
						>
							{i === matches.length ? (
								<>
									<Plus size={14} /> New note “{title}”
								</>
							) : (
								title
							)}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

export function NoteToolbar({
	view,
	titles,
	words,
}: {
	view: EditorView | null;
	titles: readonly string[];
	words: number;
}) {
	const [menu, setMenu] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!view) return;
		const open = () => setMenu("link");
		view.dom.addEventListener(OPEN_LINK_PICKER, open);
		return () => view.dom.removeEventListener(OPEN_LINK_PICKER, open);
	}, [view]);

	if (!view) return null;

	const run = (command: (view: EditorView) => boolean) => () => {
		command(view);
		setMenu(null);
		view.focus();
	};
	const menuProps = (name: string) => ({
		open: menu === name,
		onOpenChange: (open: boolean) => setMenu(open ? name : null),
	});

	return (
		<div className="md-toolbar" role="toolbar" aria-label="Formatting">
			<Tool label="Undo" keys="Ctrl+Z" onClick={run(undo)}>
				<Undo2 size={ICON} />
			</Tool>
			<Tool label="Redo" keys="Ctrl+Y" onClick={run(redo)}>
				<Redo2 size={ICON} />
			</Tool>
			<span className="tool-gap" />
			<Menu label="Text size" icon={<Heading size={ICON} />} {...menuProps("heading")}>
				{HEADINGS.map((h) => (
					<button
						key={h.level}
						type="button"
						className={`menu-item heading-${h.level}`}
						onMouseDown={keepFocus}
						onClick={run(setHeading(h.level))}
					>
						{h.label}
						<kbd>{h.keys}</kbd>
					</button>
				))}
			</Menu>
			<span className="tool-gap" />
			<Tool label="Bold" keys="Ctrl+B" onClick={run(toggleWrap("**"))}>
				<Bold size={ICON} />
			</Tool>
			<Tool label="Italic" keys="Ctrl+I" onClick={run(toggleWrap("_"))}>
				<Italic size={ICON} />
			</Tool>
			<Tool label="Underline" keys="Ctrl+U" onClick={run(toggleWrap("<u>", "</u>"))}>
				<Underline size={ICON} />
			</Tool>
			<Tool label="Strikethrough" keys="Ctrl+Shift+X" onClick={run(toggleWrap("~~"))}>
				<Strikethrough size={ICON} />
			</Tool>
			<Menu label="Highlight (Ctrl+Shift+H for yellow)" icon={<Highlighter size={ICON} />} {...menuProps("highlight")}>
				<div className="swatches">
					{COLORS.map((color) => (
						<button
							key={color}
							type="button"
							className={`swatch md-highlight ${color}`}
							title={capitalize(color)}
							aria-label={`${capitalize(color)} highlight`}
							onMouseDown={keepFocus}
							onClick={run(highlight(color))}
						>
							A
						</button>
					))}
				</div>
			</Menu>
			<Menu label="Text color" icon={<Baseline size={ICON} />} {...menuProps("color")}>
				<div className="swatches">
					{COLORS.map((color) => (
						<button
							key={color}
							type="button"
							className={`swatch md-color ${color}`}
							title={capitalize(color)}
							aria-label={`${capitalize(color)} text`}
							onMouseDown={keepFocus}
							onClick={run(textColor(color))}
						>
							A
						</button>
					))}
				</div>
			</Menu>
			<span className="tool-gap" />
			<Tool label="Bullet list" keys="Ctrl+Shift+8" onClick={run(toggleList("bullet"))}>
				<List size={ICON} />
			</Tool>
			<Tool label="Numbered list" keys="Ctrl+Shift+7" onClick={run(toggleList("number"))}>
				<ListOrdered size={ICON} />
			</Tool>
			<Tool label="Checklist" keys="Ctrl+Shift+9" onClick={run(toggleList("task"))}>
				<ListTodo size={ICON} />
			</Tool>
			<span className="tool-gap" />
			<Menu label="Link to a note (Ctrl+K)" icon={<Link size={ICON} />} chevron={false} {...menuProps("link")}>
				<LinkPicker view={view} titles={titles} onDone={() => setMenu(null)} />
			</Menu>
			<Tool label="Inline code" keys="Ctrl+E" onClick={run(toggleWrap("`"))}>
				<Code size={ICON} />
			</Tool>
			<Tool label="Code block" keys="Ctrl+Shift+E" onClick={run(insertCodeBlock)}>
				<SquareCode size={ICON} />
			</Tool>
			<Tool label="Quote" onClick={run(toggleQuote)}>
				<TextQuote size={ICON} />
			</Tool>
			<Menu label="Callout box" icon={<Info size={ICON} />} {...menuProps("callout")}>
				{CALLOUTS.map((kind) => (
					<button
						key={kind}
						type="button"
						className={`menu-item callout-item ${kind}`}
						onMouseDown={keepFocus}
						onClick={run(insertCallout(kind))}
					>
						{capitalize(kind)}
					</button>
				))}
			</Menu>
			<Tool label="Divider" onClick={run(insertDivider)}>
				<Minus size={ICON} />
			</Tool>
			<Tool label="Insert image (or paste one)" onClick={() => fileInput.current?.click()}>
				<ImagePlus size={ICON} />
			</Tool>
			<input
				ref={fileInput}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				multiple
				hidden
				onChange={(e) => {
					const files = [...(e.target.files ?? [])];
					e.target.value = "";
					void insertImages(view, files, view.state.selection.main.head);
				}}
			/>
			<span className="word-count">
				{words} {words === 1 ? "word" : "words"}
			</span>
		</div>
	);
}
