import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import type { Extension } from "@codemirror/state";
import type { Language } from "../shared/languages";

export const LANGUAGE_INFO: Record<Language, { label: string; extension: () => Extension }> = {
	python: { label: "Python", extension: () => python() },
	javascript: { label: "JavaScript", extension: () => javascript() },
	typescript: { label: "TypeScript", extension: () => javascript({ typescript: true }) },
	java: { label: "Java", extension: () => java() },
	c: { label: "C", extension: () => cpp() },
	cpp: { label: "C++", extension: () => cpp() },
	csharp: { label: "C#", extension: () => StreamLanguage.define(csharp) },
	// No Luau mode exists; Lua covers nearly all of its syntax.
	luau: { label: "Luau", extension: () => StreamLanguage.define(lua) },
	sql: { label: "SQL", extension: () => sql() },
	html: { label: "HTML", extension: () => html() },
	css: { label: "CSS", extension: () => css() },
};
