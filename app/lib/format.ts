import type { TrackRecord } from "../music-db";

export function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatBytes(value: number) {
  if (!value) return "0 MB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatImportTime(value: number) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

/** Cheap name/size/mtime key, tried before hashing the audio bytes. */
export function makeFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Stable per-title hue for the generated cover of a track with no artwork. */
export function getCoverHue(track?: TrackRecord) {
  const source = track?.title || "RoadBeat";
  let value = 0;
  for (let index = 0; index < source.length; index += 1) {
    value = (value * 31 + source.charCodeAt(index)) % 360;
  }
  return value;
}
