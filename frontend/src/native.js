import { api } from "./api.js";

const BACKGROUND_AUDIO_ID = "ytm-owned-audio";
let backgroundAudioCreated = false;

/** Android: copy a finished file from the backend to the phone's Documents/YTManager folder. */
export async function saveToDevice(task) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const blob = await api.blob(`/api/downloads/${task.id}/file`);
  const data = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  const path = `YTManager/${task.filename}`;
  await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
  return (await Filesystem.getUri({ path, directory: Directory.Documents })).uri;
}

export async function playOwnedAudioInBackground(task) {
  if (task.source_url !== "local-file") {
    throw new Error("Background audio is available only for files you add yourself.");
  }
  const audioSource = await saveToDevice(task);
  const { AudioPlayer } = await import("@mediagrid/capacitor-native-audio");

  if (backgroundAudioCreated) {
    await AudioPlayer.changeAudioSource({ audioId: BACKGROUND_AUDIO_ID, source: audioSource });
    await AudioPlayer.changeMetadata({ audioId: BACKGROUND_AUDIO_ID, friendlyTitle: task.filename });
  } else {
    const created = await AudioPlayer.create({
      audioId: BACKGROUND_AUDIO_ID,
      audioSource,
      friendlyTitle: task.filename,
      useForNotification: true,
    });
    if (!created.success) throw new Error("Could not prepare this audio file.");
    const initialized = await AudioPlayer.initialize({ audioId: BACKGROUND_AUDIO_ID });
    if (!initialized.success) throw new Error("Could not initialize background audio.");
    backgroundAudioCreated = true;
  }
  await AudioPlayer.play({ audioId: BACKGROUND_AUDIO_ID });
}
