import { useEffect, useState } from "react";
import { Link } from "react-router";
import { RETIRE_AFTER, type ReviewOutcome } from "../shared/spacing";
import { api, type DueExercise, type PracticeExercise } from "./api";
import { CodeBlock } from "./CodeBlock";
import { Flashcards, Match, MultipleChoice } from "./PracticeModes";

type Result = { exercise: DueExercise; got: boolean; outcome: ReviewOutcome };

const MODES = [
	{ id: "write", label: "Write" },
	{ id: "flashcards", label: "Flashcards" },
	{ id: "choice", label: "Multiple choice" },
	{ id: "match", label: "Match" },
] as const;

type Mode = (typeof MODES)[number]["id"];

export function ReviewsPage() {
	const [mode, setMode] = useState<Mode>("write");
	const [pool, setPool] = useState<PracticeExercise[] | null>(null);

	useEffect(() => {
		if (mode === "write" || pool !== null) return;
		void api.reviews.practice
			.$get()
			.then((res) => res.json())
			.then(setPool);
	}, [mode, pool]);

	return (
		<div className="narrow">
			<div className="page-heading">
				<h1>Reviews</h1>
			</div>
			<div className="segmented mode-tabs" role="tablist">
				{MODES.map((m) => (
					<button
						key={m.id}
						role="tab"
						aria-selected={mode === m.id}
						className={mode === m.id ? "selected" : undefined}
						onClick={() => setMode(m.id)}
					>
						{m.label}
					</button>
				))}
			</div>
			{mode === "write" ? (
				<WriteReviews />
			) : (
				pool !== null && (
					<div className="practice" key={mode}>
						<p className="hint">Practice only. This won't change when exercises come back.</p>
						{pool.length < 2 ? (
							<p className="empty">
								Practice needs at least two exercises. They arrive each evening from what you log.
							</p>
						) : mode === "flashcards" ? (
							<Flashcards pool={pool} />
						) : mode === "choice" ? (
							<MultipleChoice pool={pool} />
						) : (
							<Match pool={pool} />
						)}
					</div>
				)
			)}
		</div>
	);
}

// Graded reviews: only these move the streak notches and schedule the next review.
function WriteReviews() {
	const [queue, setQueue] = useState<DueExercise[] | null>(null);
	const [results, setResults] = useState<Result[]>([]);
	const [answered, setAnswered] = useState(0);
	const [generating, setGenerating] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		void api.reviews.due
			.$get()
			.then((res) => res.json())
			.then(setQueue);
	}, []);

	async function generate() {
		setGenerating(true);
		setNotice(null);
		try {
			const res = await api.reviews.generate.$post();
			const body = (await res.json()) as { saved?: number; error?: string };
			if (body.saved === undefined) setNotice(body.error ?? "Couldn't write exercises.");
			else if (body.saved === 0) setNotice("Nothing new to turn into exercises. Log something first.");
			else setNotice(`Added ${body.saved} new exercise${body.saved === 1 ? "" : "s"}.`);
			// A fresh list starts a fresh session, including anything that was already due.
			setQueue(await api.reviews.due.$get().then((r) => r.json()));
			setResults([]);
			setAnswered(0);
		} catch {
			setNotice("Couldn't reach Etch. Is the server running?");
		} finally {
			setGenerating(false);
		}
	}

	async function grade(exercise: DueExercise, got: boolean) {
		const res = await api.reviews[":id"].result.$post({ param: { id: String(exercise.id) }, json: { got } });
		if (!res.ok) return null;
		setAnswered((n) => n + 1);
		return (await res.json()) as ReviewOutcome;
	}

	if (queue === null) return null;

	const current = queue[results.length];
	const ahead = Math.min(2, queue.length - results.length - 1);

	return (
		<>
			<div className="write-bar">
				{queue.length > 0 && (
					<span className="pill">
						{Math.min(answered + 1, queue.length)} of {queue.length} due today
					</span>
				)}
				<button
					className={generating ? "generate busy" : "generate"}
					disabled={generating}
					onClick={() => void generate()}
				>
					{generating ? "Writing exercises…" : "Generate now"}
				</button>
			</div>
			{notice && <p className="hint notice">{notice}</p>}
			{queue.length > 0 && (
				<div
					className="session-bar"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={queue.length}
					aria-valuenow={answered}
				>
					<span style={{ width: `${(answered / queue.length) * 100}%` }} />
				</div>
			)}
			{queue.length === 0 && (
				<p className="empty">All caught up. Try a practice mode, or come back when new exercises arrive.</p>
			)}
			{current && (
				<div className="review-stack">
					{Array.from({ length: ahead }, (_, i) => (
						<div key={i} className={`ghost ghost-${i + 1}`} aria-hidden />
					))}
					{/* key resets the card's typed answer and phase for each new exercise. */}
					<ReviewCard
						key={current.id}
						exercise={current}
						onGrade={(got) => grade(current, got)}
						onDone={(result) => setResults((prev) => [...prev, result])}
					/>
				</div>
			)}
			{queue.length > 0 && !current && <Summary results={results} />}
		</>
	);
}

// answering → revealed → etching (Got it only) → holding (outcome shown) → leaving → done.
type Phase = "answering" | "revealed" | "saving" | "etching" | "holding" | "leaving";

type ReviewCardProps = {
	exercise: DueExercise;
	onGrade: (got: boolean) => Promise<ReviewOutcome | null>;
	onDone: (result: Result) => void;
};

function ReviewCard({ exercise, onGrade, onDone }: ReviewCardProps) {
	const [attempt, setAttempt] = useState("");
	const [phase, setPhase] = useState<Phase>("answering");
	const [result, setResult] = useState<{ got: boolean; outcome: ReviewOutcome } | null>(null);
	const revealed = phase !== "answering";
	const settled = phase === "holding" || phase === "leaving";

	async function grade(got: boolean) {
		setPhase("saving");
		const outcome = await onGrade(got).catch(() => null);
		if (!outcome) {
			setPhase("revealed");
			return;
		}
		setResult({ got, outcome });
		setPhase(got ? "etching" : "holding");
	}

	const cardClass = [
		"tile review",
		phase === "leaving" && "leaving",
		settled && result?.outcome.retired && "retired",
		settled && result && !result.got && "reset",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<article
			className={cardClass}
			onAnimationEnd={(e) => {
				if (e.animationName === "card-out" && result) onDone({ exercise, ...result });
			}}
		>
			<div className="review-head">
				<span className="pill">{exercise.topic}</span>
				<Notches
					streak={exercise.streak}
					etching={result?.got === true && (phase === "etching" || settled)}
					onEtched={() => setPhase("holding")}
				/>
			</div>
			<p className="prompt">{exercise.prompt}</p>
			{exercise.language ? (
				<CodeBlock language={exercise.language} value={attempt} onChange={setAttempt} />
			) : (
				<textarea
					rows={4}
					placeholder="Answer from memory."
					value={attempt}
					onChange={(e) => setAttempt(e.target.value)}
				/>
			)}
			<div className={revealed ? "reveal open" : "reveal"}>
				<div className="reveal-inner">
					<span className="label">Saved answer</span>
					{exercise.language ? (
						<CodeBlock language={exercise.language} value={exercise.answer} />
					) : (
						<p className="notes">{exercise.answer}</p>
					)}
				</div>
			</div>
			<div className="actions">
				{settled && result && (
					// The pill's own animation is the pause before the card moves on.
					<span
						className={result.got ? "outcome got" : "outcome"}
						onAnimationEnd={(e) => {
							e.stopPropagation();
							setPhase("leaving");
						}}
					>
						{describeOutcome(result.got, result.outcome)}
					</span>
				)}
				{phase === "answering" && (
					<button className="primary" onClick={() => setPhase("revealed")}>
						Reveal
					</button>
				)}
				{(phase === "revealed" || phase === "saving") && (
					<>
						<button disabled={phase === "saving"} onClick={() => void grade(false)}>
							Missed it
						</button>
						<button className="success" disabled={phase === "saving"} onClick={() => void grade(true)}>
							Got it
						</button>
					</>
				)}
			</div>
		</article>
	);
}

function describeOutcome(got: boolean, outcome: ReviewOutcome) {
	if (outcome.retired) return "Retired. It's etched in.";
	const when = outcome.interval_days === 1 ? "tomorrow" : `in ${outcome.interval_days} days`;
	return got ? `Next review ${when}` : `Back ${when}`;
}

type NotchesProps = { streak: number; etching?: boolean; onEtched?: () => void };

function Notches({ streak, etching = false, onEtched }: NotchesProps) {
	return (
		<div className="notches" role="img" aria-label={`${streak} of ${RETIRE_AFTER} correct in a row`}>
			{Array.from({ length: RETIRE_AFTER }, (_, i) => (
				<span key={i} className={i < streak ? "notch filled" : "notch"}>
					{etching && i === streak && (
						<span
							className="notch-etch"
							onAnimationEnd={(e) => {
								e.stopPropagation();
								onEtched?.();
							}}
						/>
					)}
				</span>
			))}
		</div>
	);
}

function Summary({ results }: { results: Result[] }) {
	const got = results.filter((r) => r.got).length;

	return (
		<section className="tile summary">
			<h2>Session complete</h2>
			<p className="big-stat">
				{results.length} reviewed, {got} got it
			</p>
			<ul className="summary-list">
				{results.map(({ exercise, outcome }, i) => (
					<li key={exercise.id} style={{ animationDelay: `${i * 60}ms` }}>
						<span className="summary-prompt">{exercise.prompt}</span>
						<span className={outcome.retired ? "retired" : undefined}>
							<Notches streak={outcome.streak} />
						</span>
					</li>
				))}
			</ul>
			<Link to="/" className="button primary">
				Back home
			</Link>
		</section>
	);
}
