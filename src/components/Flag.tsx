import { flagUrl } from "@/lib/utils";

export default function Flag({
  code,
  alt,
  size = 32,
}: {
  code?: string | null;
  alt: string;
  size?: number;
}) {
  const url = flagUrl(code);
  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded bg-white/10 text-xs font-bold text-slate-300"
        style={{ width: size, height: size * 0.7 }}
        aria-label={alt}
      >
        {alt.slice(0, 3).toUpperCase()}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size * 0.7}
      className="rounded object-cover shadow ring-1 ring-white/10"
      style={{ width: size, height: size * 0.7 }}
    />
  );
}
