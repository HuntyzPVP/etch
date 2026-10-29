import { generateReviews, isScheduledRunDue } from "../server/generator";
import { areSuggestionsDue, generateSuggestions } from "../server/suggestions";

// --now skips the schedule check for a manual run from the terminal.
if (process.argv.includes("--now") || isScheduledRunDue()) {
	try {
		await generateReviews({ dueToday: false });
		if (areSuggestionsDue()) await generateSuggestions();
	} catch {
		// Already written to data/generate.log.
		process.exitCode = 1;
	}
}
