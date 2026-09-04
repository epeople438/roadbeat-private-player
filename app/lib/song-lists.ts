import type { SongListRecord, TrackRecord } from "../music-db";

/**
 * RoadBeat's one domain rule: a song belongs to at most one custom list, and
 * the "total list" is simply the songs no custom list has claimed. Every path
 * that moves songs around — single move, bulk move, list creation, startup
 * repair — goes through this module so the rule cannot drift apart between
 * them.
 */

interface ExclusiveResult {
  /** The full list set after the change, for component state. */
  nextSongLists: SongListRecord[];
  /** Only the records that actually changed, for a minimal database write. */
  changedSongLists: SongListRecord[];
}

function sameOrder(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * Drops track ids that no longer exist and resolves any song claimed by more
 * than one list, keeping the first claim. Run at startup so a library edited by
 * an older build still satisfies the rule.
 */
export function normalizeExclusiveSongLists(
  songLists: SongListRecord[],
  tracks: TrackRecord[],
): ExclusiveResult {
  const validTrackIds = new Set(tracks.map((track) => track.id));
  const claimedTrackIds = new Set<string>();
  const changedSongLists: SongListRecord[] = [];

  const nextSongLists = songLists.map((songList) => {
    const nextTrackIds = songList.trackIds.filter((trackId) => {
      if (!validTrackIds.has(trackId) || claimedTrackIds.has(trackId)) {
        return false;
      }
      claimedTrackIds.add(trackId);
      return true;
    });
    if (sameOrder(nextTrackIds, songList.trackIds)) return songList;

    const normalized = {
      ...songList,
      trackIds: nextTrackIds,
      updatedAt: Date.now(),
    };
    changedSongLists.push(normalized);
    return normalized;
  });

  return { nextSongLists, changedSongLists };
}

/**
 * Moves `trackIds` into `targetSongListId`, removing them from every other
 * list. Passing `TOTAL_SONGS_ID` (or any id no list owns) as the target means
 * "ungroup", because the total list is defined by absence rather than
 * membership.
 */
export function assignTracksExclusively(
  songLists: SongListRecord[],
  trackIds: string[],
  targetSongListId: string,
  validTrackIds: Set<string>,
): ExclusiveResult {
  const movingTrackIds = [...new Set(trackIds)].filter((trackId) =>
    validTrackIds.has(trackId),
  );
  if (!movingTrackIds.length) {
    return { nextSongLists: songLists, changedSongLists: [] };
  }

  const moving = new Set(movingTrackIds);
  const now = Date.now();
  const changedSongLists: SongListRecord[] = [];

  const nextSongLists = songLists.map((songList) => {
    const withoutMoving = songList.trackIds.filter(
      (trackId) => !moving.has(trackId),
    );
    const nextTrackIds =
      songList.id === targetSongListId
        ? [...withoutMoving, ...movingTrackIds]
        : withoutMoving;
    if (sameOrder(nextTrackIds, songList.trackIds)) return songList;

    const updated = { ...songList, trackIds: nextTrackIds, updatedAt: now };
    changedSongLists.push(updated);
    return updated;
  });

  return { nextSongLists, changedSongLists };
}
