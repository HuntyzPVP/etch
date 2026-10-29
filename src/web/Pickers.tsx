import { useEffect, useRef, useState, type ReactNode } from "react";
import { addDays, addMonths, formatDate, formatTime, startOfWeek, today } from "../shared/dates";

type Align = "start" | "end";

function Popover({
	label,
	trigger,
	align = "start",
	disabled = false,
	children,
}: {
	label: string;
	trigger: ReactNode;
	align?: Align;
	disabled?: boolean;
	children: (close: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="picker" ref={rootRef}>
			<button
				type="button"
				className="picker-trigger"
				aria-label={label}
				aria-expanded={open}
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
			>
				{trigger}
			</button>
			{open && <div className={`picker-pop align-${align}`}>{children(() => setOpen(false))}</div>}
		</div>
	);
}

type DatePickerProps = {
	value: string;
	onChange: (value: string) => void;
	label: string;
	allowClear?: boolean;
	align?: Align;
};

export function DatePicker({ value, onChange, label, allowClear = false, align }: DatePickerProps) {
	const now = today();

	return (
		<Popover
			label={label}
			align={align}
			trigger={
				<>
					<CalendarIcon />
					<span className={value ? undefined : "placeholder"}>
						{value ? formatDate(value, { weekday: "short", month: "short", day: "numeric" }) : "Add date"}
					</span>
				</>
			}
		>
			{(close) => {
				const pick = (day: string) => {
					onChange(day);
					close();
				};
				return (
					<>
						<Month selected={value} onPick={pick} />
						<div className="picker-quick">
							<button type="button" onClick={() => pick(now)}>
								Today
							</button>
							<button type="button" onClick={() => pick(addDays(now, 1))}>
								Tomorrow
							</button>
							<button type="button" onClick={() => pick(addDays(now, 7))}>
								Next week
							</button>
							{allowClear && value && (
								<button type="button" className="picker-clear" onClick={() => pick("")}>
									Clear
								</button>
							)}
						</div>
					</>
				);
			}}
		</Popover>
	);
}

function Month({ selected, onPick }: { selected: string; onPick: (day: string) => void }) {
	const now = today();
	const [month, setMonth] = useState(() => `${(selected || now).slice(0, 7)}-01`);
	// Six rows always, so the popover doesn't change height between months.
	const first = startOfWeek(month);
	const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
	const weekdays = days.slice(0, 7).map((day) => formatDate(day, { weekday: "narrow" }));

	return (
		<div className="month">
			<div className="month-head">
				<button
					type="button"
					className="icon-button"
					aria-label="Previous month"
					onClick={() => setMonth(addMonths(month, -1))}
				>
					‹
				</button>
				<span>{formatDate(month, { month: "long", year: "numeric" })}</span>
				<button
					type="button"
					className="icon-button"
					aria-label="Next month"
					onClick={() => setMonth(addMonths(month, 1))}
				>
					›
				</button>
			</div>
			<div className="month-grid" key={month}>
				{weekdays.map((name, i) => (
					<span key={i} className="weekday" aria-hidden>
						{name}
					</span>
				))}
				{days.map((day) => (
					<button
						type="button"
						key={day}
						className={[
							"day",
							day.slice(0, 7) !== month.slice(0, 7) && "outside",
							day === now && "today",
							day === selected && "selected",
						]
							.filter(Boolean)
							.join(" ")}
						aria-label={formatDate(day, { weekday: "long", month: "long", day: "numeric" })}
						aria-pressed={day === selected}
						onClick={() => onPick(day)}
					>
						{Number(day.slice(8))}
					</button>
				))}
			</div>
		</div>
	);
}

// Accepts "6:45 pm", "6pm", "645p" or 24-hour "18:45".
function parseTime(text: string) {
	const match = text
		.trim()
		.toLowerCase()
		.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
	if (!match) return null;
	let hours = Number(match[1]);
	const minutes = Number(match[2] ?? 0);
	const period = match[3];
	if (minutes > 59) return null;
	if (period) {
		if (hours < 1 || hours > 12) return null;
		hours = (hours % 12) + (period.startsWith("p") ? 12 : 0);
	} else if (hours > 23) return null;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const TIMES = Array.from({ length: 96 }, (_, i) => {
	const minutes = i * 15;
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

type TimePickerProps = {
	value: string;
	onChange: (value: string) => void;
	label: string;
	allowClear?: boolean;
	disabled?: boolean;
	align?: Align;
};

export function TimePicker({ value, onChange, label, allowClear = false, disabled, align }: TimePickerProps) {
	return (
		<Popover
			label={label}
			align={align}
			disabled={disabled}
			trigger={
				<>
					<ClockIcon />
					<span className={value ? undefined : "placeholder"}>{value ? formatTime(value) : "Add time"}</span>
				</>
			}
		>
			{(close) => (
				<TimeList
					value={value}
					allowClear={allowClear}
					onPick={(time) => {
						onChange(time);
						close();
					}}
				/>
			)}
		</Popover>
	);
}

function TimeList({
	value,
	allowClear,
	onPick,
}: {
	value: string;
	allowClear: boolean;
	onPick: (time: string) => void;
}) {
	const [text, setText] = useState("");
	const [invalid, setInvalid] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);
	// Scroll to the chosen time, or to the nearest slot at or after it.
	const anchor = TIMES.find((t) => t >= (value || "09:00")) ?? TIMES[TIMES.length - 1];

	useEffect(() => {
		listRef.current?.querySelector<HTMLElement>(`[data-time="${anchor}"]`)?.scrollIntoView({ block: "center" });
	}, [anchor]);

	return (
		<div className="time-list">
			{/* Enter is handled here because this sits inside other forms, and forms can't nest. */}
			<input
				autoFocus
				placeholder="Type a time, like 6:45 pm"
				value={text}
				aria-invalid={invalid}
				onChange={(e) => {
					setText(e.target.value);
					setInvalid(false);
				}}
				onKeyDown={(e) => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					const parsed = parseTime(text);
					if (parsed) onPick(parsed);
					else setInvalid(true);
				}}
			/>
			<div className="time-options" ref={listRef}>
				{TIMES.map((time) => (
					<button
						type="button"
						key={time}
						data-time={time}
						className={time === value ? "selected" : undefined}
						onClick={() => onPick(time)}
					>
						{formatTime(time)}
					</button>
				))}
			</div>
			{allowClear && value && (
				<button type="button" className="picker-clear" onClick={() => onPick("")}>
					Clear time
				</button>
			)}
		</div>
	);
}

function CalendarIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden className="picker-icon">
			<rect x="2" y="3" width="12" height="11" rx="2" />
			<path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
		</svg>
	);
}

function ClockIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden className="picker-icon">
			<circle cx="8" cy="8" r="6" />
			<path d="M8 4.5V8l2.5 1.5" />
		</svg>
	);
}
