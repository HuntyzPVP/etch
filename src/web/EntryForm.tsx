import { useState } from "react";
import type { Entry, EntryInput } from "./api";

type Props = {
	entry?: Entry;
	onSave: (input: EntryInput) => Promise<boolean>;
	onCancel?: () => void;
};

// en-CA formats as YYYY-MM-DD in the local timezone, which is what the date input expects.
const today = () => new Date().toLocaleDateString("en-CA");

export function EntryForm({ entry, onSave, onCancel }: Props) {
	const [date, setDate] = useState(entry?.date ?? today());
	const [topic, setTopic] = useState(entry?.topic ?? "");
	const [notes, setNotes] = useState(entry?.notes ?? "");
	const [failed, setFailed] = useState(false);

	async function submit() {
		// Existing snippets pass through untouched until the snippet editor exists.
		const snippets = entry?.snippets.map(({ language, code }) => ({ language, code })) ?? [];
		const saved = await onSave({ date, topic, notes, snippets });
		setFailed(!saved);
		if (saved && !entry) {
			setTopic("");
			setNotes("");
		}
	}

	return (
		<form
			className="entry-form"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div className="row">
				<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
				<input
					className="topic"
					placeholder="Topic"
					value={topic}
					onChange={(e) => setTopic(e.target.value)}
					required
				/>
			</div>
			<textarea
				placeholder="What did you learn? Put it in your own words."
				rows={5}
				value={notes}
				onChange={(e) => setNotes(e.target.value)}
			/>
			{failed && <p className="error">Couldn't save. Check the date and topic.</p>}
			<div className="actions">
				{onCancel && (
					<button type="button" onClick={onCancel}>
						Cancel
					</button>
				)}
				<button type="submit" className="primary">
					{entry ? "Save" : "Log it"}
				</button>
			</div>
		</form>
	);
}
