import { saveTracks, type TrackRecord } from "../music-db";
import { makeContentKey } from "../music-import";
import { LAST_PLAYBACK_KEY } from "./types";

/**
 * Tracks imported before database version 3 have no content key, so they would
 * not be recognised as duplicates of a re-copied file. Hash them once in the
 * background after the library loads, a few at a time so the UI stays smooth.
 */
export async function backfillContentKeys(tracks: TrackRecord[]) {
  const pending = tracks.filter((track) => !track.contentKey);
  if (!pending.length) return;

  const BATCH_SIZE = 8;
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = await Promise.all(
      pending.slice(index, index + BATCH_SIZE).map(async (track) => ({
        ...track,
        contentKey: (await makeContentKey(track.audio)) || undefined,
      })),
    );
    await saveTracks(batch.filter((track) => track.contentKey));
  }
}

/** The track and offset playback stopped at last time, if it still exists. */
export function readLastPlayback(tracks: TrackRecord[]) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(LAST_PLAYBACK_KEY) || "{}",
    ) as { id?: string; time?: number };
    const savedTrack = tracks.find((track) => track.id === saved.id);
    if (savedTrack) return { track: savedTrack, time: saved.time || 0 };
  } catch {
    // A corrupt or unreadable entry just means starting from the top.
  }
  return tracks[0] ? { track: tracks[0], time: 0 } : undefined;
}
