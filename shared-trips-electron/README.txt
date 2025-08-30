# Shared Trips BG – Windows .exe (Electron)
This project packages the app as a Windows installer using Electron.
It runs a local Express+SQLite server inside the app and a React UI.

## How to build the .exe on Windows
1) Install Node.js 18+.
2) Open terminal in `electron-app/` and run:
   npm install
3) Development run (no installer):
   npm run dev
   (This opens the Electron window and starts local API on port 4777)
4) Build installer (.exe):
   npm run dist
   (Find the .exe in `electron-app/dist/`)

The app stores its SQLite DB at `resources/db/shared-trips.db` packaged with the app.
