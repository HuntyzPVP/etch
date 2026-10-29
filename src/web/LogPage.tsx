import { useEffect, useState } from "react";
import { api, useDataChanged, type Entry, type EntryInput } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { EntryCard } from "./EntryCard";
import { EntryForm } from "./EntryForm";
import { ReportButton } from "./ReportDialog";

async function fetchEntries() {
	const res = await api.entries.$get();
	return res.json();
}

export function LogPage() {
	const [entries, setEntries] = useState<Entry[]>([]);
	const confirm = useConfirm();

	useEffect(() => {
		void fetchEntries().then(setEntries);
	}, []);

	async function reload() {
		setEntries(await fetchEntries());
	}

	useDataChanged(() => void reload());

	async function create(input: EntryInput) {
		const res = await api.entries.$post({ json: input });
		if (res.ok) await reload();
		return res.ok;
	}

	async function update(id: number, input: EntryInput) {
		const res = await api.entries[":id"].$put({ param: { id: String(id) }, json: input });
		if (res.ok) await reload();
		return res.ok;
	}

	async function remove(entry: Entry) {
		const message = "Its snippets and review exercises are deleted too.";
		if (!(await confirm({ title: `Delete "${entry.topic}"?`, message, action: "Delete" }))) return;
		const res = await api.entries[":id"].$delete({ param: { id: String(entry.id) } });
		if (res.ok) await reload();
	}

	return (
		<div className="narrow">
			<div className="page-heading">
				<h1>Log what I learned</h1>
				<ReportButton />
			</div>
			<EntryForm onSave={create} />
			<section>
				<h2>Learning log</h2>
				{entries.length === 0 && <p className="empty">Nothing logged yet.</p>}
				{entries.map((entry) => (
					<EntryCard
						key={entry.id}
						entry={entry}
						onUpdate={(input) => update(entry.id, input)}
						onDelete={() => void remove(entry)}
					/>
				))}
			</section>
		</div>
	);
}
