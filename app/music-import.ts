import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";
import type { TrackRecord } from "./music-db";

interface ParsedTags {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: Blob;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  caf: "audio/x-caf",
};

/**
 * iOS only shows the extra "照片图库 / 拍摄" system entries when the accept list
 * allows an image or video type. Keeping the everyday import audio-only makes
 * the picker open the Files browser directly, which is one tap less per import.
 */
export const AUDIO_ONLY_ACCEPT =
  ".mp3,.m4a,.aac,.wav,.aif,.aiff,.caf,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/aiff,audio/x-caf";

/** Used by the separate "MP4 音轨" entry, which still needs the video type. */
export const SUPPORTED_MEDIA_ACCEPT = `${AUDIO_ONLY_ACCEPT},.mp4,video/mp4`;

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function getMediaMime(fileName: string, declaredMime = "") {
  return MIME_BY_EXTENSION[getExtension(fileName)] || declaredMime || "audio/mpeg";
}

export function isSupportedMediaFile(file: File) {
  return Boolean(MIME_BY_EXTENSION[getExtension(file.name)]);
}

/**
 * Bytes sampled from each end of the file when building the content key.
 * Hashing the whole file would mean holding a second full copy in memory on a
 * phone; the head carries the tags and the tail carries the audio, so a
 * head+tail+size sample is enough to tell two different songs apart.
 */
const CONTENT_SAMPLE_BYTES = 512 * 1024;

/**
 * Identifies a track by its audio bytes rather than by file name and mtime, so
 * the same song copied over a different route (VLC, SMB, iCloud Drive) is still
 * recognised as a duplicate.
 */
export async function makeContentKey(source: Blob): Promise<string> {
  if (!crypto.subtle) return "";

  const head = source.slice(0, Math.min(CONTENT_SAMPLE_BYTES, source.size));
  const tail = source.slice(Math.max(0, source.size - CONTENT_SAMPLE_BYTES));
  const sample = new Blob([
    new TextEncoder().encode(`${source.size}:`),
    head,
    tail,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await sample.arrayBuffer(),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cleanFileTitle(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").trim() || "未命名歌曲";
}

function readTags(file: File): Promise<ParsedTags> {
  return new Promise((resolve) => {
    new jsmediatags.Reader(file)
      .setTagsToRead(["title", "artist", "album", "picture"])
      .read({
        onSuccess(result) {
          const picture = result.tags.picture;
          resolve({
            title: result.tags.title?.trim(),
            artist: result.tags.artist?.trim(),
            album: result.tags.album?.trim(),
            artwork: picture
              ? new Blob([new Uint8Array(picture.data)], {
                  type: picture.format || "image/jpeg",
                })
              : undefined,
          });
        },
        onError() {
          resolve({});
        },
      });
  });
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const mime = getMediaMime(file.name, file.type);
    const playableFile =
      file.type === mime ? file : file.slice(0, file.size, mime);
    const objectUrl = URL.createObjectURL(playableFile);

    const finish = (duration = 0) => {
      URL.revokeObjectURL(objectUrl);
      audio.remove();
      resolve(Number.isFinite(duration) ? duration : 0);
    };

    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => finish(audio.duration), {
      once: true,
    });
    audio.addEventListener("error", () => finish(), { once: true });
    audio.src = objectUrl;
  });
}

export async function createTrackFromFile(
  file: File,
  /** Pass the key already computed for the duplicate check to avoid rehashing. */
  knownContentKey?: string,
): Promise<TrackRecord> {
  const [tags, duration, contentKey] = await Promise.all([
    readTags(file),
    readDuration(file),
    knownContentKey ?? makeContentKey(file),
  ]);

  const mime = getMediaMime(file.name, file.type);

  return {
    id: crypto.randomUUID(),
    fingerprint: `${file.name}:${file.size}:${file.lastModified}`,
    contentKey: contentKey || undefined,
    fileName: file.name,
    title: tags.title || cleanFileTitle(file.name),
    artist: tags.artist || "未知歌手",
    album: tags.album || "本地音乐",
    duration,
    size: file.size,
    mime,
    audio: file.slice(0, file.size, mime),
    artwork: tags.artwork,
    addedAt: Date.now(),
    lastModified: file.lastModified,
  };
}
