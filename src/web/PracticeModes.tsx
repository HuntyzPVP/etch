import { useEffect, useState } from "react";
import type { PracticeExercise } from "./api";
import { CodeBlock } from "./CodeBlock";

const SESSION_SIZE = 20;
const MATCH_PAIRS = 6;

function shuffle<T>(items: T[]) {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function Answer({ exercise }: { exercise: PracticeExercise }) {
	return exercise.language ? (
		<CodeBlock language={exercise.language} value={exercise.answer} />
	) : (
		<p className="notes">{exercise.answer}</p>
	);
}

function Finished({ text, onAgain }: { text: string; onAgain: () => void }) {
	return (
		<section className="tile summary">
			<h2>Practice complete</h2>
			<p className="big-stat">{text}</p>
			<button className="primary" onClick={onAgain}>
				Practice again
			</button>
		</section>
	);
}

export function Flashcards({ pool }: { pool: PracticeExercise[] }) {
	const [round, setRound] = useState(0);
	const [deck, setDeck] = useState(() => shuffle(pool).slice(0, SESSION_SIZE));
	const [index, setIndex] = useState(0);
	const [known, setKnown] = useState(0);

	if (index >= deck.length) {
		return (
			<Finished
				text={`${known} of ${deck.length} known`}
				onAgain={() => {
					setRound((r) => r + 1);
					setDeck(shuffle(pool).slice(0, SESSION_SIZE));
					setIndex(0);
					setKnown(0);
				}}
			/>
		);
	}

	return (
		<>
			<p className="hint">
				Card {index + 1} of {deck.length}. Click the card or press Space to flip.
			</p>
			<Flashcard
				key={`${round}-${index}`}
				exercise={deck[index]}
				onNext={(knewIt) => {
					if (knewIt) setKnown((k) => k + 1);
					setIndex((i) => i + 1);
				}}
			/>
		</>
	);
}

function Flashcard({ exercise, onNext }: { exercise: PracticeExercise; onNext: (knewIt: boolean) => void }) {
	const [flipped, setFlipped] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code !== "Space" || (e.target as HTMLElement).closest("input, textarea, .cm-editor")) return;
			e.preventDefault();
			setFlipped((f) => !f);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<div className="flashcard-wrap">
			<div
				className={flipped ? "flashcard flipped" : "flashcard"}
				role="button"
				tabIndex={0}
				aria-label={flipped ? "Show the question" : "Show the answer"}
				onClick={() => setFlipped((f) => !f)}
			>
				<div className="face front">
					<span className="pill">{exercise.topic}</span>
					<p className="prompt">{exercise.prompt}</p>
				</div>
				<div className="face back">
					<span className="label">Answer</span>
					<Answer exercise={exercise} />
				</div>
			</div>
			<div className="actions">
				<button onClick={() => onNext(false)}>Still learning</button>
				<button className="success" onClick={() => onNext(true)}>
					Know it
				</button>
			</div>
		</div>
	);
}

// Distractors come from other exercises of the same kind (code with code, words with words) when possible.
function buildQuestion(exercise: PracticeExercise, pool: PracticeExercise[]) {
	const others = shuffle(pool.filter((e) => e.id !== exercise.id && e.answer !== exercise.answer));
	const sameKind = others.filter((e) => (e.language === null) === (exercise.language === null));
	const picks = [...sameKind, ...others.filter((e) => !sameKind.includes(e))].slice(0, 3);
	return shuffle([exercise, ...picks]);
}

function makeQuestions(pool: PracticeExercise[]) {
	return shuffle(pool)
		.slice(0, SESSION_SIZE)
		.map((exercise) => ({ exercise, options: buildQuestion(exercise, pool) }));
}

export function MultipleChoice({ pool }: { pool: PracticeExercise[] }) {
	const [round, setRound] = useState(0);
	const [questions, setQuestions] = useState(() => makeQuestions(pool));
	const [index, setIndex] = useState(0);
	const [chosen, setChosen] = useState<number | null>(null);
	const [score, setScore] = useState(0);

	if (index >= questions.length) {
		return (
			<Finished
				text={`${score} of ${questions.length} correct`}
				onAgain={() => {
					setRound((r) => r + 1);
					setQuestions(makeQuestions(pool));
					setIndex(0);
					setScore(0);
					setChosen(null);
				}}
			/>
		);
	}

	const { exercise, options } = questions[index];

	return (
		<section className="tile choice" key={`${round}-${index}`}>
			<div className="review-head">
				<span className="pill">{exercise.topic}</span>
				<span className="hint">
					{index + 1} of {questions.length}
				</span>
			</div>
			<p className="prompt">{exercise.prompt}</p>
			<div className="options">
				{options.map((option) => {
					const state =
						chosen === null ? "" : option.id === exercise.id ? "correct" : option.id === chosen ? "wrong" : "faded";
					return (
						<button
							key={option.id}
							className={`option ${state}`}
							disabled={chosen !== null}
							onClick={() => {
								setChosen(option.id);
								if (option.id === exercise.id) setScore((s) => s + 1);
							}}
						>
							{option.language ? <pre>{option.answer}</pre> : option.answer}
						</button>
					);
				})}
			</div>
			{chosen !== null && (
				<div className="actions">
					<button
						className="primary"
						autoFocus
						onClick={() => {
							setChosen(null);
							setIndex((i) => i + 1);
						}}
					>
						Next
					</button>
				</div>
			)}
		</section>
	);
}

type Tile = { key: string; pairId: number; text: string; code: boolean };

function dealTiles(pool: PracticeExercise[]) {
	const picked = shuffle(pool).slice(0, MATCH_PAIRS);
	return shuffle(
		picked.flatMap<Tile>((e) => [
			{ key: `p${e.id}`, pairId: e.id, text: e.prompt, code: false },
			{ key: `a${e.id}`, pairId: e.id, text: e.answer, code: e.language !== null },
		]),
	);
}

const BEST_KEY = "etch-match-best";

function readBest() {
	try {
		const saved = Number(localStorage.getItem(BEST_KEY));
		return saved > 0 ? saved : null;
	} catch {
		return null;
	}
}

export function Match({ pool }: { pool: PracticeExercise[] }) {
	const [tiles, setTiles] = useState(() => dealTiles(pool));
	const [selected, setSelected] = useState<string | null>(null);
	const [matched, setMatched] = useState<Set<number>>(new Set());
	const [wrong, setWrong] = useState<string[]>([]);
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [best, setBest] = useState(readBest);
	const pairCount = tiles.length / 2;
	const done = matched.size === pairCount;

	useEffect(() => {
		if (startedAt === null || done) return;
		const timer = setInterval(() => setElapsed(performance.now() - startedAt), 100);
		return () => clearInterval(timer);
	}, [startedAt, done]);

	// at is the click event's timestamp, on the same clock as performance.now().
	function pick(tile: Tile, at: number) {
		if (matched.has(tile.pairId) || tile.key === selected) return;
		if (startedAt === null) setStartedAt(at);
		if (selected === null) {
			setSelected(tile.key);
			return;
		}
		const first = tiles.find((t) => t.key === selected)!;
		setSelected(null);
		if (first.pairId !== tile.pairId) {
			setWrong([first.key, tile.key]);
			return;
		}
		const next = new Set(matched).add(tile.pairId);
		setMatched(next);
		if (next.size === pairCount && startedAt !== null) {
			const time = at - startedAt;
			setElapsed(time);
			if (best === null || time < best) {
				setBest(time);
				try {
					localStorage.setItem(BEST_KEY, String(time));
				} catch {
					// Best time just won't persist.
				}
			}
		}
	}

	function restart() {
		setTiles(dealTiles(pool));
		setSelected(null);
		setMatched(new Set());
		setWrong([]);
		setStartedAt(null);
		setElapsed(0);
	}

	const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

	return (
		<section className="match">
			<div className="match-bar">
				<span className="match-time">{seconds(elapsed)}</span>
				<span className="hint">{best !== null ? `Best ${seconds(best)}` : "Match each prompt with its answer"}</span>
				<button onClick={restart}>New round</button>
			</div>
			{done ? (
				<Finished
					text={`All ${pairCount} matched in ${seconds(elapsed)}${elapsed === best ? ". New best!" : ""}`}
					onAgain={restart}
				/>
			) : (
				<div className="match-grid">
					{tiles.map((tile) => (
						<button
							key={tile.key}
							className={[
								"match-tile",
								tile.code && "code",
								tile.key === selected && "selected",
								matched.has(tile.pairId) && "matched",
								wrong.includes(tile.key) && "wrong",
							]
								.filter(Boolean)
								.join(" ")}
							disabled={matched.has(tile.pairId)}
							onClick={(e) => pick(tile, e.timeStamp)}
							onAnimationEnd={(e) => {
								if (e.animationName === "shake") setWrong([]);
							}}
						>
							<span>{tile.text}</span>
						</button>
					))}
				</div>
			)}
		</section>
	);
}
