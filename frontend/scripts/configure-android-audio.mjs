import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = process.env.CAPACITOR_ANDROID_APP_DIR || path.join(frontendDir, "android", "app");
const manifestPath = path.join(appDir, "src", "main", "AndroidManifest.xml");
const stringsPath = path.join(appDir, "src", "main", "res", "values", "strings.xml");

if (!existsSync(manifestPath) || !existsSync(stringsPath)) {
  throw new Error("Android project files are missing. Run `npm run android:add` first.");
}

let manifest = readFileSync(manifestPath, "utf8");
const permissions = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.WAKE_LOCK",
];
for (const permission of permissions) {
  if (!manifest.includes(`android:name="${permission}"`)) {
    const applicationIndex = manifest.indexOf("<application");
    if (applicationIndex < 0) throw new Error("AndroidManifest.xml has no <application> element.");
    manifest = `${manifest.slice(0, applicationIndex)}    <uses-permission android:name="${permission}" />\n${manifest.slice(applicationIndex)}`;
  }
}

if (!manifest.includes("us.mediagrid.capacitorjs.plugins.nativeaudio.AudioPlayerService")) {
  const applicationEnd = manifest.lastIndexOf("</application>");
  if (applicationEnd < 0) throw new Error("AndroidManifest.xml has no closing </application> element.");
  const service = `        <service
            android:name="us.mediagrid.capacitorjs.plugins.nativeaudio.AudioPlayerService"
            android:description="@string/audio_player_service_description"
            android:foregroundServiceType="mediaPlayback"
            android:exported="true">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaSessionService" />
            </intent-filter>
        </service>
`;
  manifest = `${manifest.slice(0, applicationEnd)}${service}${manifest.slice(applicationEnd)}`;
}
writeFileSync(manifestPath, manifest);

let strings = readFileSync(stringsPath, "utf8");
if (!strings.includes('name="audio_player_service_description"')) {
  const resourcesEnd = strings.lastIndexOf("</resources>");
  if (resourcesEnd < 0) throw new Error("strings.xml has no closing </resources> element.");
  strings = `${strings.slice(0, resourcesEnd)}    <string name="audio_player_service_description">Allows for audio to play in the background.</string>\n${strings.slice(resourcesEnd)}`;
  writeFileSync(stringsPath, strings);
}
