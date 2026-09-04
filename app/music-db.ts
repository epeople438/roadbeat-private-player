import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface TrackRecord {
  id: string;
  /** Legacy name/size/mtime key. Kept so existing rows stay unique-indexable. */
  fingerprint: string;
  /**
   * Hash of the audio bytes themselves. Undefined on rows imported before
   * database version 3; `backfillContentKeys()` fills those in on startup.
   */
  contentKey?: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  size: number;
  mime: string;
  audio: Blob;
  artwork?: Blob;
  addedAt: number;
  lastModified: number;
}

export interface SongListRecord {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface RoadBeatDatabase extends DBSchema {
  tracks: {
    key: string;
    value: TrackRecord;
    indexes: {
      "by-added": number;
      "by-fingerprint": string;
      "by-content": string;
    };
  };
  songLists: {
    key: string;
    value: SongListRecord;
    indexes: {
      "by-created": number;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<RoadBeatDatabase>> | undefined;

function getDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前浏览器不支持本地音乐库");
  }

  databasePromise ??= openDB<RoadBeatDatabase>("roadbeat-library", 3, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const tracks = database.createObjectStore("tracks", { keyPath: "id" });
        tracks.createIndex("by-added", "addedAt");
        tracks.createIndex("by-fingerprint", "fingerprint", { unique: true });
      }
      if (oldVersion < 2) {
        const songLists = database.createObjectStore("songLists", {
          keyPath: "id",
        });
        songLists.createIndex("by-created", "createdAt");
      }
      if (oldVersion < 3) {
        // Existing rows keep their audio; they simply have no contentKey yet.
        // IndexedDB skips records whose index key is undefined, so the index
        // stays valid until the startup backfill fills them in.
        transaction
          .objectStore("tracks")
          .createIndex("by-content", "contentKey");
      }
    },
  });

  return databasePromise;
}

export async function readTracks() {
  const database = await getDatabase();
  const tracks = await database.getAll("tracks");
  return tracks.sort((a, b) => b.addedAt - a.addedAt);
}

export async function findTrackByFingerprint(fingerprint: string) {
  const database = await getDatabase();
  return database.getFromIndex("tracks", "by-fingerprint", fingerprint);
}

export async function findTrackByContentKey(contentKey: string) {
  const database = await getDatabase();
  return database.getFromIndex("tracks", "by-content", contentKey);
}

export async function saveTrack(track: TrackRecord) {
  const database = await getDatabase();
  await database.put("tracks", track);
}

export async function saveTracks(tracks: TrackRecord[]) {
  if (!tracks.length) return;

  const database = await getDatabase();
  const transaction = database.transaction("tracks", "readwrite");
  await Promise.all(tracks.map((track) => transaction.store.put(track)));
  await transaction.done;
}

export async function removeTrack(id: string) {
  const database = await getDatabase();
  const transaction = database.transaction(["tracks", "songLists"], "readwrite");
  await transaction.objectStore("tracks").delete(id);
  const songListStore = transaction.objectStore("songLists");
  const songLists = await songListStore.getAll();
  await Promise.all(
    songLists
      .filter((songList) => songList.trackIds.includes(id))
      .map((songList) =>
        songListStore.put({
          ...songList,
          trackIds: songList.trackIds.filter((trackId) => trackId !== id),
          updatedAt: Date.now(),
        }),
      ),
  );
  await transaction.done;
}

export async function clearTracks() {
  const database = await getDatabase();
  const transaction = database.transaction(["tracks", "songLists"], "readwrite");
  await transaction.objectStore("tracks").clear();
  const songListStore = transaction.objectStore("songLists");
  const songLists = await songListStore.getAll();
  await Promise.all(
    songLists.map((songList) =>
      songListStore.put({
        ...songList,
        trackIds: [],
        updatedAt: Date.now(),
      }),
    ),
  );
  await transaction.done;
}

export async function readSongLists() {
  const database = await getDatabase();
  const songLists = await database.getAll("songLists");
  return songLists.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveSongList(songList: SongListRecord) {
  const database = await getDatabase();
  await database.put("songLists", songList);
}

export async function saveSongLists(songLists: SongListRecord[]) {
  if (!songLists.length) return;

  const database = await getDatabase();
  const transaction = database.transaction("songLists", "readwrite");
  await Promise.all(
    songLists.map((songList) => transaction.store.put(songList)),
  );
  await transaction.done;
}

export async function removeSongList(id: string) {
  const database = await getDatabase();
  await database.delete("songLists", id);
}
