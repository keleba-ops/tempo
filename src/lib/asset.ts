/** Resolve a public asset (or a stored "/images/..." path) against the deploy base, e.g. /tempo/ on GitHub Pages. */
export function asset(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
