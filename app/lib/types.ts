/** Shared vocabulary for the RoadBeat UI. */

export type AppView = "library" | "drive" | "settings";
export type SortMode = "added-desc" | "added-asc" | "title-asc" | "title-desc";
export type RepeatMode = "off" | "all" | "one";
export type ThemeMode = "dark" | "light";

export interface ImportState {
  current: number;
  total: number;
  fileName: string;
}

export interface StorageState {
  usage: number;
  quota: number;
}

export const LAST_PLAYBACK_KEY = "roadbeat:last-playback";
export const THEME_KEY = "roadbeat:theme";

/** The pseudo list id standing for "songs that are not in a custom list". */
export const TOTAL_SONGS_ID = "total";
