# Marble Run

A browser-based 3D marble race / dice-racing simulator built with Vite and Three.js.

## Quick start

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Long-running control dashboard

The old bundled marble dashboard has been removed from this repo. Use the standalone dashboard project instead:

```bash
cd /Users/bert/game-dashboard
npm run dashboard
```

Open <http://127.0.0.1:8888>. Keep this dashboard running long term to:

- start/stop the Marble Rush Vite server from the browser
- check whether the game server is online
- open the game at <http://127.0.0.1:5173>
- launch/stop background cup video render jobs
- generate/test YouTube thumbnails for recent recordings
- browse recent recordings

Environment overrides:

```bash
cd /Users/bert/game-dashboard
GAME_DASHBOARD_PORT=8888 npm run dashboard
```

The dashboard start button only starts the local Vite server; it does not start a race or recording automatically.

## Build

```bash
npm run build
```

## Features

- Procedural marble run tracks
- Broadcast-style camera director
- Start gate with countdown
- Debug console with track import/export code
- Pinball-style obstacles and finish showcase
