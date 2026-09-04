"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { LAST_PLAYBACK_KEY, type RepeatMode } from "../lib/types";
import type { TrackRecord } from "../music-db";
import { getMediaMime } from "../music-import";

interface AudioPlayerOptions {
  /** Every track in the library, used to resolve the current track. */
  tracks: TrackRecord[];
  /** The ordered list next/previous walk through. */
  playbackQueue: TrackRecord[];
  /** Surfaces a short message to the user (a toast in the app shell). */
  onNotice: (message: string) => void;
}

/**
 * Owns everything about making sound: which track is loaded, the Blob URLs
 * behind it, play/pause intent across iOS interruptions, shuffle and repeat,
 * and the saved resume position. The views consume this interface instead of
 * touching the audio element.
 */
export function useAudioPlayer({
  tracks,
  playbackQueue,
  onNotice,
}: AudioPlayerOptions) {
  const [currentTrackId, setCurrentTrackId] = useState<string>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string | undefined>(undefined);
  /** Blob URL for the track after the current one, created ahead of the gap. */
  const preloadedRef = useRef<{ id: string; url: string } | undefined>(undefined);
  const pendingPlayRef = useRef(false);
  const resumeTimeRef = useRef(0);
  /** Shuffled permutation of the current queue, so a pass plays every song once. */
  const shuffleOrderRef = useRef<string[]>([]);
  /** Identity of the queue the current shuffle order was built from. */
  const shuffleKeyRef = useRef<string | undefined>(undefined);
  /** Whether the user wants audio playing, independent of iOS interruptions. */
  const playIntentRef = useRef(false);

  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId),
    [tracks, currentTrackId],
  );

  const playAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return false;
    playIntentRef.current = true;
    try {
      await audio.play();
      return true;
    } catch {
      noticeRef.current("请再点一次播放，让 iPhone 授权音频输出");
      return false;
    }
  }, [currentTrack]);

  const pauseAudio = useCallback(() => {
    playIntentRef.current = false;
    audioRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) pauseAudio();
    else void playAudio();
  }, [isPlaying, pauseAudio, playAudio]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((mode) =>
      mode === "off" ? "all" : mode === "all" ? "one" : "off",
    );
  }, []);

  /**
   * A phone call, Siri or another app taking the audio session pauses the
   * element without the user asking for it. Remember that playback was meant to
   * continue and resume once the interruption is over, but never resume a pause
   * the user asked for.
   */
  useEffect(() => {
    const resumeIfInterrupted = () => {
      const audio = audioRef.current;
      if (!audio || !playIntentRef.current || !audio.paused) return;
      if (document.visibilityState === "hidden") return;
      void audio.play().catch(() => {
        // iOS can still refuse without a fresh gesture; the play button works.
      });
    };

    document.addEventListener("visibilitychange", resumeIfInterrupted);
    window.addEventListener("focus", resumeIfInterrupted);
    return () => {
      document.removeEventListener("visibilitychange", resumeIfInterrupted);
      window.removeEventListener("focus", resumeIfInterrupted);
    };
  }, []);

  /** Starts a track from the beginning, loading it if it is not current. */
  const playTrack = useCallback(
    (id: string) => {
      pendingPlayRef.current = true;
      resumeTimeRef.current = 0;
      if (id === currentTrackId) void playAudio();
      else setCurrentTrackId(id);
    },
    [currentTrackId, playAudio],
  );

  /** Loads a track paused, at a saved offset. Used when restoring on startup. */
  const resumeTrack = useCallback((id: string, time = 0) => {
    resumeTimeRef.current = time;
    setCurrentTrackId(id);
  }, []);

  /**
   * Fisher-Yates over the queue. The song already playing is pulled to the
   * front so switching shuffle on never cuts it off.
   */
  const buildShuffleOrder = useCallback((ids: string[], startId?: string) => {
    const order = [...ids];
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    if (startId) {
      const position = order.indexOf(startId);
      if (position > 0) {
        order.splice(position, 1);
        order.unshift(startId);
      }
    }
    return order;
  }, []);

  const shuffleOrderFor = useCallback(
    (ids: string[], startId?: string) => {
      const key = ids.join("|");
      if (shuffleKeyRef.current !== key) {
        shuffleKeyRef.current = key;
        shuffleOrderRef.current = buildShuffleOrder(ids, startId);
      }
      return shuffleOrderRef.current;
    },
    [buildShuffleOrder],
  );

  // A fresh shuffle order each time the mode is switched on, anchored on the
  // song currently playing.
  useEffect(() => {
    if (!shuffleEnabled) shuffleKeyRef.current = undefined;
  }, [shuffleEnabled]);

  const moveTrack = useCallback(
    (direction: 1 | -1, fromEnded = false) => {
      if (!playbackQueue.length) return;

      if (fromEnded && repeatMode === "one") {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          void audio.play();
        }
        return;
      }

      // In shuffle mode the queue is walked in a stored random order rather
      // than re-rolling each time, so every song plays once per pass and
      // "previous" returns to the song that actually played before.
      const queueIds = playbackQueue.map((track) => track.id);
      const order =
        shuffleEnabled && queueIds.length > 1
          ? shuffleOrderFor(queueIds, currentTrackId)
          : queueIds;

      const currentIndex = currentTrackId ? order.indexOf(currentTrackId) : -1;
      let nextId: string | undefined;

      if (currentIndex < 0) {
        nextId = direction === 1 ? order[0] : order[order.length - 1];
      } else if (currentIndex + direction >= order.length) {
        if (fromEnded && repeatMode === "off") {
          setIsPlaying(false);
          return;
        }
        if (shuffleEnabled && order.length > 1) {
          // A full pass finished: reshuffle for the next round and move the
          // song that just ended to the very end of it, so it does not come
          // back until every other song has had a turn.
          const reshuffled = buildShuffleOrder(queueIds);
          if (currentTrackId) {
            const played = reshuffled.indexOf(currentTrackId);
            if (played >= 0) {
              reshuffled.splice(played, 1);
              reshuffled.push(currentTrackId);
            }
          }
          shuffleOrderRef.current = reshuffled;
          shuffleKeyRef.current = queueIds.join("|");
          nextId = reshuffled[0];
        } else {
          nextId = order[0];
        }
      } else if (currentIndex + direction < 0) {
        nextId = order[order.length - 1];
      } else {
        nextId = order[currentIndex + direction];
      }

      if (!nextId) return;
      pendingPlayRef.current = true;
      resumeTimeRef.current = 0;
      setCurrentTrackId(nextId);
    },
    [
      buildShuffleOrder,
      currentTrackId,
      playbackQueue,
      repeatMode,
      shuffleEnabled,
      shuffleOrderFor,
    ],
  );

  const makePlaybackUrl = useCallback((track: TrackRecord) => {
    const playbackMime = getMediaMime(track.fileName, track.mime);
    const playbackBlob =
      track.audio.type === playbackMime
        ? track.audio
        : track.audio.slice(0, track.audio.size, playbackMime);
    return URL.createObjectURL(playbackBlob);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    // Reuse the URL prepared while the previous song was still playing; that
    // removes the pause between tracks.
    const preloaded = preloadedRef.current;
    let nextUrl: string;
    if (preloaded?.id === currentTrack.id) {
      nextUrl = preloaded.url;
      preloadedRef.current = undefined;
    } else {
      if (preloaded) URL.revokeObjectURL(preloaded.url);
      preloadedRef.current = undefined;
      nextUrl = makePlaybackUrl(currentTrack);
    }
    audioUrlRef.current = nextUrl;
    audio.src = nextUrl;
    audio.load();

    const handleReady = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (
        resumeTimeRef.current > 0 &&
        resumeTimeRef.current < audio.duration - 5
      ) {
        audio.currentTime = resumeTimeRef.current;
      }
      resumeTimeRef.current = 0;
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        playIntentRef.current = true;
        void audio.play().catch(() => {
          noticeRef.current("请点播放按钮开始");
        });
      }
    };

    audio.addEventListener("loadedmetadata", handleReady);
    return () => {
      audio.removeEventListener("loadedmetadata", handleReady);
    };
  }, [currentTrack, makePlaybackUrl]);

  // Prepare the next song's Blob URL while the current one plays.
  useEffect(() => {
    if (!currentTrackId || playbackQueue.length < 2) return;

    const queueIds = playbackQueue.map((track) => track.id);
    const order =
      shuffleEnabled && shuffleOrderRef.current.length === queueIds.length
        ? shuffleOrderRef.current
        : queueIds;
    const position = order.indexOf(currentTrackId);
    const nextId = position < 0 ? undefined : order[position + 1] ?? order[0];
    const nextTrack = playbackQueue.find((track) => track.id === nextId);
    if (!nextTrack || preloadedRef.current?.id === nextTrack.id) return;

    if (preloadedRef.current) URL.revokeObjectURL(preloadedRef.current.url);
    preloadedRef.current = {
      id: nextTrack.id,
      url: makePlaybackUrl(nextTrack),
    };
  }, [currentTrackId, makePlaybackUrl, playbackQueue, shuffleEnabled]);

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (preloadedRef.current) URL.revokeObjectURL(preloadedRef.current.url);
    },
    [],
  );

  const savePlaybackPosition = useCallback(() => {
    if (!currentTrackId || !audioRef.current) return;
    try {
      localStorage.setItem(
        LAST_PLAYBACK_KEY,
        JSON.stringify({
          id: currentTrackId,
          time: audioRef.current.currentTime,
        }),
      );
    } catch {
      // Private browsing can refuse writes; playback itself is unaffected.
    }
  }, [currentTrackId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") savePlaybackPosition();
    };
    window.addEventListener("pagehide", savePlaybackPosition);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", savePlaybackPosition);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [savePlaybackPosition]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  /** Props to spread onto the single `<audio>` element the app renders. */
  const audioElementProps = {
    onPlay: () => setIsPlaying(true),
    onPause: () => {
      setIsPlaying(false);
      savePlaybackPosition();
    },
    onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement>) => {
      const audio = event.currentTarget;
      setCurrentTime(audio.currentTime);
      if (audio.duration) setDuration(audio.duration);
    },
    onEnded: () => moveTrack(1, true),
    onError: () => {
      const fileName = currentTrack?.fileName || "";
      noticeRef.current(
        /\.aac$/i.test(fileName)
          ? "这个 AAC 的编码可能不是 iPhone 支持的 AAC-LC / HE-AAC"
          : /\.mp4$/i.test(fileName)
            ? "这个 MP4 可能没有 iPhone 支持的音轨"
            : "这首歌的格式或编码暂时无法播放",
      );
    },
  };

  return {
    audioRef,
    audioElementProps,
    currentTrack,
    currentTrackId,
    setCurrentTrackId,
    isPlaying,
    setIsPlaying,
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
    savePlaybackPosition,
  };
}
