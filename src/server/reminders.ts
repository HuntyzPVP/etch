import { spawn } from "node:child_process";
import { formatTime, today } from "../shared/dates";
import { log } from "./agent";
import { db } from "./db";
import { readSettings } from "./settings";

const CHECK_MS = 30_000;
// A reminder missed by more than this (PC off or asleep) is dropped instead of arriving late.
const LATE_LIMIT_MINUTES = 180;

// Shows the notification as the installed Etch app when Windows knows it, otherwise as PowerShell. Clicking opens
// the app through the etch: link when it's registered (see README), otherwise the planner in the browser.
// Text arrives on stdin and the link in an environment variable, so nothing from the planner is run as code.
const TOAST_SCRIPT = `
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]
$app = Get-StartApps | Where-Object Name -eq 'Etch' | Select-Object -First 1
$id = if ($app) { $app.AppID } else { '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe' }
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml([Console]::In.ReadToEnd())
if (Test-Path 'HKCU:\\Software\\Classes\\etch') { $xml.DocumentElement.SetAttribute('launch', 'etch:planner') }
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;

const listDueTimed = db.prepare(`
	SELECT id, title, due_date || ' ' || due_time AS due, due_time FROM planner_items p
	WHERE done = 0 AND due_time IS NOT NULL
		AND due_date || ' ' || due_time BETWEEN ? AND ?
		AND NOT EXISTS (SELECT 1 FROM reminder_log r WHERE r.item_id = p.id AND r.due = p.due_date || ' ' || p.due_time)
`);
const listUntimedToday = db.prepare(
	"SELECT title FROM planner_items WHERE done = 0 AND due_date = ? AND due_time IS NULL ORDER BY id",
);
const logReminder = db.prepare("INSERT OR IGNORE INTO reminder_log (item_id, due) VALUES (?, ?)");
const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare(
	"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);

// "YYYY-MM-DD HH:MM" in local time, the same shape as a planner item's date and time joined.
function localStamp(date: Date) {
	const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	return `${date.toLocaleDateString("en-CA")} ${time}`;
}

const escapeXml = (text: string) =>
	text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

function notify(url: string, title: string, body: string) {
	const xml = `<toast activationType="protocol" launch="${escapeXml(url)}"><visual><binding template="ToastGeneric"><text>${escapeXml(title)}</text><text>${escapeXml(body)}</text></binding></visual></toast>`;
	const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", TOAST_SCRIPT], {
		windowsHide: true,
	});
	let stderr = "";
	child.stderr.on("data", (chunk) => (stderr += chunk));
	child.on("error", (error) => log(`Reminder failed: ${error.message}`));
	child.on("close", (code) => {
		if (code !== 0) log(`Reminder failed: ${stderr.trim() || `powershell exited with code ${code}`}`);
	});
	child.stdin.end(xml);
}

// Each reminder is logged before it's shown, so a failing notification can't repeat every check.
function check(url: string) {
	const settings = readSettings();
	if (settings.reminders === "off" || settings.status === "away") return;
	const now = new Date();
	const stamp = localStamp(now);
	const earliest = localStamp(new Date(now.getTime() - LATE_LIMIT_MINUTES * 60_000));
	const due = listDueTimed.all(earliest, stamp) as { id: number; title: string; due: string; due_time: string }[];
	for (const item of due) {
		logReminder.run(item.id, item.due);
		notify(url, item.title, `Due at ${formatTime(item.due_time)}`);
	}

	const day = today();
	const lastDigest = (getSetting.get("last_digest") as { value: string } | undefined)?.value;
	if (lastDigest === day || stamp.slice(11) < settings.available_start) return;
	setSetting.run("last_digest", day);
	const titles = (listUntimedToday.all(day) as { title: string }[]).map((r) => r.title);
	if (titles.length > 0) {
		notify(
			url,
			titles.length === 1 ? "1 thing planned today" : `${titles.length} things planned today`,
			titles.join("\n"),
		);
	}
}

export function startReminders(port: number) {
	if (process.platform !== "win32") return;
	const url = `http://localhost:${port}/planner`;
	const run = () => {
		try {
			check(url);
		} catch (error) {
			log(`Reminder check failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};
	run();
	setInterval(run, CHECK_MS);
}
