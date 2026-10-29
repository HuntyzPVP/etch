import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import type { Language } from "../shared/languages";
import { LANGUAGE_INFO } from "./codeLanguages";

// Colors come from CSS variables, so the editor follows the light/dark theme without remounting.
export const codeHighlighting = syntaxHighlighting(
	HighlightStyle.define([
		{ tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.tagName], color: "var(--syn-keyword)" },
		{ tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
		{ tag: [t.number, t.bool, t.null, t.atom], color: "var(--syn-number)" },
		{ tag: [t.function(t.variableName), t.function(t.propertyName), t.attributeName], color: "var(--syn-function)" },
		{ tag: [t.typeName, t.className, t.definition(t.typeName)], color: "var(--syn-type)" },
		{ tag: t.comment, color: "var(--muted)", fontStyle: "italic" },
	]),
);

const etchTheme = [
	EditorView.theme({
		"&": { color: "var(--text)", backgroundColor: "var(--code-bg)" },
		"&.cm-focused": { outline: "none" },
		".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent)" },
		".cm-cursor": { borderLeftColor: "var(--accent)" },
		".cm-gutters": { backgroundColor: "var(--code-bg)", color: "var(--muted)", border: "none" },
		".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--hover)" },
		"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
			backgroundColor: "var(--selection)",
		},
	}),
	codeHighlighting,
];

type Props = {
	language: Language;
	value: string;
	// Leaving this out makes the block read-only.
	onChange?: (value: string) => void;
};

export function CodeBlock({ language, value, onChange }: Props) {
	const extensions = useMemo(() => [LANGUAGE_INFO[language].extension()], [language]);
	const editable = onChange !== undefined;

	return (
		<CodeMirror
			className="code-block"
			value={value}
			onChange={onChange}
			extensions={extensions}
			theme={etchTheme}
			editable={editable}
			readOnly={!editable}
			minHeight={editable ? "80px" : undefined}
			basicSetup={{ foldGutter: false, highlightActiveLine: editable, highlightActiveLineGutter: editable }}
		/>
	);
}
