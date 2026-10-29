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
