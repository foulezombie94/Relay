import { clsx, type ClassValue } from "clsx";

/** Joins conditional class names (shadcn `cn` helper; no Tailwind merge since Relay uses CSS modules). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
