"use client";

import { type RefObject, useEffect, useRef } from "react";
import type { TrackRecord } from "../music-db";

interface MediaSessionOptions {
  audioRef: RefObject<HTMLAudioElement | null>;
  currentTrack?: TrackRecord;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Publishes the now-playing track and transport controls to iOS, so the lock
 * screen, headphone buttons, the steering wheel and the Tesla head unit can
 * drive playback. Which of these actually appear depends on the iOS and car
 * firmware; unsupported actions throw and are ignored.
 */
export function useMediaSession({
  audioRef,
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onPrevious,
  onNext,
}: MediaSessionOptions) {
  const artworkUrlRef = useRef<string | undefined>(undefined);

  useEffect(
    () => () => {
      if (artworkUrlRef.current) URL.revokeObjectURL(artworkUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return;

    if (artworkUrlRef.current) {
      URL.revokeObjectURL(artworkUrlRef.current);
      artworkUrlRef.current = undefined;
    }
    if (currentTrack.artwork) {
      artworkUrlRef.current = URL.createObjectURL(currentTrack.artwork);
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: artworkUrlRef.current
        ? [
            {
              src: artworkUrlRef.current,
              type: currentTrack.artwork?.type || "image/jpeg",
            },
          ]
        : [],
    });

    const actions: Array<
      [MediaSessionAction, MediaSessionActionHandler | null]
    > = [
      ["play", onPlay],
      ["pause", onPause],
      ["previoustrack", onPrevious],
      ["nexttrack", onNext],
      [
        "seekbackward",
        (details) => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = Math.max(
            0,
            audio.currentTime - (details.seekOffset || 10),
          );
        },
      ],
      [
        "seekforward",
        (details) => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = Math.min(
            audio.duration || Number.POSITIVE_INFINITY,
            audio.currentTime + (details.seekOffset || 10),
          );
        },
      ],
      [
        "seekto",
        (details) => {
          if (
            audioRef.current &&
            "seekTime" in details &&
            details.seekTime !== undefined
          ) {
            audioRef.current.currentTime = details.seekTime;
          }
        },
      ],
    ];

    actions.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some Safari versions expose only part of the Media Session actions.
      }
    });

    return () => {
      actions.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // No cleanup is needed for unsupported actions.
        }
      });
    };
  }, [audioRef, currentTrack, onNext, onPause, onPlay, onPrevious]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    if (duration > 0 && currentTime <= duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: audioRef.current?.playbackRate || 1,
          position: Math.max(0, currentTime),
        });
      } catch {
        // Position state is optional and varies by browser version.
      }
    }
  }, [audioRef, currentTime, duration, isPlaying]);
}
