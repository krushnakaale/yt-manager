# YT Manager

## Your video library, organized your way

YT Manager is a privacy-minded video library and download manager. Discover videos, organize links and playlists, keep your watch progress, and manage downloads through a responsive Windows, browser, or Android interface.

There is no YT Manager-hosted account or cloud service. You run or configure the backend that stores your app data, so you control where your library and history live.

> Independent project; not affiliated with or endorsed by YouTube or Google.

## Features

### Discover and search

- Browse popular YouTube videos by category, refresh the feed, and load more results.
- Search YouTube and save videos from the results to your library.
- Follow channels by channel ID and view recent uploads through YouTube RSS without an API key.
- Use the global search bar to search YouTube; recent queries are suggested only while the field is active.

### Video library and playlists

- Save one or more YouTube links; find videos on YouTube from the Library page.
- Search and sort the library, filter by category, and view all videos, favourites, or recently added videos.
- Edit titles, categories, tags, and notes; subscribe to channels and add videos to playlists.
- Create, edit, search, and delete playlists. Filter empty or recently updated playlists, reorder videos, and play a playlist from its detail page.

### Playback and history

- Play videos using YouTube's official embedded player.
- Keep playback open while navigating the app with the persistent mini-player. Minimize, restore, close, and resize it with the mouse; keyboard arrow keys also resize it.
- Optionally autoplay the next video from the current feed, library, playlist, or watch-history list. Control autoplay in **Settings > Playback**.
- Fullscreen and Picture-in-Picture depend on YouTube, the platform, and device support.
- Track watch history and playback progress, resume unfinished videos from **Continue watching**, and revisit completed videos from **History**.
- Watch-history tracking can be disabled in **Settings > Privacy**. Existing entries are retained until cleared.
- Search-history suggestions can also be disabled and cleared; search history is stored locally in the browser or app.

### Downloads and files

- Queue supported YouTube video/audio downloads, playlist ranges, and direct file URLs. Select format and quality and optionally choose a destination folder.
- In the Windows desktop app, **Choose custom path** opens the system folder picker. In a browser, enter the full path manually; browser security does not expose an absolute local folder path.
- Track active, completed, failed, and cancelled tasks. Pause, resume, retry, cancel, remove records, or delete completed files.
- Add files you already own to the managed download list. On Android, copy a completed file to `Documents/YTManager`; supported local audio files can play in the background.
- Risky file extensions are marked with a warning. URL, file-size, and download-time checks are applied by the backend.

### Settings, privacy, and responsive UI

- Choose a theme, adjust accent/background colours, preview contrast, and reduce motion.
- Turn next-video autoplay on or off; the preference is stored on the device.
- Configure the default download folder, maximum download size, and concurrent download limit.
- Store an optional YouTube Data API key on the backend.
- Export and restore a JSON backup of saved videos, playlists, and watch history.
- Responsive layouts support desktop, tablet, and mobile screens.

## Privacy and data security

YT Manager is designed not to require personal identity details:

- No sign-up, account, name, email address, or phone number is required.
- There are no ads or analytics trackers.
- The About page loads the developer's public profile photo from GitHub.
- Your saved videos, playlists, watch history, progress, and app settings are stored in SQLite on the backend you run or configure. Recent search suggestions are stored locally on the device.
- YT Manager does not operate a hosted cloud service that collects your library. If you connect Android or another client to a remote backend, the app data is sent to that backend address, which you choose and manage.
- YouTube receives requests when you use YouTube search, feeds, metadata, or the embedded player. Direct download URLs are requested by your configured backend.

This local-first design reduces unnecessary collection; it is not a guarantee of security. Keep your device and backend protected. For remote use, configure an access token, restrict allowed origins, and use HTTPS. Turn off watch-history tracking in **Settings > Privacy** if you do not want new watch events stored.

## Future roadmap

The following are ideas for future versions, not features currently available:

- Optional encrypted backup and cross-device sync.
- Download scheduling and completion notifications.
- More feed sources and richer channel discovery.
- Additional library filters and user-controlled data export options.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 18, Vite |
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Windows desktop | Electron |
| Android | Capacitor 6, Capacitor Filesystem, native audio plugin |
| YouTube metadata/feed | YouTube Data API v3, YouTube oEmbed, YouTube RSS |
| Download manager | yt-dlp and HTTPX |

## Requirements

- Python 3.11 or newer
- Node.js 18 or newer and npm
- Android Studio and an Android SDK only when building the Android app
- Windows and Electron dependencies only when building the Windows installer

## Run locally

Open two terminals in the project directory.

### 1. Start the backend

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

The development backend listens on `http://127.0.0.1:8000`.

On Command Prompt, activate with `.venv\Scripts\activate.bat`. On macOS or Linux, create the environment with `python3 -m venv .venv` and activate it with `source .venv/bin/activate`.

### 2. Start the frontend

In the second terminal:

```powershell
cd frontend
npm ci
npm run dev -- --strictPort
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Alternatively, run `run_dev.bat` from the project directory after installing both sets of dependencies.

The development backend binds to loopback and does not require an API token unless `YTM_TOKEN` is configured. Do not expose it to an untrusted network without appropriate access controls.

## Configure YouTube Data API

An API key is optional:

- Popular videos and YouTube search require a key.
- Channel RSS feeds do not require a key; add channels by their YouTube channel ID.
- The embedded player and metadata lookup can operate without configuring your own key, subject to YouTube availability and quotas.

To create and configure a key:

1. Enable [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) in a Google Cloud project.
2. Create an API key in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
3. Restrict the key to YouTube Data API v3.
4. In YT Manager, open **Settings > YouTube Data API**, paste the key, and save it. Use **Test Home feed** to verify it.

The key is stored by the backend and is not returned to the frontend. You can alternatively set `YTM_YT_API_KEY` in the backend process environment. Never commit API keys or access tokens to source control.

## Build

### Windows installer

From the project directory, run:

```powershell
.\build_windows.bat
```

The script builds the frontend, packages the FastAPI backend with PyInstaller, and creates a Windows installer with Electron Builder. Installer output is placed in `electron\dist\`.

### Android app

The Android client requires a FastAPI backend reachable by the phone. Follow [ANDROID.md](ANDROID.md) for backend networking, token configuration, project generation, and signing instructions. Basic frontend commands:

```powershell
cd frontend
npm ci
npm run android:add
npm run android:sync
npm run android:open
```

`android:add` creates the native project once. `android:sync` builds the web UI, syncs Capacitor assets, and configures the Android audio service. On the device, configure **Settings > Server connection** with the backend address and token.

## Data locations and safety

- In development, the SQLite database defaults to `~/.ytmanager/ytmanager.db`; downloads default to `~/YTManager/Downloads`.
- The Windows Electron app stores app data in its Electron application data directory. On Android, the configured backend machine owns the database and download files.
- YouTube playback uses the official embedded player. Playback features are subject to YouTube's player and device restrictions.
- Download only media that you own or are authorized to save, and comply with the source service's terms and applicable laws. You are responsible for your use of the app.
- The app does not bypass DRM or access controls. Never expose a development backend to an untrusted network.
- Keep personal databases, API keys, access tokens, and downloaded media out of Git.

## Configuration

| Environment variable | Purpose |
| --- | --- |
| `YTM_DATA_DIR` | Directory for the SQLite database and app data |
| `YTM_DOWNLOAD_DIR` | Default directory for managed downloads |
| `YTM_YT_API_KEY` | Optional YouTube Data API v3 key |
| `YTM_TOKEN` | Backend API token; set it when using a protected backend |
| `YTM_PORT` | Backend port; defaults to `8000` |
| `YTM_CORS` | Comma-separated allowed browser origins; see [ANDROID.md](ANDROID.md) for Android setup |

## Project layout

```text
yt-manager/
|-- backend/       FastAPI API, SQLite models, and download manager
|-- electron/      Windows desktop shell and installer configuration
|-- frontend/      React UI, Vite configuration, and Capacitor app
|-- ANDROID.md     Android networking, build, and background-audio guide
|-- build_windows.bat
`-- run_dev.bat
```

## License

This project is distributed under the [MIT License](LICENSE).

## Developer

### Krushna Kale

I am a Python developer who builds automation tools and practical web applications. I explore secure development through hands-on projects, with a current focus on cybersecurity fundamentals, Linux, Git, and open-source development.

### Achievements and project highlights

- **[Python-Basic-Projects](https://github.com/krushnakaale/Python-Basic-Projects):** created a collection of 30 beginner-friendly Python projects covering fundamentals, logic, file handling, and GUI applications.
- **[YT Manager](https://github.com/krushnakaale/yt-manager):** built this responsive video library, playlist, playback-history, and download-management application.
- **[Fresher Party Management System](https://github.com/krushnakaale/fresher-party-management-system):** developed a full-stack event platform with student registration, Razorpay payments, QR entry passes, and live QR scanning.
- **[MSBTE Marksheet Analyzer](https://github.com/krushnakaale/MSBTE-Marksheet-Analyzer):** built a Flask app that extracts information from multiple marksheet PDFs and exports results to Excel.
- **[GitHub profile dashboard](https://github.com/krushnakaale/krushnakaale):** publishes automatically refreshed project, language, and activity visualizations.

### Connect

- [GitHub](https://github.com/krushnakaale)
- [Portfolio](https://krushnakaale.vercel.app)
- [LinkedIn](https://www.linkedin.com/in/krushnakaale)
- [Instagram](https://www.instagram.com/krushna_kaale)
