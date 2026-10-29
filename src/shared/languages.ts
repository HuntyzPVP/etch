export const LANGUAGES = [
	"bash",
	"powershell",
	"python",
	"javascript",
	"typescript",
	"java",
	"c",
	"cpp",
	"csharp",
	"luau",
	"sql",
	"html",
	"css",
	"output",
] as const;

export type Language = (typeof LANGUAGES)[number];

const ALIASES: Record<string, Language> = {
	sh: "bash",
	shell: "bash",
	zsh: "bash",
	console: "bash",
	terminal: "bash",
	ps: "powershell",
	ps1: "powershell",
	pwsh: "powershell",
	py: "python",
	js: "javascript",
	ts: "typescript",
	"c++": "cpp",
	cs: "csharp",
	"c#": "csharp",
	lua: "luau",
	text: "output",
	txt: "output",
	plain: "output",
};

// The word after a code fence's backticks. Anything unknown counts as plain output.
export function languageFromFence(info: string): Language {
	const word = info.trim().split(/\s/)[0].toLowerCase();
	if ((LANGUAGES as readonly string[]).includes(word)) return word as Language;
	return ALIASES[word] ?? "output";
}
