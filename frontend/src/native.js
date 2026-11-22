import { api } from "./api.js";

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
  await Filesystem.writeFile({ path: `YTManager/${task.filename}`, data, directory: Directory.Documents, recursive: true });
}
