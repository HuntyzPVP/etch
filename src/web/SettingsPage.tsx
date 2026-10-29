import { useEffect, useState } from "react";
import { api } from "./api";

export function SettingsPage() {
	const [reviewTime, setReviewTime] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		void api.settings
			.$get()
			.then((res) => res.json())
			.then((settings) => setReviewTime(settings.review_time));
	}, []);

	async function save(time: string) {
		const res = await api.settings.$put({ json: { review_time: time } });
		setStatus(res.ok ? "Saved." : "Couldn't save that time.");
	}

	if (reviewTime === null) return null;

	return (
		<section>
			<h2>Settings</h2>
			<form
				className="entry-form"
				onSubmit={(e) => {
					e.preventDefault();
					void save(reviewTime);
				}}
			>
				<label className="setting">
					<span>Generate new reviews at</span>
					<input
						type="time"
						value={reviewTime}
						onChange={(e) => {
							setReviewTime(e.target.value);
							setStatus(null);
						}}
						required
					/>
				</label>
				<p className="hint">New exercises are written once a day, at this time or as soon as your PC is on after it.</p>
				<div className="actions">
					{status && <span className="hint">{status}</span>}
					<button type="submit" className="primary">
						Save
					</button>
				</div>
			</form>
		</section>
	);
}
