import { useEffect, useState } from "react";
import { api, type Suggestion } from "./api";

async function fetchSuggestions() {
	const res = await api.suggestions.$get();
	return res.json();
}

export function Suggestions({ onAccepted }: { onAccepted: () => void }) {
	const [list, setList] = useState<Suggestion[] | null>(null);
	const [thinking, setThinking] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		void fetchSuggestions().then(setList);
	}, []);

	async function suggest() {
		setThinking(true);
		setNotice(null);
		try {
			const res = await api.suggestions.generate.$post();
			const body = (await res.json()) as { saved?: number; error?: string };
			if (body.saved === undefined) setNotice(body.error ?? "Couldn't get suggestions.");
			else if (body.saved === 0) setNotice("Nothing logged in the last 30 days to suggest from.");
			setList(await fetchSuggestions());
		} catch {
			setNotice("Couldn't reach Etch. Is the server running?");
		} finally {
			setThinking(false);
		}
	}

	async function close(suggestion: Suggestion, accepted: boolean) {
		const param = { id: String(suggestion.id) };
		const request = accepted
			? api.suggestions[":id"].accept.$post({ param })
			: api.suggestions[":id"].dismiss.$post({ param });
		const ok = await request.then((res) => res.ok).catch(() => false);
		if (!ok) return;
		setList((current) => current?.filter((s) => s.id !== suggestion.id) ?? null);
		if (accepted) onAccepted();
	}

	if (list === null) return null;

	return (
		<section className="tile suggestions">
			<div className="tile-head">
				<h2>Suggested</h2>
				<button className={thinking ? "generate busy" : "generate"} disabled={thinking} onClick={() => void suggest()}>
					{thinking ? "Thinking…" : "Suggest now"}
				</button>
			</div>
			{notice && <p className="hint notice">{notice}</p>}
			{list.length === 0 ? (
				<p className="empty">No suggestions right now. New ones come with the evening's reviews.</p>
			) : (
				<ul className="suggestion-list">
					{list.map((s) => (
						<li key={s.id} className="suggestion">
							<span className="pill">{s.kind === "topic" ? "Learn" : "Practice"}</span>
							<div className="suggestion-text">
								<span className="suggestion-title">{s.title}</span>
								<span className="hint">{s.reason}</span>
							</div>
							<div className="actions">
								<button onClick={() => void close(s, false)}>Dismiss</button>
								<button className="primary" onClick={() => void close(s, true)}>
									Accept
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
