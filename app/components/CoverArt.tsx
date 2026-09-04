"use client";

import { Music2 } from "lucide-react";
import { type CSSProperties, useEffect, useMemo } from "react";
import { getCoverHue } from "../lib/format";
import type { TrackRecord } from "../music-db";

/** Object URL for a Blob, revoked when the blob changes or the view unmounts. */
export function useBlobUrl(blob?: Blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return url;
}

export function CoverArt({
  track,
  className = "",
  decorative = false,
}: {
  track?: TrackRecord;
  className?: string;
  decorative?: boolean;
}) {
  const artworkUrl = useBlobUrl(track?.artwork);
  const style = {
    "--cover-hue": getCoverHue(track),
  } as CSSProperties;

  return (
    <div
      className={`cover-art ${className}`}
      style={style}
      aria-label={decorative ? undefined : `${track?.title || "音乐"}封面`}
      aria-hidden={decorative || undefined}
    >
      {artworkUrl ? (
        // Blob URLs are generated entirely on this device.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artworkUrl} alt="" />
      ) : (
        <>
          <span className="cover-glow" />
          <Music2 aria-hidden="true" />
          <span className="cover-monogram">
            {(track?.title || "R").slice(0, 1).toUpperCase()}
          </span>
        </>
      )}
    </div>
  );
}
