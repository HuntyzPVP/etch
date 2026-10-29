import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// A mouse click shouldn't leave focus behind: the next key press (even a screenshot shortcut) would show a focus ring.
// detail is 0 for keyboard activation, so Tab and Enter users keep their ring.
document.addEventListener("click", (e) => {
	if (e.detail === 0) return;
	const target = (e.target as Element).closest("a, button");
	if (target instanceof HTMLElement && target === document.activeElement) target.blur();
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
