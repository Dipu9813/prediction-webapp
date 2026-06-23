"use client";

import { useEffect, useState } from "react";

const OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Renders a kickoff time in the VIEWER's local timezone. Formatting happens in
 * the browser (after mount) so a user in e.g. Kathmandu sees their own time,
 * not the server's UTC. Mount-gated to avoid a hydration mismatch.
 */
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, OPTIONS));
  }, [iso]);

  // Before hydration, show the ISO date portion as a stable placeholder.
  return <span suppressHydrationWarning>{text || new Date(iso).toISOString().slice(0, 16).replace("T", " ")}</span>;
}
