import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { formatDate } from "../shared/dates";
import { linkTitles, titleKey } from "../shared/links";
import { api, entryProblem, fetchEntries, useDataChanged, type Entry, type EntryInput } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { EntryCard } from "./EntryCard";
import { markdownToPlain } from "./MarkdownEditor";
import { NoteColumn } from "./NoteColumn";

export function NoteRow({ entry }: { entry: Entry }) {
	const preview = markdownToPlain(entry.notes);
	return (
		<Link to={`/notes/${entry.id}`} className="tile note-row">
			<span className="pill">{formatDate(entry.date, { month: "short", day: "numeric" })}</span>
			<h3>{entry.topic}</h3>
			{preview && <p className="notes clamp">{preview}</p>}
		</Link>
	);
}

export function NotePage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const confirm = useConfirm();
	const [entries, setEntries] = useState<Entry[] | null>(null);
	const titles = useMemo(() => entries?.map((e) => e.topic) ?? [], [entries]);

	useEffect(() => {
		void fetchEntries().then(setEntries);
	}, []);

	useDataChanged(() => void fetchEntries().then(setEntries));

	if (!entries) return null;
	const entry = entries.find((e) => String(e.id) === id);
	if (!entry) {
		return (
			<div className="narrow">
				<p className="empty">This note doesn't exist anymore.</p>
				<Link to="/log">Back to the log</Link>
			</div>
		);
	}

	const key = titleKey(entry.topic);
	const backlinks = entries.filter((e) => e.id !== entry.id && linkTitles(e.notes).some((t) => titleKey(t) === key));

	async function update(input: EntryInput) {
		const res = await api.entries[":id"].$put({ param: { id: String(entry!.id) }, json: input });
		if (!res.ok) return entryProblem(res.status);
		setEntries(await fetchEntries());
		return null;
	}

	async function remove() {
		const message = "Its snippets and review exercises are deleted too.";
		if (!(await confirm({ title: `Delete "${entry!.topic}"?`, message, action: "Delete" }))) return;
		const res = await api.entries[":id"].$delete({ param: { id: String(entry!.id) } });
		if (res.ok) navigate("/log");
	}

	return (
		<NoteColumn>
			<EntryCard key={entry.id} entry={entry} titles={titles} onUpdate={update} onDelete={() => void remove()} />
			<section>
				<h2>Linked from</h2>
				{backlinks.length === 0 && <p className="empty">No other note links here yet.</p>}
				{backlinks.map((e) => (
					<NoteRow key={e.id} entry={e} />
				))}
			</section>
		</NoteColumn>
	);
}
