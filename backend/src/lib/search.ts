// Escapes LIKE wildcards so the search text is matched literally.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
