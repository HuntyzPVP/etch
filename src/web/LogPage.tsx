import { useEffect, useState } from "react";
import { api, type Entry, type EntryInput } from "./api";
import { EntryCard } from "./EntryCard";
import { EntryForm } from "./EntryForm";

async function fetchEntries() {
	const res = await api.entries.$get();
	return res.json();
}

export function LogPage() {
	const [entries, setEntries] = useState<Entry[]>([]);

	useEffect(() => {
		void fetchEntries().then(setEntries);
	}, []);

	async function reload() {
		setEntries(await fetchEntries());
	}

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
		if (!confirm(`Delete "${entry.topic}"?`)) return;
		const res = await api.entries[":id"].$delete({ param: { id: String(entry.id) } });
		if (res.ok) await reload();
	}

	return (
		<>
			<section>
				<h2>Log what I learned</h2>
				<EntryForm onSave={create} />
			</section>
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
		</>
	);
}
