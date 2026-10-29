import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api, entryProblem, fetchEntries, useDataChanged, type Entry, type EntryInput } from "./api";
import { EntryForm } from "./EntryForm";
import { NoteRow } from "./NotePage";
import { ReportButton } from "./ReportDialog";

export function LogPage() {
	const [entries, setEntries] = useState<Entry[]>([]);
	const titles = useMemo(() => entries.map((e) => e.topic), [entries]);
	const [params] = useSearchParams();
	// Set when a [[link]] to a note that doesn't exist yet was clicked.
	const linkedTopic = params.get("topic") ?? "";
	const navigate = useNavigate();

	useEffect(() => {
		void fetchEntries().then(setEntries);
	}, []);

	async function reload() {
		setEntries(await fetchEntries());
	}

	useDataChanged(() => void reload());

	async function create(input: EntryInput) {
		const res = await api.entries.$post({ json: input });
		if (!res.ok) return entryProblem(res.status);
		if (linkedTopic) navigate(`/notes/${(await res.json()).id}`);
		else await reload();
		return null;
	}

	return (
		<div className="narrow">
			<div className="page-heading">
				<h1>Log what I learned</h1>
				<ReportButton />
			</div>
			<EntryForm key={linkedTopic} onSave={create} titles={titles} initialTopic={linkedTopic} />
			<section>
				<h2>Notes</h2>
				{entries.length === 0 && <p className="empty">Nothing logged yet.</p>}
				{entries.map((entry) => (
					<NoteRow key={entry.id} entry={entry} />
				))}
			</section>
		</div>
	);
}
