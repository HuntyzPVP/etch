import { useRef, useState } from "react";
import { today } from "../shared/dates";
import { LANGUAGES, type Language } from "../shared/languages";
import type { Entry, EntryInput } from "./api";
import { CodeBlock } from "./CodeBlock";
import { DatePicker } from "./Pickers";
import { LANGUAGE_INFO } from "./codeLanguages";

type Props = {
	entry?: Entry;
	onSave: (input: EntryInput) => Promise<boolean>;
	onCancel?: () => void;
};

// key lets React track each block while you add and remove them; id is set only for saved snippets.
type Draft = { key: string; id?: number; language: Language; code: string };

export function EntryForm({ entry, onSave, onCancel }: Props) {
	const [date, setDate] = useState(entry?.date ?? today());
	const [topic, setTopic] = useState(entry?.topic ?? "");
	const [notes, setNotes] = useState(entry?.notes ?? "");
	const [drafts, setDrafts] = useState<Draft[]>(
		() => entry?.snippets.map((s) => ({ key: String(s.id), id: s.id, language: s.language, code: s.code })) ?? [],
	);
	const [error, setError] = useState<string | null>(null);
	const saving = useRef(false);

	function addDraft() {
		setDrafts((prev) => [...prev, { key: crypto.randomUUID(), language: "python", code: "" }]);
	}

	function updateDraft(key: string, change: Partial<Draft>) {
		setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));
	}

	function removeDraft(key: string) {
		setDrafts((prev) => prev.filter((d) => d.key !== key));
	}

	async function submit() {
		if (saving.current) return;
		if (drafts.some((d) => d.code.trim() === "")) {
			setError("A snippet is empty. Add code to it or remove it.");
			return;
		}
		const snippets: EntryInput["snippets"] = drafts.map((d) => ({ id: d.id, language: d.language, code: d.code }));
		// Guards against a second Enter or click creating the entry twice while the first save is in flight.
		saving.current = true;
		const saved = await onSave({ date, topic, notes, snippets }).catch(() => false);
		saving.current = false;
		setError(saved ? null : "Couldn't save. Check the date and topic.");
		if (saved && !entry) {
			setTopic("");
			setNotes("");
			setDrafts([]);
		}
	}

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
			<textarea
				placeholder="What did you learn? Put it in your own words."
				rows={5}
				value={notes}
				onChange={(e) => setNotes(e.target.value)}
			/>
			{drafts.map((draft) => (
				<div key={draft.key} className="snippet-draft">
					<div className="row">
						<select
							value={draft.language}
							onChange={(e) => updateDraft(draft.key, { language: e.target.value as Language })}
						>
							{LANGUAGES.map((language) => (
								<option key={language} value={language}>
									{LANGUAGE_INFO[language].label}
								</option>
							))}
						</select>
						<button type="button" onClick={() => removeDraft(draft.key)}>
							Remove
						</button>
					</div>
					<CodeBlock
						language={draft.language}
						value={draft.code}
						onChange={(code) => updateDraft(draft.key, { code })}
					/>
				</div>
			))}
			{error && <p className="error">{error}</p>}
			<div className="actions">
				<button type="button" className="add" onClick={addDraft}>
					Add snippet
				</button>
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
