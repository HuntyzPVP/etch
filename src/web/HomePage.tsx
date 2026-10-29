import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { formatDate, today } from "../shared/dates";
import { api, isOnDuty, useDataChanged, type Entry, type PlannerItem, type Stats } from "./api";
import { ItemRow, savePlannerItem, useDeleteItem } from "./PlannerPage";

type HomeData = {
	lastEntry: Entry | undefined;
	dueCount: number;
	planned: PlannerItem[];
	stats: Stats;
	onDuty: boolean;
};

async function fetchHome(): Promise<HomeData> {
	const [entries, due, items, stats, settings] = await Promise.all([
		api.entries.$get().then((res) => res.json()),
		api.reviews.due.$get().then((res) => res.json()),
		api.planner.$get().then((res) => res.json()),
		api.stats.$get().then((res) => res.json()),
		api.settings.$get().then((res) => res.json()),
	]);
	return {
		lastEntry: entries[0],
		dueCount: due.length,
		planned: items.filter((item) => !item.done && item.due_date !== null && item.due_date <= today()),
		stats,
		onDuty: isOnDuty(settings),
	};
}

// Feeds the staggered entrance; each tile waits a little longer than the one before.
const order = (i: number) => ({ "--i": i }) as CSSProperties;

export function HomePage() {
	const [data, setData] = useState<HomeData | null>(null);
	const deleteItem = useDeleteItem();

	useEffect(() => {
		void fetchHome().then(setData);
	}, []);

	async function reload() {
		setData(await fetchHome());
	}

	useDataChanged(() => void reload());

	if (data === null) return null;
	const { lastEntry, dueCount, planned, stats, onDuty } = data;

	return (
		<div className="home-grid">
			<Greeting dueCount={onDuty ? dueCount : 0} taskCount={planned.length} />
			<Clock style={order(1)} />
			<section className="tile reviews-tile" style={order(2)}>
				<div className="tile-head">
					<h2>Reviews</h2>
					{dueCount > 0 && (
						<Link to="/reviews" className={onDuty ? "button primary" : "button"}>
							Start reviews
						</Link>
					)}
				</div>
				<p className="big-stat">{dueCount === 0 ? "All caught up" : `${dueCount} due today`}</p>
				{!onDuty && dueCount > 0 && <p className="hint">Off hours. They'll keep until you're ready.</p>}
				<Upcoming days={stats.upcoming} />
			</section>
			<section className="tile stats-tile" style={order(3)}>
				<Stat value={stats.streak} label="day streak" />
				<Stat value={stats.entries} label={stats.entries === 1 ? "entry logged" : "entries logged"} />
				<Stat value={stats.retired} label="etched in" />
			</section>
			<section className="tile plan-tile" style={order(4)}>
				<h2>Today's plan</h2>
				{planned.length === 0 ? (
					<p className="empty">Nothing due today. Add something on the planner.</p>
				) : (
					<ul className="item-list">
						{planned.map((item) => (
							<ItemRow
								key={item.id}
								item={item}
								showDate={item.due_date !== today()}
								onToggle={() => void savePlannerItem(item, { done: true }).then(reload)}
								onEdit={async (input) => {
									const saved = await savePlannerItem(item, input);
									if (saved) await reload();
									return saved;
								}}
								onDelete={() => deleteItem(item)}
								onGone={() => void reload()}
							/>
						))}
					</ul>
				)}
				<Link to="/planner" className="button quiet">
					Open planner
				</Link>
			</section>
			<section className="tile activity-tile" style={order(5)}>
				<h2>Activity</h2>
				<ActivityGrid days={stats.activity} />
			</section>
			<section className="tile last-tile" style={order(6)}>
				<h2>Last session</h2>
				{lastEntry ? (
					<>
						<span className="pill">{formatDate(lastEntry.date, { month: "short", day: "numeric" })}</span>
						<h3>{lastEntry.topic}</h3>
						{lastEntry.notes && <p className="notes clamp">{lastEntry.notes}</p>}
					</>
				) : (
					<p className="empty">Nothing logged yet.</p>
				)}
			</section>
			<Link to="/log" className="button primary log-button" style={order(7)}>
				Log what I learned
			</Link>
		</div>
	);
}

function Greeting({ dueCount, taskCount }: { dueCount: number; taskCount: number }) {
	const hour = new Date().getHours();
	const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
	const pieces = [
		dueCount > 0 && `${dueCount} review${dueCount === 1 ? "" : "s"}`,
		taskCount > 0 && `${taskCount} task${taskCount === 1 ? "" : "s"}`,
	].filter(Boolean);

	return (
		<div className="greeting" style={order(0)}>
			<h1>Good {part}.</h1>
			<p>
				{pieces.length > 0 ? `${pieces.join(" and ")} today.` : "Nothing waiting. A good day to learn something new."}
			</p>
		</div>
	);
}

function Clock({ style }: { style: CSSProperties }) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(now);
	const time = parts
		.filter((part) => part.type !== "dayPeriod")
		.map((part) => part.value)
		.join("")
		.trim();
	const period = parts.find((part) => part.type === "dayPeriod")?.value;

	return (
		<section className="tile clock-tile" aria-label="Current time" style={style}>
			<p className="clock-time">
				{time}
				{period && <span className="clock-period">{period}</span>}
			</p>
			<p className="clock-day">{now.toLocaleDateString(undefined, { weekday: "long" })}</p>
			<p className="clock-date">{now.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p>
		</section>
	);
}

function Stat({ value, label }: { value: number; label: string }) {
	const shown = useCountUp(value);
	return (
		<div className="stat">
			<span className="stat-value">{shown}</span>
			<span className="label">{label}</span>
		</div>
	);
}

function useCountUp(target: number, duration = 700) {
	const [value, setValue] = useState(0);

	useEffect(() => {
		const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const t = instant ? 1 : Math.min(1, (now - start) / duration);
			setValue(Math.round(target * (1 - (1 - t) ** 3)));
			if (t < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [target, duration]);

	return value;
}

function level(count: number) {
	if (count === 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4;
}

function ActivityGrid({ days }: { days: Stats["activity"] }) {
	const active = days.filter((d) => d.count > 0).length;

	return (
		<figure className="activity">
			<div className="activity-grid" role="img" aria-label={`Active on ${active} of the last ${days.length} days`}>
				{days.map((d) => (
					<span
						key={d.day}
						className={d.future ? "cell future" : `cell level-${level(d.count)}`}
						title={
							d.future
								? undefined
								: `${formatDate(d.day, { month: "short", day: "numeric" })}: ${d.count === 0 ? "nothing" : `${d.count} logged or reviewed`}`
						}
					/>
				))}
			</div>
			<figcaption className="activity-legend">
				<span className="label">Last 12 weeks</span>
				<span className="legend-scale" aria-hidden>
					<span className="label">Less</span>
					{[0, 1, 2, 3, 4].map((l) => (
						<span key={l} className={`cell level-${l}`} />
					))}
					<span className="label">More</span>
				</span>
			</figcaption>
		</figure>
	);
}

function Upcoming({ days }: { days: Stats["upcoming"] }) {
	const max = Math.max(1, ...days.map((d) => d.count));

	return (
		<figure className="upcoming" aria-label="Reviews due over the next 7 days">
			{days.map((d, i) => (
				<div key={d.day} className="upcoming-day" title={`${formatDate(d.day, { weekday: "long" })}: ${d.count} due`}>
					<span className="upcoming-count">{d.count > 0 ? d.count : ""}</span>
					<span className="upcoming-track">
						<span
							className="upcoming-bar"
							style={{ height: `${(d.count / max) * 100}%`, animationDelay: `${300 + i * 40}ms` }}
						/>
					</span>
					<span className="label">{i === 0 ? "Today" : formatDate(d.day, { weekday: "narrow" })}</span>
				</div>
			))}
		</figure>
	);
}
