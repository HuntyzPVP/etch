import { useEffect, useState } from "react";
import { formatDate, formatTime, today } from "../shared/dates";
import { api, type PlannerInput, type PlannerItem } from "./api";

export async function savePlannerItem(item: PlannerItem, change: Partial<PlannerInput>) {
	const json = { title: item.title, due_date: item.due_date, due_time: item.due_time, done: item.done, ...change };
	const res = await api.planner[":id"].$put({ param: { id: String(item.id) }, json });
	return res.ok;
}

export async function deletePlannerItem(item: PlannerItem) {
	if (!confirm(`Delete "${item.title}"?`)) return false;
	const res = await api.planner[":id"].$delete({ param: { id: String(item.id) } });
	return res.ok;
}

async function fetchItems() {
	const res = await api.planner.$get();
	return res.json();
}

export function PlannerPage() {
	const [items, setItems] = useState<PlannerItem[] | null>(null);

	useEffect(() => {
		void fetchItems().then(setItems);
	}, []);

	async function reload() {
		setItems(await fetchItems());
	}

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

	async function remove(item: PlannerItem) {
		if (await deletePlannerItem(item)) await reload();
	}

	if (items === null) return null;

	const open = items.filter((item) => !item.done);
	const done = items.filter((item) => item.done);
	const row = (item: PlannerItem) => (
		<ItemRow
			key={item.id}
			item={item}
			onToggle={() => void update(item, { done: !item.done })}
			onEdit={(input) => update(item, input)}
			onDelete={() => void remove(item)}
		/>
	);

	return (
		<>
			<section>
				<h2>Planner</h2>
				<ItemForm submitLabel="Add" onSave={create} />
				{open.length === 0 && <p className="empty">Nothing planned.</p>}
				<ul className="planner-list">{open.map(row)}</ul>
			</section>
			{done.length > 0 && (
				<section>
					<h2>Done</h2>
					<ul className="planner-list">{done.map(row)}</ul>
				</section>
			)}
		</>
	);
}

type ItemFormProps = {
	item?: PlannerItem;
	submitLabel: string;
	onSave: (input: PlannerInput) => Promise<boolean>;
	onCancel?: () => void;
};

function ItemForm({ item, submitLabel, onSave, onCancel }: ItemFormProps) {
	const [title, setTitle] = useState(item?.title ?? "");
	const [date, setDate] = useState(item?.due_date ?? "");
	const [time, setTime] = useState(item?.due_time ?? "");
	const [failed, setFailed] = useState(false);

	async function submit() {
		const saved = await onSave({ title, due_date: date || null, due_time: (date && time) || null });
		setFailed(!saved);
		if (saved && !item) {
			setTitle("");
			setDate("");
			setTime("");
		}
	}

	return (
		<form
			className="item-form"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<input placeholder="What's the plan?" value={title} onChange={(e) => setTitle(e.target.value)} required />
			<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
			<input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
			{onCancel && (
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
			)}
			<button type="submit" className="primary">
				{submitLabel}
			</button>
			{failed && <p className="error">Couldn't save that item.</p>}
		</form>
	);
}

type ItemRowProps = {
	item: PlannerItem;
	onToggle: () => void;
	onEdit: (input: PlannerInput) => Promise<boolean>;
	onDelete: () => void;
};

export function ItemRow({ item, onToggle, onEdit, onDelete }: ItemRowProps) {
	const [editing, setEditing] = useState(false);

	if (editing) {
		return (
			<li>
				<ItemForm
					item={item}
					submitLabel="Save"
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
		<li className={item.done ? "planner-item done" : "planner-item"}>
			<input type="checkbox" checked={item.done} onChange={onToggle} aria-label="Done" />
			<button className="title" onClick={() => setEditing(true)}>
				{item.title}
			</button>
			{item.due_date && (
				<span className={overdue ? "due overdue" : "due"}>
					{formatDate(item.due_date)}
					{item.due_time && ` · ${formatTime(item.due_time)}`}
				</span>
			)}
			<button onClick={onDelete}>Delete</button>
		</li>
	);
}
