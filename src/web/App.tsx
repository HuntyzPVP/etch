import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import { LogPage } from "./LogPage";
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
							Log
						</NavLink>
						<NavLink to="/reviews">Reviews</NavLink>
						<NavLink to="/settings">Settings</NavLink>
					</nav>
				</header>
				<Routes>
					<Route path="/" element={<LogPage />} />
					<Route path="/reviews" element={<ReviewsPage />} />
					<Route path="/settings" element={<SettingsPage />} />
				</Routes>
			</main>
		</BrowserRouter>
	);
}
