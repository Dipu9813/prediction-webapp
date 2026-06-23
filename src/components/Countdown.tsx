"use client";

import { useEffect, useState } from "react";

function diff(target: number) {
  const ms = target - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export default function Countdown({
  kickoff,
  onComplete,
}: {
  kickoff: string;
  onComplete?: () => void;
}) {
  const target = new Date(kickoff).getTime();
  const [t, setT] = useState(() => diff(target));

  useEffect(() => {
    const id = setInterval(() => {
      const next = diff(target);
      setT(next);
      if (!next) {
        clearInterval(id);
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onComplete]);

  if (!t) {
    return <span className="font-mono text-sm font-semibold text-gold">Kicked off</span>;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-mono text-sm tabular-nums text-slate-200">
      {t.d > 0 && `${t.d}d `}
      {pad(t.h)}:{pad(t.m)}:{pad(t.s)}
    </span>
  );
}
