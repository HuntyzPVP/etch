# Etch

A daily learning log that helps what you learn stick. Log what you studied, review it with spaced repetition, and keep a simple planner.

## Running locally

Requires Node 26 or newer.

```sh
npm install
npm run dev
```

The app opens at http://localhost:5173 and the API runs on port 8787 (set `PORT` to change it).

## Scripts

| Command         | What it does                            |
| --------------- | --------------------------------------- |
| `npm run dev`   | Starts the API and the web app together |
| `npm test`      | Runs the tests                          |
| `npm run check` | Checks formatting, types and lint rules |
| `npm run build` | Builds the web app into `dist/web`      |

## Daily reviews

`npm run generate-reviews` sends new log entries to [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude -p`, no tools enabled) and saves the review exercises it writes. It only runs once a day, after the time set on the Settings page; add `-- --now` to run it immediately. Each run is logged to `data/generate.log`.

To run it automatically on Windows, register a scheduled task that checks every 15 minutes (PowerShell, from the project folder):

```powershell
$etch = (Get-Location).Path
$action = New-ScheduledTaskAction -Execute "conhost.exe" -WorkingDirectory $etch -Argument "--headless `"$((Get-Command node).Source)`" `"$etch\node_modules\tsx\dist\cli.mjs`" src\scripts\generate-reviews.ts"
$triggers = @(
	(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)),
	(New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Etch reviews" -Action $action -Trigger $triggers -Settings $settings
```
