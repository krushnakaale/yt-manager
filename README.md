# YT Manager

Video and playlist organizer with authorized local downloads.
React (UI) + Electron (Windows) + Capacitor (Android) + Python FastAPI + SQLite.

```
yt-manager/
├── backend/    FastAPI API, SQLite models, secure download manager
├── frontend/   React UI (Vite), theme system, Capacitor config
├── electron/   Windows shell: secure preload bridge, installer config
├── build_windows.bat
└── ANDROID.md  APK steps
```

## Run in development (Windows / Linux / macOS)

Terminal 1: backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python run.py                                       # http://127.0.0.1:8000
```

Terminal 2: UI

```bash
cd frontend
npm install
npm run dev                                         # http://localhost:5173
```

Dev mode has no API token (set `YTM_TOKEN` yourself if you want to test it). Optional: `YTM_YT_API_KEY` env var.

## Build the Windows installer

Run `build_windows.bat` from the project root. It builds the React app, packs the backend into
`ytm-backend.exe` with PyInstaller, and creates the installer in `electron/dist/` with electron-builder.

## Build the APK

See `ANDROID.md`.

## Feature map (from the requirements document)

| Module                                                                            | Where                                                                |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Dashboard (cards, storage, activity log)                                          | `frontend/src/pages/Dashboard.jsx`, `GET /api/stats`, `/api/storage` |
| Video Library (validate, metadata, search, sort, categorize, edit, remove)        | `Library.jsx`, `routes/videos.py`                                    |
| Playlists (create, rename, delete, add/remove, ordering)                          | `Playlists.jsx`, `routes/playlists.py`                               |
| Search (local + optional YouTube Data API)                                        | `Library.jsx`, `routes/misc.py`                                      |
| Preview with the official embedded player                                         | `ui.jsx` (`youtube-nocookie.com/embed`)                              |
| Download Manager (progress, speed, cancel, resume with Range)                     | `downloader.py`, `Downloads.jsx`                                     |
| History, File Manager (reveal, delete with confirm, missing-file detection)       | `History.jsx`, `DownloadRow.jsx`                                     |
| Settings, themes (5 presets, custom colours, live preview, reset, reduced motion) | `Settings.jsx`, `theme.js`                                           |

## Extra features added

- Favourites, tags and notes on videos; batch add (paste many links at once); duplicate detection
- Pause and resume downloads (HTTP Range) and retry for failed ones
- SHA-256 checksum for every finished download; warning label for executable or script file types
- "Add my own file" to bring a file you already own into the managed folder
- Backup export / import (JSON) for library and playlists
- Theme contrast checker (WCAG ratio) and neon accent shortcuts
- `/` keyboard shortcut for search, skip link, keyboard-friendly playlist reordering
- Backend offline banner; Android "Save to device" button

## Security measures implemented

- Electron: `contextIsolation`, no Node in renderer, `sandbox`, narrow preload bridge, IPC accepted only from the app's own origin, popups and foreign navigation blocked, permission requests denied
- Backend bound to `127.0.0.1` on a random port with a per-launch token (`X-YTM-Token`, constant-time compare)
- SSRF guard (`security.py`): http/https only, no credentials in URL, port allowlist, every resolved address must be public (blocks localhost, private, link-local, CGNAT, reserved, IPv4-mapped IPv6); checked again on each of up to 5 redirects
- Server-side validation of YouTube URLs, filenames (path traversal, Windows reserved names) and the download folder (system folders refused, must be writable)
- Downloads only go to the one configured folder; deleting a file needs `confirm=true` and the file must be inside that folder
- Size limit, 3 hour time limit, HTML pages rejected, request body limit, rate limit, safe error messages
- API key kept in env var or backend database only; never returned to the UI; sent in a header so it never appears in URLs or logs
- No ads/trackers; external links always ask first (UI dialog, then a native dialog in Electron)

## Honest notes and limits

- **Not run end to end yet.** The environment this was written in had no internet, so I could not install
  FastAPI/npm packages, start the servers or build the EXE/APK. What _was_ checked: all Python files compile,
  the security helpers were tested (URL parsing, SSRF blocking, filename sanitising), and all JSX/JS files
  parse without syntax errors. Expect to fix a few small things on your first real run.
- DNS rebinding: the host is validated before each request, but the HTTP client resolves it again when
  connecting. For a college project this is acceptable; a hardened version would pin the validated IP.
- Android background downloads/notifications (Phase 7) are not implemented; see `ANDROID.md`.
- PostgreSQL, accounts and sync are intentionally left out (the document says to add them only after the local version is stable).
- Phase 8 items (user guide, screenshots, test report) are for you to produce once it runs.

## About the Developer

### Krushna Kale

**Python Developer | Software Development Enthusiast | Tech Explorer**

I'm **Krushna Kale**, an aspiring software developer passionate about building practical, reliable, and user-focused applications.

My interests include **Python Development, Software Engineering, Automation, Artificial Intelligence, and Cybersecurity**. I focus on strengthening my technical expertise through hands-on projects, continuous learning, and real-world problem-solving.

My goal is to grow as a software developer while creating meaningful solutions and contributing to the developer community.

**My Approach:** _Learn continuously. Build purposefully. Improve consistently._

### Connect With Me

| Platform      | Profile                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| **GitHub**    | [github.com/krushnakaale](https://github.com/krushnakaale)                |
| **LinkedIn**  | [linkedin.com/in/krushnakaale](https://www.linkedin.com/in/krushnakaale/) |
| **Instagram** | [instagram.com/krushna_kaale](https://www.instagram.com/krushnakaale/)    |

---

_Developed and maintained by **Krushna Kale**._

**© 2026 Krushna Kale. All rights reserved.**
