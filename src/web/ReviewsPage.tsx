import { useEffect, useState } from "react";
import { api, type DueExercise } from "./api";
import { CodeBlock } from "./CodeBlock";

export function ReviewsPage() {
	const [due, setDue] = useState<DueExercise[] | null>(null);

	useEffect(() => {
		void api.reviews.due
			.$get()
			.then((res) => res.json())
			.then(setDue);
	}, []);

	async function grade(exercise: DueExercise, got: boolean) {
		const res = await api.reviews[":id"].result.$post({ param: { id: String(exercise.id) }, json: { got } });
		if (res.ok) setDue((prev) => prev?.filter((e) => e.id !== exercise.id) ?? null);
	}

	if (due === null) return null;

	return (
		<section>
			<h2>{due.length === 0 ? "Reviews" : `Reviews (${due.length} left)`}</h2>
			{due.length === 0 ? (
				<p className="empty">Nothing due today.</p>
			) : (
				// key resets the card's typed answer and reveal state for each new exercise.
				<ReviewCard key={due[0].id} exercise={due[0]} onGrade={(got) => void grade(due[0], got)} />
			)}
		</section>
	);
}

function ReviewCard({ exercise, onGrade }: { exercise: DueExercise; onGrade: (got: boolean) => void }) {
	const [attempt, setAttempt] = useState("");
	const [revealed, setRevealed] = useState(false);

	return (
		<article className="review">
			<span className="topic-label">{exercise.topic}</span>
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
			{revealed && (
				<div className="answer">
					<span className="topic-label">Saved answer</span>
					{exercise.language ? (
						<CodeBlock language={exercise.language} value={exercise.answer} />
					) : (
						<p className="notes">{exercise.answer}</p>
					)}
				</div>
			)}
			<div className="actions">
				{revealed ? (
					<>
						<button onClick={() => onGrade(false)}>Missed it</button>
						<button className="primary" onClick={() => onGrade(true)}>
							Got it
						</button>
					</>
				) : (
					<button className="primary" onClick={() => setRevealed(true)}>
						Reveal
					</button>
				)}
			</div>
		</article>
	);
}
