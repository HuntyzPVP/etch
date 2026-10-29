import { useEffect, useRef, useState } from "react";
import { today } from "../shared/dates";
import { api, type Entry, type EntryInput } from "./api";
import { DatePicker } from "./Pickers";
import { MarkdownEditor } from "./MarkdownEditor";

const DRAFT_DELAY_MS = 1000;

type Props = {
	entry?: Entry;
	// Resolves to an error message, or null once saved.
	onSave: (input: EntryInput) => Promise<string | null>;
	onCancel?: () => void;
	titles?: readonly string[];
	// Title for a new note opened from a [[link]] to it.
	initialTopic?: string;
};

export function EntryForm({ entry, onSave, onCancel, titles, initialTopic = "" }: Props) {
	const draftKey = entry ? String(entry.id) : "new";
	const saved = { date: entry?.date ?? today(), topic: entry?.topic ?? initialTopic, notes: entry?.notes ?? "" };
	const [date, setDate] = useState(saved.date);
	const [topic, setTopic] = useState(saved.topic);
	const [notes, setNotes] = useState(saved.notes);
	const [loaded, setLoaded] = useState(false);
	const [restored, setRestored] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const saving = useRef(false);

	useEffect(() => {
		void api.drafts[":key"]
			.$get({ param: { key: draftKey } })
			.then((res) => (res.ok ? res.json() : null))
			.then((draft) => {
				// A link to a new note wins over an old draft with a different title.
				if (draft && !(initialTopic && draft.topic !== initialTopic)) {
					setDate(draft.date);
					setTopic(draft.topic);
					setNotes(draft.notes);
					setRestored(true);
				}
			})
			.finally(() => setLoaded(true));
	}, [draftKey, initialTopic]);

	const changed = date !== saved.date || topic !== saved.topic || notes !== saved.notes;

	// Keeps a copy of unsaved typing on the server, so closing the window doesn't lose it.
	useEffect(() => {
		if (!loaded) return;
		const param = { key: draftKey };
		const timer = setTimeout(() => {
			if (changed) void api.drafts[":key"].$put({ param, json: { date, topic, notes } });
			else void api.drafts[":key"].$delete({ param });
		}, DRAFT_DELAY_MS);
		return () => clearTimeout(timer);
	}, [loaded, changed, draftKey, date, topic, notes]);

	function discard() {
		setDate(saved.date);
		setTopic(saved.topic);
		setNotes(saved.notes);
		setRestored(false);
	}

	async function submit() {
		if (saving.current) return;
		// Guards against a second Enter or click creating the entry twice while the first save is in flight.
		saving.current = true;
		const problem = await onSave({ date, topic, notes }).catch(() => "Couldn't reach Etch's server.");
		saving.current = false;
		setError(problem);
		if (problem) return;
		setRestored(false);
		if (!entry) {
			setDate(today());
			setTopic("");
			setNotes("");
		}
	}

	if (!loaded) return null;

	return (
		<form
			className="tile entry-form"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div className="row">
				<DatePicker value={date} onChange={setDate} label="Date" />
				<input
					className="topic"
					placeholder="Topic"
					value={topic}
					onChange={(e) => setTopic(e.target.value)}
					required
				/>
			</div>
			<MarkdownEditor
				value={notes}
				onChange={setNotes}
				placeholder="What did you learn? Put it in your own words. Ctrl+K links another note."
				minHeight="160px"
				titles={titles}
			/>
			{error && <p className="error">{error}</p>}
			<div className="actions">
				{restored && (
					<p className="hint restored">
						Restored what you hadn't saved.
						<button type="button" onClick={discard}>
							Discard
						</button>
					</p>
				)}
				{onCancel && (
					<button
						type="button"
						onClick={() => {
							void api.drafts[":key"].$delete({ param: { key: draftKey } });
							onCancel();
						}}
					>
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
