import { useState } from "react";
import { formatDate } from "../shared/dates";
import type { Entry, EntryInput } from "./api";
import { EntryForm } from "./EntryForm";
import { MarkdownEditor } from "./MarkdownEditor";

type Props = {
	entry: Entry;
	onUpdate: (input: EntryInput) => Promise<string | null>;
	onDelete: () => void;
	titles?: readonly string[];
};

export function EntryCard({ entry, onUpdate, onDelete, titles }: Props) {
	const [editing, setEditing] = useState(false);

	if (editing) {
		return (
			<EntryForm
				entry={entry}
				onSave={async (input) => {
					const problem = await onUpdate(input);
					if (!problem) setEditing(false);
					return problem;
				}}
				onCancel={() => setEditing(false)}
				titles={titles}
			/>
		);
	}

	return (
		<article className="tile entry">
			<header>
				<time className="pill" dateTime={entry.date}>
					{formatDate(entry.date)}
				</time>
				<h3>{entry.topic}</h3>
			</header>
			{entry.notes && <MarkdownEditor value={entry.notes} titles={titles} />}
			<div className="actions">
				<button onClick={() => setEditing(true)}>Edit</button>
				<button onClick={onDelete}>Delete</button>
			</div>
		</article>
	);
}
