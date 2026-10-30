import { useEffect, useRef, useState } from "react";
import { formatDate, formatTime } from "../shared/dates";
import { api, DATA_CHANGED, type ChatAction, type Entry } from "./api";
import { markdownToPlain } from "./MarkdownEditor";

// Within the server's limits.
const MESSAGE_LIMIT = 8000;
const MAX_MESSAGES = 40;

type ActionState = "pending" | "saving" | "added" | "skipped" | "failed";
type Message = { role: "user" | "assistant"; content: string; actions?: { action: ChatAction; state: ActionState }[] };

// History lives only in this component: a reload or New chat starts clean.
export function Assistant() {
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [draft, setDraft] = useState("");
	const [waiting, setWaiting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const list = listRef.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, [messages, waiting, open]);

	async function send() {
		const content = draft.trim();
		if (!content || waiting) return;
		const next = [...messages, { role: "user" as const, content }];
		setMessages(next);
		setDraft("");
		setWaiting(true);
		setError(null);
		try {
			const res = await api.chat.$post({
				// Long chats send only their most recent messages, as many as the server accepts.
				json: { messages: next.slice(-MAX_MESSAGES).map(({ role, content }) => ({ role, content })) },
			});
			const body = (await res.json()) as { reply?: string; actions?: ChatAction[]; error?: string };
			if (body.reply) {
				const actions = (body.actions ?? []).map((action) => ({ action, state: "pending" as const }));
				setMessages((list) => [...list, { role: "assistant", content: body.reply!, actions }]);
			} else setError(typeof body.error === "string" ? body.error : "The assistant couldn't reply.");
		} catch {
			setError("Couldn't reach Etch. Is the server running?");
		} finally {
			setWaiting(false);
		}
	}

	function setActionState(messageIndex: number, actionIndex: number, state: ActionState) {
		setMessages((list) =>
			list.map((m, i) =>
				i !== messageIndex ? m : { ...m, actions: m.actions?.map((a, j) => (j === actionIndex ? { ...a, state } : a)) },
			),
		);
	}

	async function confirm(messageIndex: number, actionIndex: number, action: ChatAction) {
		setActionState(messageIndex, actionIndex, "saving");
		try {
			const ok = await apply(action);
			setActionState(messageIndex, actionIndex, ok ? "added" : "failed");
			if (ok) window.dispatchEvent(new Event(DATA_CHANGED));
		} catch {
			setActionState(messageIndex, actionIndex, "failed");
		}
	}

	return (
		<div className={open ? "assistant-dock open" : "assistant-dock"}>
			{open && (
				<section className="assistant-panel" aria-label="Assistant">
					<div className="assistant-head">
						<h2>Assistant</h2>
						<button
							className="quiet-button"
							disabled={waiting || messages.length === 0}
							onClick={() => {
								setMessages([]);
								setError(null);
							}}
						>
							New chat
						</button>
						<button className="icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}>
							×
						</button>
					</div>
					<div className="assistant-messages" ref={listRef}>
						{messages.length === 0 && (
							<p className="hint">
								Ask about what you've logged, how your reviews are going or what to learn next. It knows your Etch data
								and career notes, and asks before adding anything.
							</p>
						)}
						{messages.map((m, i) => (
							<div key={i} className={`bubble ${m.role}`}>
								<p className="notes">{m.content}</p>
								{m.actions?.map(({ action, state }, j) => (
									<ActionCard
										key={j}
										action={action}
										state={state}
										onConfirm={() => void confirm(i, j, action)}
										onSkip={() => setActionState(i, j, "skipped")}
									/>
								))}
							</div>
						))}
						{waiting && (
							<div className="bubble assistant typing" aria-label="Assistant is replying">
								<span />
								<span />
								<span />
							</div>
						)}
						{error && <p className="error">{error}</p>}
					</div>
					<form
						className="assistant-input"
						onSubmit={(e) => {
							e.preventDefault();
							void send();
						}}
					>
						<textarea
							value={draft}
							rows={2}
							placeholder="Message the assistant"
							aria-label="Message"
							maxLength={MESSAGE_LIMIT}
							autoFocus
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								// Enter sends; Shift+Enter starts a new line.
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									void send();
								}
							}}
						/>
						<button type="submit" className="primary" disabled={waiting || !draft.trim()}>
							Send
						</button>
					</form>
				</section>
			)}
			<button
				className="assistant-launcher"
				aria-expanded={open}
				aria-label={open ? "Hide assistant" : "Show assistant"}
				onClick={() => setOpen((o) => !o)}
			>
				<svg viewBox="0 0 16 16" aria-hidden className="icon">
					<path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" />
				</svg>
			</button>
		</div>
	);
}

async function apply(action: ChatAction) {
	if (action.kind === "add_planner_item") {
		const json = { title: action.title, due_date: action.due_date, due_time: action.due_time };
		return (await api.planner.$post({ json })).ok;
	}
	if (action.kind === "add_log_entry") {
		return (await api.entries.$post({ json: { date: action.date, topic: action.topic, notes: action.notes } })).ok;
	}
	const param = { id: String(action.id) };
	if (action.kind === "delete_note") return (await api.entries[":id"].$delete({ param })).ok;
	// Edits start from the note as it is now, not as the assistant saw it.
	const res = await api.entries[":id"].$get({ param });
	if (!res.ok) return false;
	const entry = (await res.json()) as Entry;
	const topic = action.kind === "rename_note" ? action.topic : entry.topic;
	const notes =
		action.kind === "append_to_note"
			? `${entry.notes.trimEnd()}\n\n${action.notes}`
			: action.kind === "rewrite_note"
				? action.notes
				: entry.notes;
	return (await api.entries[":id"].$put({ param, json: { date: entry.date, topic, notes } })).ok;
}

const STATE_LABELS: Partial<Record<ActionState, string>> = {
	added: "Done",
	skipped: "Skipped",
	failed: "Couldn't do this",
};

const ACTION_LABELS: Record<ChatAction["kind"], { label: string; button: string }> = {
	add_planner_item: { label: "Add to planner", button: "Add" },
	add_log_entry: { label: "New note", button: "Add" },
	append_to_note: { label: "Add to note", button: "Add" },
	rename_note: { label: "Rename note", button: "Rename" },
	rewrite_note: { label: "Rewrite note", button: "Save" },
	delete_note: { label: "Delete note", button: "Delete" },
};

type ActionCardProps = { action: ChatAction; state: ActionState; onConfirm: () => void; onSkip: () => void };

function ActionCard({ action, state, onConfirm, onSkip }: ActionCardProps) {
	const { label, button } = ACTION_LABELS[action.kind];
	let title: string;
	let when: string | null = null;
	let body: string | null = null;
	if (action.kind === "add_planner_item") {
		title = action.title;
		when =
			[
				action.due_date && formatDate(action.due_date, { weekday: "short", month: "short", day: "numeric" }),
				action.due_time && formatTime(action.due_time),
			]
				.filter(Boolean)
				.join(", ") || "Someday";
	} else if (action.kind === "rename_note") {
		title = `${action.from} → ${action.topic}`;
	} else {
		title = action.topic;
		if (action.kind === "add_log_entry") when = formatDate(action.date, { month: "short", day: "numeric" });
		if (action.kind !== "delete_note") body = markdownToPlain(action.notes);
	}

	return (
		<div className={`action-card ${state}`}>
			<span className="label">{label}</span>
			<span className="action-title">{title}</span>
			{when && <span className="pill">{when}</span>}
			{body && <p className="notes clamp">{body}</p>}
			{state === "pending" || state === "saving" ? (
				<div className="actions">
					<button disabled={state === "saving"} onClick={onSkip}>
						Skip
					</button>
					<button
						className={action.kind === "delete_note" ? "danger" : "primary"}
						disabled={state === "saving"}
						onClick={onConfirm}
					>
						{button}
					</button>
				</div>
			) : (
				<span className="hint">{STATE_LABELS[state]}</span>
			)}
		</div>
	);
}
