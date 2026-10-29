// [[Title]] or [[Title|shown text]].
export const LINK = /\[\[([^[\]|#\n]+)(?:[|#][^[\]\n]*)?\]\]/g;

export function linkTitles(markdown: string) {
	return [...markdown.matchAll(LINK)].map((m) => m[1].trim()).filter(Boolean);
}

// Links find their note without caring about case or stray spaces.
export const titleKey = (title: string) => title.trim().toLowerCase();
