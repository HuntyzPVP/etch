import { useEffect, useRef, useState } from "react";
import { addDays, formatDate, formatTime, startOfWeek, today } from "../shared/dates";
import { api, useDataChanged, type PlannerInput, type PlannerItem } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { DatePicker, TimePicker } from "./Pickers";
import { Suggestions } from "./Suggestions";

export async function savePlannerItem(item: PlannerItem, change: Partial<PlannerInput>) {
	const json = { title: item.title, due_date: item.due_date, due_time: item.due_time, done: item.done, ...change };
	const res = await api.planner[":id"].$put({ param: { id: String(item.id) }, json });
	return res.ok;
}

export function useDeleteItem() {
	const confirm = useConfirm();
	return async (item: PlannerItem) => {
		if (!(await confirm({ title: `Delete "${item.title}"?`, action: "Delete" }))) return false;
		const res = await api.planner[":id"].$delete({ param: { id: String(item.id) } });
		return res.ok;
	};
}

async function fetchItems() {
	const res = await api.planner.$get();
	return res.json();
}

// Open items before done ones, then by time with untimed items first.
function byDay(items: PlannerItem[], day: string | null) {
	return items
		.filter((item) => item.due_date === day)
		.sort((a, b) => Number(a.done) - Number(b.done) || (a.due_time ?? "").localeCompare(b.due_time ?? ""));
}

type View = "week" | "day";

export function PlannerPage() {
	const [items, setItems] = useState<PlannerItem[] | null>(null);
	const [view, setView] = useState<View>("week");
	const [anchor, setAnchor] = useState(today);
	// Which way the cards slide when stepping between weeks or days.
	const [direction, setDirection] = useState<"next" | "prev" | null>(null);
	const deleteItem = useDeleteItem();

	useEffect(() => {
		void fetchItems().then(setItems);
	}, []);

	async function reload() {
		setItems(await fetchItems());
	}

	useDataChanged(() => void reload());

	async function create(input: PlannerInput) {
		const res = await api.planner.$post({ json: input });
		if (res.ok) await reload();
		return res.ok;
	}

	async function update(item: PlannerItem, change: Partial<PlannerInput>) {
		const saved = await savePlannerItem(item, change);
		if (saved) await reload();
		return saved;
	}

	function go(day: string) {
		if (day === anchor) return;
		setDirection(day > anchor ? "next" : "prev");
		setAnchor(day);
	}

	if (items === null) return null;

	const now = today();
	const step = view === "week" ? 7 : 1;
	const weekStart = startOfWeek(anchor);
	const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [anchor];
	const overdue = items.filter((item) => !item.done && item.due_date !== null && item.due_date < now);
	const range =
		view === "week"
			? `${formatDate(weekStart, { month: "short", day: "numeric" })} – ${formatDate(addDays(weekStart, 6), { month: "short", day: "numeric" })}`
			: formatDate(anchor, { weekday: "long", month: "long", day: "numeric" });

	const card = (day: string | null, list: PlannerItem[], title: string) => (
		<DayCard
			key={day ?? "someday"}
			title={title}
			isToday={day === now}
			items={list}
			showDates={day === null ? false : list.some((item) => item.due_date !== day)}
			onAdd={(text) => create({ title: text, due_date: day })}
			onToggle={(item) => void update(item, { done: !item.done })}
			onEdit={(item, input) => update(item, input)}
			onDelete={(item) => deleteItem(item)}
			onGone={() => void reload()}
		/>
	);

	return (
		<div className="planner">
			<div className="planner-toolbar">
				<div className="segmented" role="tablist">
					{(["day", "week"] as const).map((option) => (
						<button
							key={option}
							role="tab"
							aria-selected={view === option}
							className={view === option ? "selected" : undefined}
							onClick={() => setView(option)}
						>
							{option === "day" ? "Day" : "Week"}
						</button>
					))}
				</div>
				<h1 className="planner-range">{range}</h1>
				<div className="stepper">
					<button aria-label="Previous" onClick={() => go(addDays(anchor, -step))}>
						‹
					</button>
					<button onClick={() => go(now)}>Today</button>
					<button aria-label="Next" onClick={() => go(addDays(anchor, step))}>
						›
					</button>
				</div>
			</div>
			<Suggestions onAccepted={() => void reload()} />
			<div
				key={`${view}-${view === "week" ? weekStart : anchor}`}
				className={[view === "week" ? "week-grid" : "day-grid", direction && `slide-${direction}`]
					.filter(Boolean)
					.join(" ")}
			>
				{days.map((day) => {
					// Past-due items surface on today's card so they can't slip by unseen.
					const list = day === now ? [...overdue, ...byDay(items, day)] : byDay(items, day);
					return card(day, list, formatDate(day, { weekday: "short", day: "numeric" }));
				})}
				{card(null, byDay(items, null), "Someday")}
			</div>
		</div>
	);
}

type DayCardProps = {
	title: string;
	isToday: boolean;
	items: PlannerItem[];
	showDates: boolean;
	onAdd: (title: string) => Promise<boolean>;
	onToggle: (item: PlannerItem) => void;
	onEdit: (item: PlannerItem, input: PlannerInput) => Promise<boolean>;
	onDelete: (item: PlannerItem) => Promise<boolean>;
	onGone: () => void;
};

function DayCard({ title, isToday, items, showDates, onAdd, onToggle, onEdit, onDelete, onGone }: DayCardProps) {
	const [draft, setDraft] = useState("");
	const adding = useRef(false);

	return (
		<section className={isToday ? "day-card today" : "day-card"}>
			<h2>{title}</h2>
			<ul className="item-list">
				{items.map((item) => (
					<ItemRow
						key={item.id}
						item={item}
						showDate={showDates}
						onToggle={() => onToggle(item)}
						onEdit={(input) => onEdit(item, input)}
						onDelete={() => onDelete(item)}
						onGone={onGone}
					/>
				))}
			</ul>
			<form
				className="quick-add"
				onSubmit={(e) => {
					e.preventDefault();
					if (!draft.trim() || adding.current) return;
					adding.current = true;
					void onAdd(draft)
						.catch(() => false)
						.then((saved) => {
							adding.current = false;
							if (saved) setDraft("");
						});
				}}
			>
				<input placeholder="+ Add a task" value={draft} onChange={(e) => setDraft(e.target.value)} />
			</form>
		</section>
	);
}

type ItemRowProps = {
	item: PlannerItem;
	showDate?: boolean;
	onToggle: () => void;
	onEdit: (input: PlannerInput) => Promise<boolean>;
	// Resolves true once the item is deleted; the row then collapses and calls onGone.
	onDelete: () => Promise<boolean>;
	onGone: () => void;
};

export function ItemRow({ item, showDate = false, onToggle, onEdit, onDelete, onGone }: ItemRowProps) {
	const [editing, setEditing] = useState(false);
	const [leaving, setLeaving] = useState(false);

	if (editing) {
		return (
			<li>
				<ItemForm
					item={item}
					onSave={async (input) => {
						const saved = await onEdit(input);
						if (saved) setEditing(false);
						return saved;
					}}
					onCancel={() => setEditing(false)}
				/>
			</li>
		);
	}

	const overdue = !item.done && item.due_date !== null && item.due_date < today();

	return (
		<li
			className={["item", item.done && "done", leaving && "leaving"].filter(Boolean).join(" ")}
			onAnimationEnd={(e) => {
				if (e.animationName === "item-out") onGone();
			}}
		>
			<button className="check" role="checkbox" aria-checked={item.done} aria-label="Done" onClick={onToggle}>
				<svg viewBox="0 0 16 16" aria-hidden>
					<path d="M4 8.5l2.5 2.5L12 5.5" />
				</svg>
			</button>
			<button className="item-title" onClick={() => setEditing(true)}>
				{item.title}
			</button>
			{showDate && item.due_date && (
				<span className={overdue ? "pill overdue" : "pill"}>
					{formatDate(item.due_date, { month: "short", day: "numeric" })}
				</span>
			)}
			{item.due_time && <span className="pill">{formatTime(item.due_time)}</span>}
			<button
				className="icon-button"
				aria-label={`Delete "${item.title}"`}
				onClick={() => void onDelete().then((deleted) => setLeaving(deleted))}
			>
				×
			</button>
		</li>
	);
}

type ItemFormProps = {
	item: PlannerItem;
	onSave: (input: PlannerInput) => Promise<boolean>;
	onCancel: () => void;
};

function ItemForm({ item, onSave, onCancel }: ItemFormProps) {
	const [title, setTitle] = useState(item.title);
	const [date, setDate] = useState(item.due_date ?? "");
	const [time, setTime] = useState(item.due_time ?? "");
	const [failed, setFailed] = useState(false);

	return (
		<form
			className="item-form"
			onSubmit={(e) => {
				e.preventDefault();
				void onSave({ title, due_date: date || null, due_time: (date && time) || null }).then((saved) =>
					setFailed(!saved),
				);
			}}
		>
			<input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" required autoFocus />
			<div className="row">
				<DatePicker value={date} onChange={setDate} label="Date" allowClear />
				<TimePicker value={time} onChange={setTime} label="Time" allowClear disabled={!date} />
			</div>
			{failed && <p className="error">Couldn't save. Add a title, and a date before a time.</p>}
			<div className="actions">
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
				<button type="submit" className="primary">
					Save
				</button>
			</div>
		</form>
	);
}
