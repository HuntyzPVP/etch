import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import { LogPage } from "./LogPage";
import { ReviewsPage } from "./ReviewsPage";

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
					</nav>
				</header>
				<Routes>
					<Route path="/" element={<LogPage />} />
					<Route path="/reviews" element={<ReviewsPage />} />
				</Routes>
			</main>
		</BrowserRouter>
	);
}
