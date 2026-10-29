# Etch

A daily learning log that helps what you learn stick. Log what you studied, review it with spaced repetition, and keep a simple planner.

## Running locally

Requires Node 26 or newer.

```sh
npm install
npm run build
npm start
```

Etch runs at http://localhost:8787 (set `PORT` to change it). In Chrome or Edge, use **Install app** in the address bar to give it its own window, Start menu entry and taskbar icon.

`npm start` reloads itself when server code changes. After changing the web app, run `npm run build` and refresh.

## Developing

With `npm start` running, `npm run dev` serves the web app with instant reloads at http://localhost:5173 and sends API calls to it. Without `npm start`, run `npm run dev:server` alongside instead.

## Scripts

| Command              | What it does                            |
| -------------------- | --------------------------------------- |
| `npm start`          | Runs Etch: the API plus the built app   |
| `npm run build`      | Builds the web app into `dist/web`      |
| `npm run dev`        | Serves the web app with instant reloads |
| `npm run dev:server` | Runs only the API, for development      |
| `npm test`           | Runs the tests                          |
| `npm run check`      | Checks formatting, types and lint rules |

## Starting with Windows

To have Etch running whenever you log in, register a hidden scheduled task (PowerShell, from the project folder):

```powershell
$etch = (Get-Location).Path
$action = New-ScheduledTaskAction -Execute "conhost.exe" -WorkingDirectory $etch -Argument "--headless `"$((Get-Command node).Source)`" `"$etch\node_modules\tsx\dist\cli.mjs`" watch src\server\index.ts --production"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "Etch server" -Action $action -Trigger $trigger -Settings $settings
```

## Daily reviews

`npm run generate-reviews` sends new log entries to [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude -p`, no tools enabled) and saves the review exercises it writes. It follows the frequency, status and available hours set on the Settings page; add `-- --now` to run it immediately. The Reviews page also has a **Generate now** button. Each run is logged to `data/generate.log`.

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

## Suggestions, reports and the assistant

These also run through Claude Code, with the same trimmed `claude -p` flags as review generation. Failures are logged to `data/generate.log`.

- **Suggested** on the Planner: after each scheduled review run, if anything was logged or reviewed since the last batch, Claude suggests topics to learn next and small practice tasks. **Accept** adds one to the planner under Someday; **Dismiss** drops it. **Suggest now** asks right away.
- **Progress report** on the Log page: a short first-person summary of the last 7 or 30 days of logging and reviews, written to paste into an AI chat for career planning.
- **Assistant**, the bubble in the bottom-right corner: chat about your log, reviews and plans. It can propose planner items and log entries, which are only added when you press **Add**. Each chat starts clean.

Suggestions and the assistant also read any Markdown notes in the folder named by `CAREER_NOTES_DIR`. Set it in a `.env` file in the project folder (kept out of git):

```sh
CAREER_NOTES_DIR=C:\Users\you\Documents\Vault\Career
```

## Reminders

While the server runs on Windows, Etch sends a notification when a timed planner item comes due, and one when your available hours start listing the day's untimed items. Reminders missed by more than three hours (PC off or asleep) are skipped. They stay quiet while your status is Away, and can be turned off on the Settings page.

Notifications open the planner in your browser. To have them open the installed app instead, register an `etch:` link that launches it (PowerShell, after installing the app; the shortcut path depends on your browser):

```powershell
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Brave Apps\Etch.lnk")
$command = "`"$($lnk.TargetPath)`" $($lnk.Arguments.Trim()) --app-launch-url-for-shortcuts-menu-item=http://localhost:8787/planner"
New-Item -Path HKCU:\Software\Classes\etch\shell\open\command -Force | Out-Null
Set-ItemProperty -Path HKCU:\Software\Classes\etch -Name "(default)" -Value "URL:Etch"
Set-ItemProperty -Path HKCU:\Software\Classes\etch -Name "URL Protocol" -Value ""
Set-ItemProperty -Path HKCU:\Software\Classes\etch\shell\open\command -Name "(default)" -Value $command
```

## Backups

The server copies the database to `data/backups/etch-YYYY-MM-DD.db` once a day and keeps the last 14 (set `BACKUP_DIR` to store them elsewhere, such as a synced folder). To restore one, stop the server, replace `data/etch.db` with the backup, and start it again.
