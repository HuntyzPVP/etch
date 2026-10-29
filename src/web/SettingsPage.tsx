import { useEffect, useState, type ReactNode } from "react";
import { api, SETTINGS_CHANGED, type AppSettings } from "./api";
import { TimePicker } from "./Pickers";
import { getTheme, setTheme, type ThemeChoice } from "./theme";

// Shown Monday first; values follow getDay(), where 0 is Sunday.
const DAYS = [
	{ value: 1, label: "M", name: "Monday" },
	{ value: 2, label: "T", name: "Tuesday" },
	{ value: 3, label: "W", name: "Wednesday" },
	{ value: 4, label: "T", name: "Thursday" },
	{ value: 5, label: "F", name: "Friday" },
	{ value: 6, label: "S", name: "Saturday" },
	{ value: 0, label: "S", name: "Sunday" },
];

const STATUS_HINTS: Record<AppSettings["status"], string> = {
	active: "Reviews and new exercises run normally.",
	busy: "At most 5 graded reviews a day. Extras wait for later.",
	away: "Paused. No new exercises, and due dates freeze until you're back.",
};

function Segmented<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="segmented" role="radiogroup" aria-label={label}>
			{options.map((option) => (
				<button
					key={option.value}
					role="radio"
					aria-checked={value === option.value}
					className={value === option.value ? "selected" : undefined}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

function Setting({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
	return (
		<section className="tile setting">
			<div className="setting-text">
				<h2>{title}</h2>
				<p className="hint">{hint}</p>
			</div>
			{children}
		</section>
	);
}

export function SettingsPage() {
	const [theme, setThemeChoice] = useState<ThemeChoice>(getTheme);
	const [settings, setSettings] = useState<AppSettings | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void api.settings
			.$get()
			.then((res) => res.json())
			.then(setSettings);
	}, []);

	// Every change saves straight away; the server's copy is what gets shown back.
	async function update(change: Partial<AppSettings>) {
		if (!settings) return;
		const previous = settings;
		const next = { ...settings, ...change };
		setSettings(next);
		const res = await api.settings.$put({ json: next }).catch(() => null);
		if (res?.ok) {
			setSettings(await res.json());
			setError(null);
			window.dispatchEvent(new Event(SETTINGS_CHANGED));
		} else {
			// Put back what's actually saved, so a rejected change doesn't ride along with the next one.
			setSettings(previous);
			setError(
				res
					? "Couldn't save that. Available hours need at least one day and must end after they start."
					: "Couldn't reach Etch. Is the server running?",
			);
		}
	}

	if (settings === null) return null;

	return (
		<div className="narrow">
			<h1>Settings</h1>
			{error && <p className="error">{error}</p>}

			<Setting title="Status" hint={STATUS_HINTS[settings.status]}>
				<Segmented
					label="Status"
					value={settings.status}
					options={[
						{ value: "active", label: "Active" },
						{ value: "busy", label: "Busy" },
						{ value: "away", label: "Away" },
					]}
					onChange={(status) => void update({ status })}
				/>
			</Setting>

			<Setting
				title="Available hours"
				hint="New exercises are written when these hours start. Outside them, review reminders stay quiet, but you can still review any time."
			>
				<div className="hours">
					<div className="day-toggles" role="group" aria-label="Available days">
						{DAYS.map((day) => {
							const on = settings.available_days.includes(day.value);
							return (
								<button
									key={day.value}
									aria-label={day.name}
									aria-pressed={on}
									className={on ? "on" : undefined}
									onClick={() =>
										void update({
											available_days: on
												? settings.available_days.filter((d) => d !== day.value)
												: [...settings.available_days, day.value],
										})
									}
								>
									{day.label}
								</button>
							);
						})}
					</div>
					<div className="row">
						<TimePicker
							value={settings.available_start}
							onChange={(available_start) => available_start && void update({ available_start })}
							label="Start"
							align="end"
						/>
						<span className="hint">to</span>
						<TimePicker
							value={settings.available_end}
							onChange={(available_end) => available_end && void update({ available_end })}
							label="End"
							align="end"
						/>
					</div>
				</div>
			</Setting>

			<Setting
				title="Reminders"
				hint="A Windows notification when a timed planner item is due, and one when your available hours start listing the day's untimed items. Quiet while Away."
			>
				<Segmented
					label="Reminders"
					value={settings.reminders}
					options={[
						{ value: "on", label: "On" },
						{ value: "off", label: "Off" },
					]}
					onChange={(reminders) => void update({ reminders })}
				/>
			</Setting>

			<Setting title="New exercises" hint="How often Etch writes exercises from what you've logged.">
				<Segmented
					label="New exercises"
					value={settings.frequency}
					options={[
						{ value: "daily", label: "Daily" },
						{ value: "every2", label: "Every 2 days" },
						{ value: "weekly", label: "Weekly" },
						{ value: "manual", label: "When I ask" },
					]}
					onChange={(frequency) => void update({ frequency })}
				/>
			</Setting>

			<Setting
				title="Daily review limit"
				hint="Graded reviews per day. Anything over the limit rolls over to tomorrow."
			>
				<Segmented
					label="Daily review limit"
					value={settings.daily_cap}
					options={[
						{ value: "10", label: "10" },
						{ value: "20", label: "20" },
						{ value: "30", label: "30" },
						{ value: "none", label: "No limit" },
					]}
					onChange={(daily_cap) => void update({ daily_cap })}
				/>
			</Setting>

			<Setting title="Theme" hint="System follows your Windows setting.">
				<Segmented
					label="Theme"
					value={theme}
					options={[
						{ value: "system", label: "System" },
						{ value: "dark", label: "Dark" },
						{ value: "light", label: "Light" },
					]}
					onChange={(choice) => {
						setTheme(choice);
						setThemeChoice(choice);
					}}
				/>
			</Setting>
		</div>
	);
}
