import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A match is locked (no more submissions / predictions become public) once kickoff has passed. */
export function isLocked(kickoffTime: Date | string): boolean {
  return new Date(kickoffTime).getTime() <= Date.now();
}

/** Build a flag image URL from an ISO 3166-1 alpha-2 code via flagcdn, else return as-is. */
export function flagUrl(code?: string | null): string | null {
  if (!code) return null;
  if (code.startsWith("http")) return code;
  if (code.length === 2) return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
  return null;
}
