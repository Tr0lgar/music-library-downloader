// Strips characters invalid in Windows/macOS/Linux file names and removes
// path separators outright — the latter also rules out any path traversal
// via a crafted title containing "../".
const INVALID_CHARS = /[/\\?%*:|"<>]/g

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(INVALID_CHARS, '_').trim()
  return cleaned.length > 0 ? cleaned : 'untitled'
}
