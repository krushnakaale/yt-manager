# Android (APK) guide

## Why a server is needed
A desktop-style Python process cannot simply run inside an Android app. This project therefore
uses the approach recommended in the requirements document: **the same FastAPI backend runs on a
trusted machine** (your PC on the same Wi-Fi for the college demo, or a small cloud VM for a
real deployment) and the Android app is the shared React UI wrapped by Capacitor.

## Steps
1. Start the backend so the phone can reach it (use a token!):
   ```bash
   cd backend
   set YTM_TOKEN=choose-a-long-random-string      # Windows (use `export` on Linux/macOS)
   set YTM_CORS=http://localhost,https://localhost,capacitor://localhost
   python -c "import uvicorn; from app.main import app; uvicorn.run(app, host='0.0.0.0', port=8000)"
   ```
   Only bind to `0.0.0.0` on a network you trust. For anything public, put it behind HTTPS (a reverse proxy).
2. Build the web app and create the Android project:
   ```bash
   cd frontend
   npm install
   npm run build
   npx cap add android
   npm run android:sync
   npm run android:open        # opens Android Studio
   ```
3. In Android Studio: *Build > Generate Signed Bundle / APK* to build and sign the `.apk`.
4. Open the app, go to **Settings > Server connection**, enter `http://<PC-IP>:8000` and the token.

## Saving files on the phone
Downloads are fetched by the backend. When one finishes, press **Save to device**: the app copies the file
into `Documents/YTManager` using the Capacitor Filesystem plugin (Android scoped storage, so no broad
storage permission is requested). Very large files are read into memory for this copy, so keep Android
downloads modest or move to a streaming native plugin later.

## Production notes
- `capacitor.config.json` uses `androidScheme: "http"` and `cleartext: true` so a LAN server works. For a real
  release, serve the backend over HTTPS, set `androidScheme` to `https` and `cleartext` to `false`.
- Background downloads with notifications (the document's Phase 7) would need a native Android service
  or WorkManager plugin. That part is **not implemented** here.
