import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router";
import { api, isOnDuty, SETTINGS_CHANGED, type AppSettings } from "./api";
import { Assistant } from "./Assistant";
import { ConfirmProvider } from "./ConfirmDialog";
import { HomePage } from "./HomePage";
import { LogPage } from "./LogPage";
import { MusicPlayer } from "./MusicPlayer";
import { PlannerPage } from "./PlannerPage";
import { ReviewsPage } from "./ReviewsPage";
import { SettingsPage } from "./SettingsPage";

export function App() {
	return (
		<BrowserRouter>
			<ConfirmProvider>
				<Shell />
			</ConfirmProvider>
		</BrowserRouter>
	);
}

const STATUS_LABELS: Record<AppSettings["status"], string> = {
	active: "Status: Active",
	busy: "Status: Busy",
	away: "Status: Away",
};

function Shell() {
	const { pathname } = useLocation();
	const navRef = useRef<HTMLElement>(null);
	const pillRef = useRef<HTMLSpanElement>(null);
	const [dueCount, setDueCount] = useState(0);
	const [settings, setSettings] = useState<AppSettings | null>(null);

	useEffect(() => {
		void api.reviews.due
			.$get()
			.then((res) => res.json())
			.then((due) => setDueCount(due.length));
		const loadSettings = () =>
			void api.settings
				.$get()
				.then((res) => res.json())
				.then(setSettings);
		loadSettings();
		window.addEventListener(SETTINGS_CHANGED, loadSettings);
		return () => window.removeEventListener(SETTINGS_CHANGED, loadSettings);
	}, [pathname]);

	const showBadge = dueCount > 0 && settings !== null && isOnDuty(settings);

	// The pill is positioned by hand so it can slide between links instead of jumping.
	useLayoutEffect(() => {
		function place() {
			const active = navRef.current?.querySelector<HTMLElement>("a.active");
			const pill = pillRef.current;
			if (!pill) return;
			pill.style.opacity = active ? "1" : "0";
			if (active) {
				pill.style.width = `${active.offsetWidth}px`;
				pill.style.transform = `translateX(${active.offsetLeft}px)`;
			}
		}
		place();
		// Link widths change when the web font finishes loading or the badge appears, not only on window resize.
		const observer = new ResizeObserver(place);
		navRef.current?.querySelectorAll("a").forEach((link) => observer.observe(link));
		return () => observer.disconnect();
	}, [pathname, showBadge]);

	return (
		<>
			<header className="topbar">
				<div className="topbar-inner">
					<span className="wordmark">
						Etch
						{settings && (
							<span
								className={`status-dot ${settings.status}`}
								title={STATUS_LABELS[settings.status]}
								aria-label={STATUS_LABELS[settings.status]}
							/>
						)}
					</span>
					<nav ref={navRef}>
						<span ref={pillRef} className="nav-pill" aria-hidden />
						<NavLink to="/" end>
							Home
						</NavLink>
						<NavLink to="/log">Log</NavLink>
						<NavLink to="/reviews">
							Reviews
							{showBadge && <span className="badge">{dueCount}</span>}
						</NavLink>
						<NavLink to="/planner">Planner</NavLink>
						<NavLink to="/settings">Settings</NavLink>
					</nav>
				</div>
			</header>
			<main key={pathname} className="page">
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/log" element={<LogPage />} />
					<Route path="/reviews" element={<ReviewsPage />} />
					<Route path="/planner" element={<PlannerPage />} />
					<Route path="/settings" element={<SettingsPage />} />
				</Routes>
			</main>
			<MusicPlayer />
			<Assistant />
		</>
	);
}
