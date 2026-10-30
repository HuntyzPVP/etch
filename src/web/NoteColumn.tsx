import { useRef, useState, type CSSProperties, type ReactNode } from "react";

const STORAGE_KEY = "etch-note-width";
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 480;

function savedWidth() {
	try {
		const width = Number(localStorage.getItem(STORAGE_KEY));
		return width >= MIN_WIDTH ? width : DEFAULT_WIDTH;
	} catch {
		return DEFAULT_WIDTH;
	}
}

function saveWidth(width: number) {
	try {
		localStorage.setItem(STORAGE_KEY, String(width));
	} catch {
		// Storage blocked: the width just isn't remembered.
	}
}

// The note pages' column. Dragging its right edge widens or narrows it; double-clicking resets it.
export function NoteColumn({ children }: { children: ReactNode }) {
	const [width, setWidth] = useState(savedWidth);
	const drag = useRef<{ x: number; width: number } | null>(null);

	return (
		<div className="narrow note-column" style={{ "--note-width": `${width}px` } as CSSProperties}>
			{children}
			<div
				className="width-handle"
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize notes"
				title="Drag to resize, double-click to reset"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					drag.current = { x: e.clientX, width };
				}}
				onPointerMove={(e) => {
					const start = drag.current;
					if (!start) return;
					const next = start.width + e.clientX - start.x;
					setWidth(Math.round(Math.max(MIN_WIDTH, Math.min(window.innerWidth - 32, next))));
				}}
				onPointerUp={() => {
					if (!drag.current) return;
					drag.current = null;
					saveWidth(width);
				}}
				onDoubleClick={() => {
					setWidth(DEFAULT_WIDTH);
					saveWidth(DEFAULT_WIDTH);
				}}
			/>
		</div>
	);
}
