export const LANGUAGES = [
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
] as const;

export type Language = (typeof LANGUAGES)[number];
