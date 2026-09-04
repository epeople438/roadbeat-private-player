"use client";

import type { ReactNode } from "react";

export function IconButton({
  label,
  children,
  className = "",
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
