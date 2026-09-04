"use client";

import {
  ArrowDownUp,
  Bluetooth,
  CarFront,
  Check,
  ChevronDown,
  Disc3,
  FolderOpen,
  HardDrive,
  Library,
  ListPlus,
  ListMusic,
  LoaderCircle,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Settings2,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  Smartphone,
  Sun,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearTracks,
  findTrackByContentKey,
  findTrackByFingerprint,
  readSongLists,
  readTracks,
  removeSongList,
  removeTrack,
  saveSongList,
  saveSongLists,
  saveTrack,
  type SongListRecord,
  type TrackRecord,
} from "./music-db";
import {
  AUDIO_ONLY_ACCEPT,
  createTrackFromFile,
  isSupportedMediaFile,
  makeContentKey,
  SUPPORTED_MEDIA_ACCEPT,
} from "./music-import";
import { CoverArt } from "./components/CoverArt";
import { IconButton } from "./components/IconButton";
import { useAppShell } from "./hooks/useAppShell";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useMediaSession } from "./hooks/useMediaSession";
import { useTheme } from "./hooks/useTheme";
import {
  formatBytes,
  formatImportTime,
  formatTime,
  makeFingerprint,
} from "./lib/format";
import { backfillContentKeys, readLastPlayback } from "./lib/library";
import {
  assignTracksExclusively,
  normalizeExclusiveSongLists,
} from "./lib/song-lists";
import {
  type AppView,
  type ImportState,
  type SortMode,
  type StorageState,
  LAST_PLAYBACK_KEY,
  TOTAL_SONGS_ID,
} from "./lib/types";

export default function MusicApp() {
  const [tracks, setTracks] = useState<TrackRecord[]>([]);
  const [songLists, setSongLists] = useState<SongListRecord[]>([]);
  const [activeSongListId, setActiveSongListId] = useState(TOTAL_SONGS_ID);
  const [assigningTrack, setAssigningTrack] = useState<TrackRecord>();
  const [isSelectingTracks, setIsSelectingTracks] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [bulkAssignmentOpen, setBulkAssignmentOpen] = useState(false);
  const [view, setView] = useState<AppView>("library");
  const [sortMode, setSortMode] = useState<SortMode>("added-desc");
  const [query, setQuery] = useState("");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [importState, setImportState] = useState<ImportState>();
  const [toast, setToast] = useState<string>();
  const [storage, setStorage] = useState<StorageState>({ usage: 0, quota: 0 });
  const [storagePersisted, setStoragePersisted] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const videoImportInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const { themeMode, setThemeMode } = useTheme();
  const { isStandalone, isOnline } = useAppShell();

  const activeSongList = useMemo(
    () => songLists.find((songList) => songList.id === activeSongListId),
    [activeSongListId, songLists],
  );

  const assignedTrackIds = useMemo(
    () => new Set(songLists.flatMap((songList) => songList.trackIds)),
    [songLists],
  );

  const totalListTracks = useMemo(
    () => tracks.filter((track) => !assignedTrackIds.has(track.id)),
    [assignedTrackIds, tracks],
  );

  const tracksForSongList = useCallback(
    (songListId: string) => {
      if (songListId === TOTAL_SONGS_ID) return totalListTracks;
      const songList = songLists.find((item) => item.id === songListId);
      if (!songList) return totalListTracks;
      const trackIds = new Set(songList.trackIds);
      return tracks.filter((track) => trackIds.has(track.id));
    },
    [songLists, totalListTracks, tracks],
  );

  const playbackQueue = useMemo(() => {
    return tracksForSongList(activeSongListId);
  }, [activeSongListId, tracksForSongList]);

  const {
    audioRef,
    audioElementProps,
    currentTrack,
    currentTrackId,
    setCurrentTrackId,
    isPlaying,
    currentTime,
    duration,
    repeatMode,
    cycleRepeat,
    shuffleEnabled,
    setShuffleEnabled,
    playAudio,
    pauseAudio,
    togglePlayback,
    playTrack,
    resumeTrack,
    moveTrack,
    seekTo,
  } = useAudioPlayer({ tracks, playbackQueue, onNotice: setToast });

  useMediaSession({
    audioRef,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    onPlay: useCallback(() => void playAudio(), [playAudio]),
    onPause: pauseAudio,
    onPrevious: useCallback(() => moveTrack(-1), [moveTrack]),
    onNext: useCallback(() => moveTrack(1), [moveTrack]),
  });

  /**
   * Playing a song also decides which list the queue follows. A search spans
   * every list, so a hit has to pull the queue over to the list that song lives
   * in; otherwise next/previous would jump somewhere else entirely.
   */
  const selectTrack = useCallback(
    (id: string, openPlayer = false) => {
      if (openPlayer) setPlayerOpen(true);
      setActiveSongListId(
        songLists.find((songList) => songList.trackIds.includes(id))?.id ||
          TOTAL_SONGS_ID,
      );
      playTrack(id);
    },
    [playTrack, songLists],
  );

  const activeSongListName = activeSongList?.name || "总列表";

  const assignmentTrackIds = useMemo(
    () =>
      assigningTrack
        ? [assigningTrack.id]
        : bulkAssignmentOpen
          ? selectedTrackIds
          : [],
    [assigningTrack, bulkAssignmentOpen, selectedTrackIds],
  );

  const getTrackSongListId = useCallback(
    (trackId: string) =>
      songLists.find((songList) => songList.trackIds.includes(trackId))?.id ||
      TOTAL_SONGS_ID,
    [songLists],
  );

  const assignmentTargetId = useMemo(() => {
    const targets = new Set(assignmentTrackIds.map(getTrackSongListId));
    return targets.size === 1 ? [...targets][0] : undefined;
  }, [assignmentTrackIds, getTrackSongListId]);

  const musicBytes = useMemo(
    () => tracks.reduce((total, track) => total + track.size, 0),
    [tracks],
  );

  const isSearching = query.trim().length > 0;

  const visibleTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    // Because the total list only holds ungrouped songs, searching inside the
    // active list alone would hide everything already filed away. A search
    // therefore spans the whole library.
    const filtered = normalizedQuery
      ? tracks.filter((track) =>
          [track.title, track.artist, track.album, track.fileName]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        )
      : playbackQueue;

    return [...filtered].sort((a, b) => {
      if (sortMode === "added-asc") return a.addedAt - b.addedAt;
      if (sortMode === "added-desc") return b.addedAt - a.addedAt;

      const titleOrder = a.title.localeCompare(b.title, "zh-CN", {
        numeric: true,
        sensitivity: "base",
      });
      if (titleOrder !== 0) {
        return sortMode === "title-desc" ? -titleOrder : titleOrder;
      }
      return b.addedAt - a.addedAt;
    });
  }, [playbackQueue, query, sortMode, tracks]);

  const refreshStorage = useCallback(async () => {
    if (navigator.storage?.persisted) {
      try {
        setStoragePersisted(await navigator.storage.persisted());
      } catch {
        // Older WebKit builds expose the API without honouring it.
      }
    }
    if (!navigator.storage?.estimate) return;
    const estimate = await navigator.storage.estimate();
    setStorage({
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    });
  }, []);

  /**
   * Without persistent storage iOS may evict the whole IndexedDB library when
   * the device is low on space. Asking right after a successful import gives
   * the request the best chance of being granted.
   */
  const requestPersistentStorage = useCallback(async () => {
    if (!navigator.storage?.persist || !navigator.storage.persisted) return;
    try {
      if (await navigator.storage.persisted()) {
        setStoragePersisted(true);
        return;
      }
      setStoragePersisted(await navigator.storage.persist());
    } catch {
      // Denied or unsupported; the library still works, just evictable.
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadLibrary = async () => {
      try {
        const [storedTracks, storedSongLists] = await Promise.all([
          readTracks(),
          readSongLists(),
        ]);
        if (!active) return;
        const { nextSongLists: normalizedSongLists, changedSongLists } =
          normalizeExclusiveSongLists(storedSongLists, storedTracks);
        setTracks(storedTracks);
        setSongLists(normalizedSongLists);
        if (changedSongLists.length) {
          void saveSongLists(changedSongLists);
        }
        // Fire and forget: dedupe accuracy improves once this lands, and
        // nothing in the UI waits on it.
        void backfillContentKeys(storedTracks).catch(() => {});

        const lastPlayback = readLastPlayback(storedTracks);
        if (lastPlayback) {
          setActiveSongListId(
            normalizedSongLists.find((songList) =>
              songList.trackIds.includes(lastPlayback.track.id),
            )?.id || TOTAL_SONGS_ID,
          );
          resumeTrack(lastPlayback.track.id, lastPlayback.time);
        }
      } catch {
        setToast("无法读取本地音乐库，请检查浏览器存储权限");
      } finally {
        if (active) setLibraryLoading(false);
      }
    };

    void loadLibrary();
    queueMicrotask(() => void refreshStorage());

    return () => {
      active = false;
    };
  }, [refreshStorage, resumeTrack]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(
      isSupportedMediaFile,
    );
    event.target.value = "";
    if (!files.length) return;

    let imported = 0;
    let skipped = 0;
    const importedTracks: TrackRecord[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setImportState({
        current: index + 1,
        total: files.length,
        fileName: file.name,
      });
      try {
        // The name/size/mtime key is free, so try it before hashing bytes.
        let duplicate = await findTrackByFingerprint(makeFingerprint(file));
        const contentKey = duplicate ? "" : await makeContentKey(file);
        if (!duplicate && contentKey) {
          duplicate = await findTrackByContentKey(contentKey);
        }
        if (duplicate) {
          skipped += 1;
          continue;
        }
        const track = await createTrackFromFile(file, contentKey);
        await saveTrack(track);
        importedTracks.push(track);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    const nextTracks = await readTracks();
    setTracks(nextTracks);
    setImportState(undefined);
    void refreshStorage();
    if (imported) void requestPersistentStorage();

    if (!currentTrackId && nextTracks[0]) {
      setCurrentTrackId(nextTracks[0].id);
    }
    if (importedTracks.length === 1) {
      setToast(`已将《${importedTracks[0].title}》存到本机`);
    } else {
      setToast(
        `已导入 ${imported} 首${skipped ? `，跳过 ${skipped} 首` : ""}`,
      );
    }
  };

  const handleRemoveTrack = async (track: TrackRecord) => {
    const confirmed = window.confirm(`从本机音乐库删除《${track.title}》？`);
    if (!confirmed) return;
    await removeTrack(track.id);
    const nextTracks = tracks.filter((item) => item.id !== track.id);
    setTracks(nextTracks);
    setSongLists((current) =>
      current.map((songList) => ({
        ...songList,
        trackIds: songList.trackIds.filter((trackId) => trackId !== track.id),
      })),
    );
    if (currentTrackId === track.id) {
      pauseAudio();
      setCurrentTrackId(nextTracks[0]?.id);
      seekTo(0);
    }
    setToast("歌曲已从本机移除");
    void refreshStorage();
  };

  const handleClearLibrary = async () => {
    const confirmed = window.confirm(
      "确定清空此设备上的全部音乐？原始媒体文件不会受到影响。",
    );
    if (!confirmed) return;
    pauseAudio();
    await clearTracks();
    setTracks([]);
    setSongLists((current) =>
      current.map((songList) => ({ ...songList, trackIds: [] })),
    );
    setCurrentTrackId(undefined);
    seekTo(0);
    try {
      localStorage.removeItem(LAST_PLAYBACK_KEY);
    } catch {
      // Nothing to clean up if local storage is unavailable.
    }
    setToast("本机音乐库已清空");
    void refreshStorage();
  };

  const persistTrackAssignments = async (
    trackIds: string[],
    targetSongListId: string,
  ) => {
    const { nextSongLists, changedSongLists } = assignTracksExclusively(
      songLists,
      trackIds,
      targetSongListId,
      new Set(tracks.map((track) => track.id)),
    );
    if (!changedSongLists.length) return;

    await saveSongLists(changedSongLists);
    setSongLists(nextSongLists);
  };

  const finishAssignment = () => {
    setAssigningTrack(undefined);
    setBulkAssignmentOpen(false);
    setIsSelectingTracks(false);
    setSelectedTrackIds([]);
  };

  const moveTracksToSongList = async (
    trackIds: string[],
    targetSongListId: string,
  ) => {
    await persistTrackAssignments(trackIds, targetSongListId);
    const targetName =
      targetSongListId === TOTAL_SONGS_ID
        ? "总列表"
        : songLists.find((songList) => songList.id === targetSongListId)?.name ||
          "歌曲列表";
    const movedCount = new Set(trackIds).size;
    finishAssignment();
    setToast(
      movedCount > 1
        ? `已将 ${movedCount} 首歌曲移到“${targetName}”`
        : `已移到“${targetName}”`,
    );
  };

  const createSongList = async (initialTrackIds: string[] = []) => {
    const proposedName = window.prompt(
      "给歌曲列表起个名字",
      initialTrackIds.length ? "我的列表" : "中文歌",
    );
    const name = proposedName?.trim();
    if (!name) return;
    if (
      songLists.some(
        (songList) =>
          songList.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setToast("已经有同名歌曲列表");
      return;
    }

    const now = Date.now();
    const validTrackIds = new Set(tracks.map((track) => track.id));
    const nextTrackIds = [...new Set(initialTrackIds)].filter((trackId) =>
      validTrackIds.has(trackId),
    );
    // The new list is not in `songLists` yet, so target an id no list owns:
    // that strips the songs out of their old lists and leaves them for the new
    // record below.
    const { nextSongLists: cleanedSongLists, changedSongLists } =
      assignTracksExclusively(
        songLists,
        nextTrackIds,
        TOTAL_SONGS_ID,
        validTrackIds,
      );
    const nextSongList: SongListRecord = {
      id: crypto.randomUUID(),
      name,
      trackIds: nextTrackIds,
      createdAt: now,
      updatedAt: now,
    };
    await saveSongLists([...changedSongLists, nextSongList]);
    setSongLists([...cleanedSongLists, nextSongList]);
    if (!nextTrackIds.length) setActiveSongListId(nextSongList.id);
    else finishAssignment();
    setToast(
      nextTrackIds.length
        ? `已新建“${name}”并移入 ${nextTrackIds.length} 首歌曲`
        : `已新建歌曲列表“${name}”`,
    );
  };

  const renameActiveSongList = async () => {
    if (!activeSongList) return;
    const proposedName = window.prompt("修改歌曲列表名称", activeSongList.name);
    const name = proposedName?.trim();
    if (!name || name === activeSongList.name) return;
    if (
      songLists.some(
        (songList) =>
          songList.id !== activeSongList.id &&
          songList.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setToast("已经有同名歌曲列表");
      return;
    }
    const updatedSongList = {
      ...activeSongList,
      name,
      updatedAt: Date.now(),
    };
    await saveSongList(updatedSongList);
    setSongLists((current) =>
      current.map((songList) =>
        songList.id === updatedSongList.id ? updatedSongList : songList,
      ),
    );
    setToast("歌曲列表已重命名");
  };

  const deleteActiveSongList = async () => {
    if (!activeSongList) return;
    const confirmed = window.confirm(
      `删除歌曲列表“${activeSongList.name}”？歌曲本身不会被删除。`,
    );
    if (!confirmed) return;
    await removeSongList(activeSongList.id);
    setSongLists((current) =>
      current.filter((songList) => songList.id !== activeSongList.id),
    );
    setActiveSongListId(TOTAL_SONGS_ID);
    setToast("歌曲列表已删除，其中歌曲已回到总列表");
  };

  const leaveSelectionMode = () => {
    setIsSelectingTracks(false);
    setSelectedTrackIds([]);
    setBulkAssignmentOpen(false);
  };

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId],
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = visibleTracks.map((track) => track.id);
    const allVisibleSelected = visibleIds.every((trackId) =>
      selectedTrackIds.includes(trackId),
    );
    setSelectedTrackIds((current) => {
      if (allVisibleSelected) {
        const visibleSet = new Set(visibleIds);
        return current.filter((trackId) => !visibleSet.has(trackId));
      }
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const playActiveSongList = () => {
    const firstTrack = playbackQueue[0];
    if (!firstTrack) {
      setToast("这个歌曲列表还没有歌曲");
      return;
    }
    selectTrack(firstTrack.id);
    setView("drive");
  };

  const selectDriveSongList = (songListId: string) => {
    const nextQueue = tracksForSongList(songListId);
    if (!nextQueue.length) {
      setToast("这个歌曲列表还没有歌曲");
      return;
    }
    setActiveSongListId(songListId);
    setQuery("");
    selectTrack(nextQueue[0].id);
  };

  /**
   * Exports the grouping only, never the audio. Songs can always be re-imported
   * from the Mac; what is expensive to rebuild by hand is which song sits in
   * which list. Tracks are matched back by content key so the backup survives a
   * fresh re-import with new track ids.
   */
  const handleExportSongLists = () => {
    const trackById = new Map(tracks.map((track) => [track.id, track]));
    const backup = {
      format: "roadbeat-songlists",
      version: 1,
      exportedAt: new Date().toISOString(),
      songLists: songLists.map((songList) => ({
        name: songList.name,
        createdAt: songList.createdAt,
        tracks: songList.trackIds.flatMap((trackId) => {
          const track = trackById.get(trackId);
          if (!track) return [];
          return [
            {
              title: track.title,
              artist: track.artist,
              fileName: track.fileName,
              size: track.size,
              contentKey: track.contentKey,
            },
          ];
        }),
      })),
    };

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `roadbeat-歌曲列表-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("已导出歌曲列表配置，可存进「文件」App");
  };

  const handleImportSongLists = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    interface BackupTrack {
      contentKey?: string;
      fileName?: string;
      size?: number;
    }
    interface Backup {
      format?: string;
      songLists?: Array<{ name?: string; tracks?: BackupTrack[] }>;
    }

    let backup: Backup;
    try {
      backup = JSON.parse(await file.text()) as Backup;
    } catch {
      setToast("这个文件不是有效的 RoadBeat 备份");
      return;
    }
    if (backup.format !== "roadbeat-songlists" || !backup.songLists?.length) {
      setToast("这个文件不是 RoadBeat 的歌曲列表备份");
      return;
    }

    const byContentKey = new Map(
      tracks
        .filter((track) => track.contentKey)
        .map((track) => [track.contentKey as string, track.id]),
    );
    const byFileKey = new Map(
      tracks.map((track) => [`${track.fileName}:${track.size}`, track.id]),
    );

    const claimed = new Set<string>();
    const existingNames = new Set(songLists.map((songList) => songList.name));
    const restored: SongListRecord[] = [];
    let matched = 0;
    let missing = 0;

    backup.songLists.forEach((entry, index) => {
      const trackIds = (entry.tracks || []).flatMap((item) => {
        const id =
          (item.contentKey && byContentKey.get(item.contentKey)) ||
          byFileKey.get(`${item.fileName}:${item.size}`);
        if (!id || claimed.has(id)) {
          if (!id) missing += 1;
          return [];
        }
        claimed.add(id);
        matched += 1;
        return [id];
      });

      let name = entry.name?.trim() || `恢复的列表 ${index + 1}`;
      while (existingNames.has(name)) name = `${name} (恢复)`;
      existingNames.add(name);

      restored.push({
        id: crypto.randomUUID(),
        name,
        trackIds,
        createdAt: Date.now() + index,
        updatedAt: Date.now(),
      });
    });

    // Restored lists take ownership, so drop these songs from any list they are
    // currently in and keep the one-list-per-song rule intact.
    const rebased = songLists.map((songList) => ({
      ...songList,
      trackIds: songList.trackIds.filter((trackId) => !claimed.has(trackId)),
      updatedAt: Date.now(),
    }));

    const nextSongLists = [...rebased, ...restored];
    setSongLists(nextSongLists);
    await saveSongLists(nextSongLists);
    setToast(
      `已恢复 ${restored.length} 个列表 · 匹配 ${matched} 首${
        missing ? `，${missing} 首还没导入` : ""
      }`,
    );
  };

  const handleCarAudioTest = async () => {
    if (!currentTrack) {
      setView("library");
      setToast("请先导入并选择一首音乐");
      return;
    }
    setView("drive");
    const started = await playAudio();
    if (started) {
      setToast("正在播放，请确认特斯拉媒体源已选择“手机”");
    }
  };

  const navItems: Array<{
    id: AppView;
    label: string;
    icon: ReactNode;
  }> = [
    { id: "library", label: "音乐库", icon: <Library /> },
    { id: "drive", label: "驾驶", icon: <CarFront /> },
    { id: "settings", label: "设置", icon: <Settings2 /> },
  ];

  const playbackControls = (
    <div className="playback-controls">
      <IconButton
        label={shuffleEnabled ? "关闭随机播放" : "开启随机播放"}
        className={shuffleEnabled ? "is-active" : ""}
        onClick={() => setShuffleEnabled((value) => !value)}
        disabled={!currentTrack}
      >
        <Shuffle />
      </IconButton>
      <IconButton
        label="上一首"
        className="skip-button"
        onClick={() => moveTrack(-1)}
        disabled={!currentTrack}
      >
        <SkipBack />
      </IconButton>
      <IconButton
        label={isPlaying ? "暂停" : "播放"}
        className="primary-play"
        onClick={togglePlayback}
        disabled={!currentTrack}
      >
        {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </IconButton>
      <IconButton
        label="下一首"
        className="skip-button"
        onClick={() => moveTrack(1)}
        disabled={!currentTrack}
      >
        <SkipForward />
      </IconButton>
      <IconButton
        label={
          repeatMode === "one"
            ? "单曲循环"
            : repeatMode === "all"
              ? "列表循环"
              : "循环关闭"
        }
        className={repeatMode !== "off" ? "is-active" : ""}
        onClick={cycleRepeat}
        disabled={!currentTrack}
      >
        {repeatMode === "one" ? <Repeat1 /> : <Repeat />}
      </IconButton>
    </div>
  );

  const driveControls = (
    <div className="drive-controls" aria-label="驾驶播放控制">
      <IconButton
        label="上一首"
        className="drive-skip"
        onClick={() => moveTrack(-1)}
        disabled={!currentTrack}
      >
        <SkipBack />
      </IconButton>
      <IconButton
        label={isPlaying ? "暂停" : "播放"}
        className="drive-play"
        onClick={togglePlayback}
        disabled={!currentTrack}
      >
        {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </IconButton>
      <IconButton
        label="下一首"
        className="drive-skip"
        onClick={() => moveTrack(1)}
        disabled={!currentTrack}
      >
        <SkipForward />
      </IconButton>
    </div>
  );

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="phone-app">
        <audio ref={audioRef} preload="metadata" playsInline {...audioElementProps} />

        <input
          ref={importInputRef}
          className="visually-hidden"
          type="file"
          accept={AUDIO_ONLY_ACCEPT}
          multiple
          onChange={handleFiles}
          aria-label="选择 MP3、M4A、AAC、WAV、AIFF 或 CAF 文件"
        />

        <input
          ref={backupInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleImportSongLists(event)}
          aria-label="选择 RoadBeat 歌曲列表备份文件"
        />

        <input
          ref={videoImportInputRef}
          className="visually-hidden"
          type="file"
          accept={SUPPORTED_MEDIA_ACCEPT}
          multiple
          onChange={handleFiles}
          aria-label="选择 MP4 文件，只导入其中的音轨"
        />

        <header className={`top-bar ${view === "drive" ? "drive-top-bar" : ""}`}>
          {view === "drive" ? (
            <>
              <div className="drive-header-title">
                <span className="brand-mark compact">
                  {/* Relative path works for both the root Sites URL and GitHub Pages. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="icon-192.png" alt="" />
                </span>
                <div>
                  <span>ROADBEAT</span>
                  <strong>驾驶播放</strong>
                </div>
              </div>
              <span className="drive-connection">
                <Bluetooth aria-hidden="true" />
                蓝牙就绪
              </span>
            </>
          ) : (
            <>
              {/* One header per view: the brand mark, where you are, and the
                  action that belongs here. The separate page title block this
                  replaced cost roughly a third of the screen before any song. */}
              <div className="brand-lockup">
                <span className="brand-mark">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="icon-192.png" alt="" />
                </span>
                <div>
                  <strong id={view === "library" ? "library-title" : "settings-title"}>
                    {view === "library" ? "音乐库" : "设置"}
                  </strong>
                  <span className="brand-sub">
                    {view === "library"
                      ? tracks.length
                        ? `${tracks.length} 首 · ${formatBytes(musicBytes)}`
                        : "还没有音乐"
                      : "主题、存储与车载音响"}
                  </span>
                </div>
              </div>
              {view === "library" ? (
                <button
                  type="button"
                  className="import-button"
                  onClick={() => importInputRef.current?.click()}
                  disabled={Boolean(importState)}
                >
                  {importState ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                  <span>{importState ? "选取中" : "选取文件"}</span>
                </button>
              ) : (
                <span className={`status-pill ${isOnline ? "" : "is-offline"}`}>
                  {isOnline ? <ShieldCheck /> : <WifiOff />}
                  {isOnline ? "仅存本机" : "离线可用"}
                </span>
              )}
            </>
          )}
        </header>

        <div className="view-area">
          {view === "library" && (
            <section className="library-view" aria-labelledby="library-title">
              {!isStandalone && tracks.length === 0 && (
                <div className="install-card">
                  <span className="install-icon">
                    <Smartphone />
                  </span>
                  <div>
                    <strong>先添加到主屏幕</strong>
                    <p>在 Safari 点“共享”，选择“添加到主屏幕”，再从 App 内选取文件。</p>
                  </div>
                </div>
              )}

              {importState && (
                <div className="import-progress" aria-live="polite">
                  <div className="progress-copy">
                    <span>
                      正在复制 {importState.current}/{importState.total}
                    </span>
                    <strong>{importState.fileName}</strong>
                  </div>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${(importState.current / importState.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {tracks.length > 0 && (
                <>
                  <div className="song-list-tabs" role="tablist" aria-label="歌曲列表">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeSongListId === TOTAL_SONGS_ID}
                      className={activeSongListId === TOTAL_SONGS_ID ? "is-active" : ""}
                      onClick={() => {
                        leaveSelectionMode();
                        setActiveSongListId(TOTAL_SONGS_ID);
                        setQuery("");
                      }}
                    >
                      总列表
                      <span>{totalListTracks.length}</span>
                    </button>
                    {songLists.map((songList) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeSongListId === songList.id}
                        className={activeSongListId === songList.id ? "is-active" : ""}
                        key={songList.id}
                        onClick={() => {
                          leaveSelectionMode();
                          setActiveSongListId(songList.id);
                          setQuery("");
                        }}
                      >
                        {songList.name}
                        <span>
                          {
                            songList.trackIds.filter((trackId) =>
                              tracks.some((track) => track.id === trackId),
                            ).length
                          }
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="add-song-list"
                      onClick={() => void createSongList()}
                    >
                      <Plus aria-hidden="true" />
                      新建列表
                    </button>
                  </div>

                  {activeSongList && (
                    <div className="song-list-toolbar">
                      <div>
                        <span>当前播放范围</span>
                        <strong>{activeSongList.name}</strong>
                      </div>
                      <button
                        type="button"
                        className="play-song-list"
                        onClick={playActiveSongList}
                        disabled={!playbackQueue.length}
                      >
                        <Play fill="currentColor" aria-hidden="true" />
                        播放列表
                      </button>
                      <IconButton
                        label={`重命名 ${activeSongList.name}`}
                        className="song-list-action"
                        onClick={() => void renameActiveSongList()}
                      >
                        <Pencil />
                      </IconButton>
                      <IconButton
                        label={`删除 ${activeSongList.name}`}
                        className="song-list-action danger"
                        onClick={() => void deleteActiveSongList()}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  )}
                </>
              )}

              {tracks.length > 0 && (
                <div className="library-tools">
                  <label className="search-box">
                    <Search aria-hidden="true" />
                    <span className="visually-hidden">搜索音乐</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索歌名、歌手或专辑"
                    />
                    {query && (
                      <button
                        type="button"
                        aria-label="清除搜索"
                        onClick={() => setQuery("")}
                      >
                        <X />
                      </button>
                    )}
                  </label>
                </div>
              )}

              {libraryLoading ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" />
                  <span>正在打开本机音乐库</span>
                </div>
              ) : tracks.length === 0 ? (
                <div className="empty-library">
                  <div className="airdrop-badge">
                    <Wifi aria-hidden="true" />
                    Mac 局域网共享
                  </div>
                  <h2>直接从 Mac 挑歌</h2>
                  <p>把 Mac 挂到「文件」App 里，就不用再经过 VLC 中转。</p>
                  <ol className="airdrop-flow" aria-label="从 Mac 添加音乐的步骤">
                    <li>
                      <span>1</span>
                      <div>
                        <strong>Mac 打开文件共享</strong>
                        <small>
                          系统设置 → 通用 → 共享 → 文件共享，把音乐文件夹加进共享列表
                        </small>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>iPhone 连接一次</strong>
                        <small>
                          文件 App → 浏览 → 右上角 ⋯ → 连接服务器 → smb://Mac 的局域网 IP
                        </small>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>在这里一次多选</strong>
                        <small>点下方按钮 → 共享 → 你的 Mac，可一次选择几十首</small>
                      </div>
                    </li>
                  </ol>
                  <button
                    type="button"
                    className="large-cta"
                    onClick={() => importInputRef.current?.click()}
                  >
                    <FolderOpen />
                    选取文件
                  </button>
                  <button
                    type="button"
                    className="ghost-link"
                    onClick={() => videoImportInputRef.current?.click()}
                  >
                    改为选取 MP4，只导入音轨
                  </button>
                  <small className="offline-copy">
                    支持 MP3 / M4A / AAC / WAV / AIFF / CAF · MP4 只播放音轨
                    <br />
                    也可以继续用原来的 VLC Wi-Fi 共享：选取文件 → 我的 iPhone → VLC
                  </small>
                </div>
              ) : visibleTracks.length === 0 ? (
                <div className="no-results">
                  {activeSongList && !query ? <ListMusic /> : <Search />}
                  <strong>
                    {activeSongList && !query
                      ? "这个列表还没有歌曲"
                      : "没有找到相关歌曲"}
                  </strong>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeSongList && !query) {
                        setActiveSongListId(TOTAL_SONGS_ID);
                        setToast("可单首或批量把总列表中的歌曲移进自定义列表");
                      } else {
                        setQuery("");
                      }
                    }}
                  >
                    {activeSongList && !query ? "返回总列表" : "清除搜索"}
                  </button>
                </div>
              ) : (
                <div className="track-list">
                  <div className="list-label">
                    {isSearching ? (
                      <span>
                        <Search aria-hidden="true" />
                        搜索结果 · 全部歌曲
                      </span>
                    ) : (
                      <label className="sort-select">
                        <span className="visually-hidden">排序方式</span>
                        <ArrowDownUp aria-hidden="true" />
                        <select
                          value={sortMode}
                          onChange={(event) =>
                            setSortMode(event.target.value as SortMode)
                          }
                        >
                          <option value="added-desc">最近导入</option>
                          <option value="added-asc">最早导入</option>
                          <option value="title-asc">歌名 A–Z</option>
                          <option value="title-desc">歌名 Z–A</option>
                        </select>
                        <ChevronDown aria-hidden="true" />
                      </label>
                    )}
                    <span className="list-label-actions">
                      <span>{visibleTracks.length} 首</span>
                      {!isSelectingTracks && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsSelectingTracks(true);
                            setSelectedTrackIds([]);
                          }}
                        >
                          <ListPlus aria-hidden="true" />
                          批量分组
                        </button>
                      )}
                    </span>
                  </div>
                  {isSelectingTracks && (
                    <div className="bulk-selection-toolbar">
                      <strong>已选 {selectedTrackIds.length} 首</strong>
                      <button type="button" onClick={toggleSelectAllVisible}>
                        {visibleTracks.every((track) =>
                          selectedTrackIds.includes(track.id),
                        )
                          ? "取消全选"
                          : "全选当前"}
                      </button>
                      <button
                        type="button"
                        className="bulk-move-button"
                        disabled={!selectedTrackIds.length}
                        onClick={() => setBulkAssignmentOpen(true)}
                      >
                        移到列表
                      </button>
                      <IconButton label="退出批量选择" onClick={leaveSelectionMode}>
                        <X />
                      </IconButton>
                    </div>
                  )}
                  {visibleTracks.map((track, index) => {
                    const active = track.id === currentTrackId;
                    const selected = selectedTrackIds.includes(track.id);
                    return (
                      <article
                        className={`track-row ${active ? "is-current" : ""} ${
                          isSelectingTracks ? "is-selecting" : ""
                        } ${selected ? "is-selected" : ""}`}
                        key={track.id}
                      >
                        <button
                          type="button"
                          className="track-main"
                          onClick={() =>
                            isSelectingTracks
                              ? toggleTrackSelection(track.id)
                              : selectTrack(track.id, true)
                          }
                          aria-label={
                            isSelectingTracks
                              ? `${selected ? "取消选择" : "选择"} ${track.title}`
                              : `播放 ${track.title}`
                          }
                        >
                          <span className="track-number">
                            {isSelectingTracks ? (
                              <span
                                className={`selection-check ${
                                  selected ? "is-checked" : ""
                                }`}
                              >
                                {selected ? <Check aria-hidden="true" /> : null}
                              </span>
                            ) : active && isPlaying ? (
                              <span className="equalizer" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                              </span>
                            ) : (
                              String(index + 1).padStart(2, "0")
                            )}
                          </span>
                          <CoverArt track={track} className="track-cover" decorative />
                          <span className="track-copy">
                            <strong>{track.title}</strong>
                            <span>
                              {/* One meaningful sub-line: the artist, plus the
                                  album or import time only when they add
                                  something the fallback value does not. */}
                              {[
                                track.artist,
                                track.album === "本地音乐" ? "" : track.album,
                                sortMode.startsWith("added")
                                  ? `导入 ${formatImportTime(track.addedAt)}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="track-duration">
                            {formatTime(track.duration)}
                          </span>
                        </button>
                        {!isSelectingTracks && (
                          <div className="track-actions">
                            <IconButton
                              label={`移动 ${track.title} 到歌曲列表`}
                              className="group-track"
                              onClick={() => setAssigningTrack(track)}
                            >
                              <ListPlus />
                            </IconButton>
                            <IconButton
                              label={`删除 ${track.title}`}
                              className="delete-track"
                              onClick={() => void handleRemoveTrack(track)}
                            >
                              <Trash2 />
                            </IconButton>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {view === "drive" && (
            <section className="drive-view" aria-labelledby="drive-title">
              <h1 id="drive-title" className="visually-hidden">驾驶模式</h1>

              {tracks.length > 0 && (
                <label className="drive-list-picker">
                  <span className="drive-list-icon">
                    <ListMusic aria-hidden="true" />
                  </span>
                  <span className="drive-list-copy">
                    <small>选择播放列表</small>
                    <strong>{activeSongListName}</strong>
                  </span>
                  <select
                    value={activeSongListId}
                    onChange={(event) =>
                      selectDriveSongList(event.target.value)
                    }
                    aria-label="选择驾驶模式播放列表"
                  >
                    <option
                      value={TOTAL_SONGS_ID}
                      disabled={!totalListTracks.length}
                    >
                      总列表 · {totalListTracks.length} 首
                    </option>
                    {songLists.map((songList) => {
                      const count = tracksForSongList(songList.id).length;
                      return (
                        <option
                          value={songList.id}
                          disabled={!count}
                          key={songList.id}
                        >
                          {songList.name} · {count} 首
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown aria-hidden="true" />
                </label>
              )}

              {currentTrack ? (
                <>
                  <div className="drive-stage">
                    <div className="drive-orbit" />
                    <CoverArt track={currentTrack} className="drive-cover" />
                  </div>
                  <div className="drive-track-copy">
                    <span>{activeSongListName}</span>
                    <h2>{currentTrack.title}</h2>
                    <p>{currentTrack.artist}</p>
                  </div>
                  {/* Transport is grouped and pushed to the bottom of the
                      view: while driving these are the only controls that
                      matter, and they need to sit within thumb reach. */}
                  <div className="drive-transport">
                    <div className="drive-progress">
                      <input
                        type="range"
                        min="0"
                        max={Math.max(duration, 1)}
                        step="0.1"
                        value={Math.min(currentTime, Math.max(duration, 1))}
                        onChange={(event) => seekTo(Number(event.target.value))}
                        aria-label="播放进度"
                        style={{
                          "--range-progress": `${
                            duration ? (currentTime / duration) * 100 : 0
                          }%`,
                        } as CSSProperties}
                      />
                      <div>
                        <span>{formatTime(currentTime)}</span>
                        <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
                      </div>
                    </div>
                    {driveControls}
                  </div>
                </>
              ) : (
                <div className="drive-empty">
                  <CarFront />
                  <h2>还没有可播放的音乐</h2>
                  <p>
                    在「文件」App 里连上 Mac 的共享文件夹直接多选导入；原来的 VLC
                    路径也仍然可用。
                  </p>
                  <button
                    type="button"
                    className="large-cta"
                    onClick={() => {
                      setView("library");
                      window.setTimeout(
                        () => importInputRef.current?.click(),
                        100,
                      );
                    }}
                  >
                    <Plus />
                    选取文件
                  </button>
                </div>
              )}
            </section>
          )}

          {view === "settings" && (
            <section className="settings-view" aria-labelledby="settings-title">
              <div className="settings-card theme-card">
                <div className="setting-icon">
                  {themeMode === "light" ? <Sun /> : <Moon />}
                </div>
                <div className="setting-body">
                  <strong>显示主题</strong>
                  <p>深色适合夜间，浅色在白天和强光下更清晰。</p>
                </div>
                <div className="theme-switch" role="group" aria-label="显示主题">
                  <button
                    type="button"
                    className={themeMode === "dark" ? "is-active" : ""}
                    aria-pressed={themeMode === "dark"}
                    onClick={() => setThemeMode("dark")}
                  >
                    <Moon aria-hidden="true" />
                    深色
                  </button>
                  <button
                    type="button"
                    className={themeMode === "light" ? "is-active" : ""}
                    aria-pressed={themeMode === "light"}
                    onClick={() => setThemeMode("light")}
                  >
                    <Sun aria-hidden="true" />
                    浅色
                  </button>
                </div>
              </div>

              <div className="settings-card storage-card">
                <div className="setting-icon">
                  <HardDrive />
                </div>
                <div className="setting-body">
                  <span className="setting-title-row">
                    <strong>本机存储</strong>
                    <span>{formatBytes(musicBytes)}</span>
                  </span>
                  <p>
                    {tracks.length} 首音乐 · 浏览器共使用{" "}
                    {formatBytes(storage.usage)}
                  </p>
                  <div className="storage-bar">
                    <span
                      style={{
                        width: `${
                          storage.quota
                            ? Math.max(
                                2,
                                Math.min(100, (storage.usage / storage.quota) * 100),
                              )
                            : 2
                        }%`,
                      }}
                    />
                  </div>
                  <small>
                    可用配额约{" "}
                    {storage.quota
                      ? formatBytes(Math.max(0, storage.quota - storage.usage))
                      : "正在估算"}
                  </small>
                  <span
                    className={`storage-state ${
                      storagePersisted ? "is-persisted" : ""
                    }`}
                  >
                    {storagePersisted
                      ? "常驻存储已开启，系统不会自动清理"
                      : "未开启常驻存储，空间紧张时可能被回收"}
                  </span>
                </div>
              </div>

              <div className="settings-card car-audio-card">
                <div className="setting-icon">
                  <Bluetooth />
                </div>
                <div className="setting-body">
                  <strong>特斯拉车载音响</strong>
                  <p>
                    手机钥匙不等于媒体连接。请在车机“控制 → 蓝牙”连接这台
                    iPhone，再把媒体源切到“手机”。
                  </p>
                </div>
                <button
                  type="button"
                  className="small-action"
                  onClick={() => void handleCarAudioTest()}
                >
                  播放测试
                </button>
              </div>

              <div className="settings-card backup-card">
                <div className="setting-icon">
                  <ListMusic />
                </div>
                <div className="setting-body">
                  <strong>歌曲列表备份</strong>
                  <p>
                    只导出分组配置（几 KB），不含音乐。万一网站数据被清理，重新导入音乐后可以一键恢复分组。
                  </p>
                  <div className="setting-actions">
                    <button
                      type="button"
                      className="small-action"
                      onClick={handleExportSongLists}
                      disabled={!songLists.length}
                    >
                      导出配置
                    </button>
                    <button
                      type="button"
                      className="small-action ghost"
                      onClick={() => backupInputRef.current?.click()}
                    >
                      恢复配置
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-card transfer-card">
                <div className="setting-icon">
                  <Wifi />
                </div>
                <div className="setting-body">
                  <strong>从 Mac 添加音乐</strong>
                  <p>
                    推荐：Mac 系统设置 → 通用 → 共享 → 文件共享；iPhone 文件 App →
                    浏览 → ⋯ → 连接服务器 → smb://Mac 的 IP。之后在音乐库点“选取文件”，
                    进「共享」就能直接多选。
                  </p>
                  <p className="setting-fallback">
                    备选（原流程）：iPhone VLC → 网络 → 通过 Wi-Fi 共享，Mac
                    浏览器上传后，选取文件 → 我的 iPhone → VLC。两条路都可以用，导入结果完全一样。
                  </p>
                </div>
              </div>

              <div className="privacy-note">
                <Disc3 />
                <div>
                  <strong>纯本地播放器</strong>
                  <p>
                    没有账号、云同步、歌词、在线音乐搜索或多设备同步。删除网页
                    App 或清理网站数据会移除已导入音乐和歌曲列表，请保留原始文件备份。
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="danger-button"
                onClick={() => void handleClearLibrary()}
                disabled={!tracks.length}
              >
                <Trash2 />
                清空本机音乐库
              </button>
              <p className="version-note">RoadBeat · Personal Audio Player</p>
            </section>
          )}
        </div>

        {currentTrack && view !== "drive" && (
          <div className="mini-player">
            <button
              type="button"
              className="mini-main"
              onClick={() => setPlayerOpen(true)}
              aria-label="打开正在播放"
            >
              <CoverArt track={currentTrack} className="mini-cover" decorative />
              <span>
                <strong>{currentTrack.title}</strong>
                <small>{currentTrack.artist}</small>
              </span>
            </button>
            <IconButton
              label={isPlaying ? "暂停" : "播放"}
              onClick={togglePlayback}
              className="mini-play"
            >
              {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </IconButton>
            <IconButton label="下一首" onClick={() => moveTrack(1)}>
              <SkipForward />
            </IconButton>
            <span
              className="mini-progress"
              style={{
                width: `${duration ? (currentTime / duration) * 100 : 0}%`,
              }}
            />
          </div>
        )}

        <nav className="bottom-nav" aria-label="主要导航">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "is-active" : ""}
              onClick={() => {
                leaveSelectionMode();
                if (item.id === "drive") {
                  let driveQueue = tracksForSongList(activeSongListId);
                  if (!driveQueue.length && currentTrackId) {
                    const currentSongListId = getTrackSongListId(currentTrackId);
                    setActiveSongListId(currentSongListId);
                    driveQueue = tracksForSongList(currentSongListId);
                  }
                  if (
                    driveQueue.length &&
                    !driveQueue.some((track) => track.id === currentTrackId)
                  ) {
                    selectTrack(driveQueue[0].id);
                  }
                }
                setView(item.id);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {assignmentTrackIds.length > 0 && (
          <div
            className="song-list-sheet-backdrop"
            onClick={() => {
              setAssigningTrack(undefined);
              setBulkAssignmentOpen(false);
            }}
          >
            <section
              className="song-list-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="song-list-sheet-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span>
                    {assignmentTrackIds.length > 1
                      ? "批量移动歌曲"
                      : "移动到歌曲列表"}
                  </span>
                  <h2 id="song-list-sheet-title">
                    {assignmentTrackIds.length > 1
                      ? `${assignmentTrackIds.length} 首歌曲`
                      : assigningTrack?.title}
                  </h2>
                </div>
                <IconButton
                  label="关闭歌曲列表"
                  onClick={() => {
                    setAssigningTrack(undefined);
                    setBulkAssignmentOpen(false);
                  }}
                >
                  <X />
                </IconButton>
              </header>

              <div className="song-list-sheet-options">
                <button
                  type="button"
                  className={
                    assignmentTargetId === TOTAL_SONGS_ID ? "is-selected" : ""
                  }
                  onClick={() =>
                    void moveTracksToSongList(
                      assignmentTrackIds,
                      TOTAL_SONGS_ID,
                    )
                  }
                >
                  <span className="song-list-option-icon">
                    <Library aria-hidden="true" />
                  </span>
                  <span className="song-list-option-copy">
                    <strong>总列表</strong>
                    <small>{totalListTracks.length} 首 · 未分组歌曲</small>
                  </span>
                  <span className="song-list-check">
                    {assignmentTargetId === TOTAL_SONGS_ID ? (
                      <Check aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
                {songLists.map((songList) => {
                  const selected = assignmentTargetId === songList.id;
                  return (
                    <button
                      type="button"
                      className={selected ? "is-selected" : ""}
                      key={songList.id}
                      onClick={() =>
                        void moveTracksToSongList(
                          assignmentTrackIds,
                          songList.id,
                        )
                      }
                    >
                      <span className="song-list-option-icon">
                        <ListMusic aria-hidden="true" />
                      </span>
                      <span className="song-list-option-copy">
                        <strong>{songList.name}</strong>
                        <small>{songList.trackIds.length} 首</small>
                      </span>
                      <span className="song-list-check">
                        {selected ? <Check aria-hidden="true" /> : null}
                      </span>
                    </button>
                  );
                })}
                {!songLists.length && (
                  <div className="song-list-sheet-empty">
                    <ListMusic aria-hidden="true" />
                    <strong>还没有自定义列表</strong>
                    <span>先新建一个，例如“中文歌”或“R&amp;B”</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="create-song-list-button"
                onClick={() => void createSongList(assignmentTrackIds)}
              >
                <Plus aria-hidden="true" />
                新建列表并移入
              </button>
              <p className="song-list-sheet-note">
                每首歌曲只属于一个列表，移动后会从原列表消失
              </p>
            </section>
          </div>
        )}

        {playerOpen && currentTrack && (
          <section className="now-playing" aria-label="正在播放">
            <div className="player-backdrop">
              <CoverArt track={currentTrack} decorative />
            </div>
            <header className="player-header">
              <IconButton label="收起播放器" onClick={() => setPlayerOpen(false)}>
                <ChevronDown />
              </IconButton>
              <div>
                <span>正在播放</span>
                <strong>{currentTrack.album}</strong>
              </div>
              <span className="player-device">
                <Bluetooth />
              </span>
            </header>

            <div className="player-content">
              <CoverArt track={currentTrack} className="hero-cover" />
              <div className="player-title">
                <div>
                  <h2>{currentTrack.title}</h2>
                  <p>{currentTrack.artist}</p>
                </div>
                <span className="local-badge">本机</span>
              </div>
              <div className="timeline">
                <input
                  type="range"
                  min="0"
                  max={Math.max(duration, 1)}
                  step="0.1"
                  value={Math.min(currentTime, Math.max(duration, 1))}
                  onChange={(event) => seekTo(Number(event.target.value))}
                  aria-label="播放进度"
                  style={{
                    "--range-progress": `${
                      duration ? (currentTime / duration) * 100 : 0
                    }%`,
                  } as CSSProperties}
                />
                <div>
                  <span>{formatTime(currentTime)}</span>
                  <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
                </div>
              </div>
              {playbackControls}
              <div className="output-card">
                <Bluetooth />
                <div>
                  <span>音频输出</span>
                  <strong>iPhone 系统音频 · 支持车载蓝牙</strong>
                </div>
                <span className="pulse-dot" />
              </div>
            </div>
          </section>
        )}

        {toast && (
          <div className="toast" role="status">
            <Check />
            {toast}
          </div>
        )}
      </div>
    </main>
  );
}
