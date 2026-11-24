# YT Manager

YT Manager is a local video library and playlist app built with React, FastAPI, and SQLite. It can discover public YouTube videos, organize saved links, play videos using YouTube's official embedded player, and manage files you are authorized to download.

> This is an independent project and is not affiliated with or endorsed by YouTube or Google.

## Features

- **Home feed:** browse popular videos and search YouTube with the YouTube Data API v3. Follow channels to see their recent public uploads through RSS without an API key.
- **Video library:** save YouTube links, search and sort your collection, mark favourites, add notes/tags, and organize videos by category.
- **Playlists:** create and edit playlists, view thumbnail covers, and add, remove, play, or reorder saved videos.
- **In-app playback:** YouTube links open in YouTube's official embedded player. Fullscreen and picture-in-picture availability depends on the player, platform, and device.
- **Downloads and local files:** track downloads, pause/resume or retry supported tasks, and add files that you own to the library. Only download content you own or have permission to download, and follow the source platform's terms and applicable laws.
- **History and backup:** review watch history and export or import library and playlist data as JSON.
- **Appearance:** choose a theme, customize colours, and adjust motion settings.
- **Windows desktop:** package the app in an Electron shell with a bundled local backend.
- **Android:** use the Capacitor app with a separately running FastAPI backend. Supported audio files that you add yourself can continue playing in the background on Android. YouTube playback itself cannot be forced to continue in the background.

## Technology

- Frontend: React 18, Vite, Capacitor 6
- Backend: Python, FastAPI, SQLAlchemy, SQLite
- Windows desktop wrapper: Electron
- Android wrapper: Capacitor

## Requirements

- Python 3.11 or newer
- Node.js 18 or newer and npm
- Android Studio and an Android SDK only if building the Android app

## Run locally

Open two terminals in the `yt-manager` project directory.

### 1. Start the backend

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

The development backend listens on `http://127.0.0.1:8000`.

On Command Prompt, activate the environment with `.venv\Scripts\activate.bat`. On macOS or Linux, use `python3 -m venv .venv` and `source .venv/bin/activate`.

### 2. Start the frontend

In the second terminal:

```powershell
cd frontend
npm ci
npm run dev -- --strictPort
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). You can also run `run_dev.bat` from the project directory after installing the backend and frontend dependencies; it starts both development servers.

The default development backend is intended for local use. It binds to loopback and does not require an API token unless `YTM_TOKEN` is configured. Do not expose it to an untrusted network without configuring access controls.

## Configure YouTube Data API

An API key is optional:

- Popular videos and YouTube search require a key.
- Channel RSS feeds do not require a key, but you need to follow channels by their channel ID.

To create a key:

1. Enable [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) in a Google Cloud project.
2. Create an API key in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
3. Restrict the key to YouTube Data API v3.
4. In YT Manager, open **Settings > YouTube Data API**, paste the key, and save it. Use **Test Home feed** to verify it.

The key is saved by the backend and is not returned to the frontend. Alternatively, set `YTM_YT_API_KEY` in the backend process environment. Never commit API keys or tokens to source control.

## Build

### Windows installer

From the project directory, run:

```powershell
.\build_windows.bat
```

The script builds the frontend, packages the FastAPI backend with PyInstaller, and creates a Windows installer with Electron Builder. The installer is written to `electron\dist\`.

### Android app

The Android client requires a FastAPI backend that the phone can reach. Follow [ANDROID.md](ANDROID.md) for backend networking, token configuration, Android project generation, and signing instructions. The basic frontend commands are:

```powershell
cd frontend
npm ci
npm run android:add
npm run android:sync
npm run android:open
```

`android:add` is for the initial native project setup. `android:sync` builds the web app, syncs Capacitor assets, and configures the Android audio service.

## Data and configuration

In development, the SQLite database defaults to `~/.ytmanager/ytmanager.db` and downloads default to `~/YTManager/Downloads`. The download directory and other app settings can be changed in **Settings**.

| Environment variable | Purpose |
| --- | --- |
| `YTM_DATA_DIR` | Directory for the SQLite database and app data |
| `YTM_DOWNLOAD_DIR` | Default directory for managed downloads |
| `YTM_YT_API_KEY` | Optional YouTube Data API v3 key |
| `YTM_TOKEN` | Optional backend API token; required when configuring a protected remote backend |
| `YTM_PORT` | Backend port; defaults to `8000` |
| `YTM_CORS` | Comma-separated allowed browser origins; see [ANDROID.md](ANDROID.md) for Android setup |

The Windows Electron app uses its application data directory for its database. Keep personal database files, API keys, and downloaded media out of Git.

## YouTube playback and downloads

YouTube videos play through the official embedded player; YT Manager does not extract YouTube audio or bypass player restrictions. Fullscreen and picture-in-picture are subject to YouTube and device support. Background playback in this app is for supported local audio files that you add yourself, not YouTube streams.

Only download media that you own or are authorized to save. You are responsible for complying with the source service's terms and local laws.

## Project layout

```text
yt-manager/
|-- backend/       FastAPI API, SQLite models, and download manager
|-- electron/      Windows desktop shell and installer configuration
|-- frontend/      React UI, Vite configuration, and Capacitor app
|-- ANDROID.md     Android networking, build, and background audio guide
|-- build_windows.bat
`-- run_dev.bat
```

## License

This project is distributed under the [MIT License](LICENSE).
