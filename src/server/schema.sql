CREATE TABLE IF NOT EXISTS entries (
	id INTEGER PRIMARY KEY,
	date TEXT NOT NULL,
	topic TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS snippets (
    id INTEGER PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exercises (
	id INTEGER PRIMARY KEY,
	entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
	-- Empty for questions written from notes.
	snippet_id INTEGER REFERENCES snippets(id) ON DELETE CASCADE,
	prompt TEXT NOT NULL,
	answer TEXT NOT NULL,
	language TEXT,
	due_date TEXT NOT NULL,
	interval_days INTEGER NOT NULL DEFAULT 0,
	streak INTEGER NOT NULL DEFAULT 0,
	retired INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

-- The old single review time becomes the start of the available hours.
INSERT OR IGNORE INTO settings (key, value) SELECT 'available_start', value FROM settings WHERE key = 'review_time';
DELETE FROM settings WHERE key = 'review_time';

INSERT OR IGNORE INTO settings (key, value) VALUES
	('frequency', 'daily'),
	('daily_cap', 'none'),
	('status', 'active'),
	('available_days', '0,1,2,3,4,5,6'),
	('available_start', '18:30'),
	('available_end', '22:00'),
	('reminders', 'on');

CREATE TABLE IF NOT EXISTS planner_items (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	due_date TEXT,
	-- Only set when due_date is.
	due_time TEXT,
	done INTEGER NOT NULL DEFAULT 0,
	done_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_log (
	id INTEGER PRIMARY KEY,
	exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
	got INTEGER NOT NULL,
	reviewed_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestions (
	id INTEGER PRIMARY KEY,
	-- 'topic' to learn next, or 'task' to practice.
	kind TEXT NOT NULL,
	title TEXT NOT NULL,
	reason TEXT NOT NULL,
	-- 'open' until accepted or dismissed.
	status TEXT NOT NULL DEFAULT 'open',
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per reminder sent. due is the date and time it was for, so moving an item re-arms its reminder.
CREATE TABLE IF NOT EXISTS reminder_log (
	item_id INTEGER NOT NULL REFERENCES planner_items(id) ON DELETE CASCADE,
	due TEXT NOT NULL,
	PRIMARY KEY (item_id, due)
);

CREATE INDEX IF NOT EXISTS snippets_entry ON snippets(entry_id);
CREATE INDEX IF NOT EXISTS exercises_entry ON exercises(entry_id);
CREATE INDEX IF NOT EXISTS exercises_snippet ON exercises(snippet_id);
CREATE INDEX IF NOT EXISTS exercises_due ON exercises(retired, due_date);
CREATE INDEX IF NOT EXISTS review_log_exercise ON review_log(exercise_id);
CREATE INDEX IF NOT EXISTS review_log_day ON review_log(reviewed_on);
