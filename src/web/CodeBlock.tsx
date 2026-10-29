import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import type { Language } from "../shared/languages";
import { LANGUAGE_INFO } from "./codeLanguages";

const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

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
			theme={theme}
			editable={editable}
			readOnly={!editable}
			minHeight={editable ? "80px" : undefined}
			basicSetup={{ foldGutter: false, highlightActiveLine: editable, highlightActiveLineGutter: editable }}
		/>
	);
}
