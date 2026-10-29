export type ThemeChoice = "system" | "dark" | "light";

// index.html applies the saved choice before the page paints, so there's no flash of the wrong theme.
const KEY = "etch-theme";

export function getTheme(): ThemeChoice {
	try {
		const saved = localStorage.getItem(KEY);
		return saved === "dark" || saved === "light" ? saved : "system";
	} catch {
		return "system";
	}
}

export function setTheme(choice: ThemeChoice) {
	try {
		if (choice === "system") localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, choice);
	} catch {
		// Storage can be blocked; the theme still applies for this visit.
	}
	if (choice === "system") delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = choice;
}
