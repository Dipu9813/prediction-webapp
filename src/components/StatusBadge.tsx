import { cn } from "@/lib/utils";

const map = {
  UPCOMING: { label: "Upcoming", cls: "bg-sky-500/15 text-sky-300" },
  LIVE: { label: "● Live", cls: "bg-red-500/15 text-red-300 animate-pulse-soft" },
  FINISHED: { label: "Finished", cls: "bg-slate-500/15 text-slate-300" },
} as const;

export default function StatusBadge({ status }: { status: keyof typeof map }) {
  const s = map[status];
  return <span className={cn("badge", s.cls)}>{s.label}</span>;
}
