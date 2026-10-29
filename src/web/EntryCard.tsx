import { useState } from "react";
import type { Entry, EntryInput } from "./api";
import { CodeBlock } from "./CodeBlock";
import { LANGUAGE_INFO } from "./codeLanguages";
import { EntryForm } from "./EntryForm";

type Props = {
	entry: Entry;
	onUpdate: (input: EntryInput) => Promise<boolean>;
	onDelete: () => void;
};

// Built from parts because new Date("2026-10-28") is read as UTC midnight and shows the previous day in US timezones.
function formatDate(iso: string) {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function EntryCard({ entry, onUpdate, onDelete }: Props) {
	const [editing, setEditing] = useState(false);

	if (editing) {
		return (
			<EntryForm
				entry={entry}
				onSave={async (input) => {
					const saved = await onUpdate(input);
					if (saved) setEditing(false);
					return saved;
				}}
				onCancel={() => setEditing(false)}
			/>
		);
	}

	return (
		<article className="entry">
			<header>
				<time dateTime={entry.date}>{formatDate(entry.date)}</time>
				<h3>{entry.topic}</h3>
			</header>
			{entry.notes && <p className="notes">{entry.notes}</p>}
			{entry.snippets.map((snippet) => (
				<div key={snippet.id} className="snippet">
					<span className="language">{LANGUAGE_INFO[snippet.language].label}</span>
					<CodeBlock language={snippet.language} value={snippet.code} />
				</div>
			))}
			<div className="actions">
				<button onClick={() => setEditing(true)}>Edit</button>
				<button onClick={onDelete}>Delete</button>
			</div>
		</article>
	);
}
