import { useEffect, useState } from "react";
import { Link } from "react-router";
import { formatDate, today } from "../shared/dates";
import { api, type Entry, type PlannerItem } from "./api";
import { deletePlannerItem, ItemRow, savePlannerItem } from "./PlannerPage";

type HomeData = { lastEntry: Entry | undefined; dueCount: number; planned: PlannerItem[] };

async function fetchHome(): Promise<HomeData> {
	const [entries, due, items] = await Promise.all([
		api.entries.$get().then((res) => res.json()),
		api.reviews.due.$get().then((res) => res.json()),
		api.planner.$get().then((res) => res.json()),
	]);
	return {
		lastEntry: entries[0],
		dueCount: due.length,
		planned: items.filter((item) => !item.done && item.due_date !== null && item.due_date <= today()),
	};
}

export function HomePage() {
	const [data, setData] = useState<HomeData | null>(null);

	useEffect(() => {
		void fetchHome().then(setData);
	}, []);

	async function reload() {
		setData(await fetchHome());
	}

	if (data === null) return null;
	const { lastEntry, dueCount, planned } = data;

	return (
		<>
			{lastEntry && (
				<section>
					<h2>Last session</h2>
					<article className="entry">
						<time dateTime={lastEntry.date}>{formatDate(lastEntry.date)}</time>
						<h3>{lastEntry.topic}</h3>
						{lastEntry.notes && <p className="notes clamp">{lastEntry.notes}</p>}
					</article>
				</section>
			)}
			<section>
				<h2>Reviews</h2>
				<div className="home-card">
					<span>
						{dueCount === 0 ? "No reviews due today." : `${dueCount} review${dueCount === 1 ? "" : "s"} due today.`}
					</span>
					{dueCount > 0 && (
						<Link to="/reviews" className="button primary">
							Start reviews
						</Link>
					)}
				</div>
			</section>
			<section>
				<h2>Today's plan</h2>
				{planned.length === 0 ? (
					<div className="home-card">
						<span>Nothing due today.</span>
						<Link to="/planner" className="button">
							Open planner
						</Link>
					</div>
				) : (
					<ul className="planner-list">
						{planned.map((item) => (
							<ItemRow
								key={item.id}
								item={item}
								onToggle={() => void savePlannerItem(item, { done: true }).then(reload)}
								onEdit={async (input) => {
									const saved = await savePlannerItem(item, input);
									if (saved) await reload();
									return saved;
								}}
								onDelete={async () => {
									if (await deletePlannerItem(item)) await reload();
								}}
							/>
						))}
					</ul>
				)}
			</section>
			<section>
				<Link to="/log" className="button primary log-button">
					Log what I learned
				</Link>
			</section>
		</>
	);
}
