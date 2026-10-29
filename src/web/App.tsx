import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import { HomePage } from "./HomePage";
import { LogPage } from "./LogPage";
import { PlannerPage } from "./PlannerPage";
import { ReviewsPage } from "./ReviewsPage";
import { SettingsPage } from "./SettingsPage";

export function App() {
	return (
		<BrowserRouter>
			<main>
				<header className="app-header">
					<h1>Etch</h1>
					<nav>
						<NavLink to="/" end>
							Home
						</NavLink>
						<NavLink to="/log">Log</NavLink>
						<NavLink to="/reviews">Reviews</NavLink>
						<NavLink to="/planner">Planner</NavLink>
						<NavLink to="/settings">Settings</NavLink>
					</nav>
				</header>
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/log" element={<LogPage />} />
					<Route path="/reviews" element={<ReviewsPage />} />
					<Route path="/planner" element={<PlannerPage />} />
					<Route path="/settings" element={<SettingsPage />} />
				</Routes>
			</main>
		</BrowserRouter>
	);
}
