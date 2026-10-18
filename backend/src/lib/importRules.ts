// Keywords are compared without case, diacritics and surrounding whitespace, so
// "Lidl", "LIDL BRATISLAVA" and "lídl" all meet the same rule.
export function normalizeKeyword(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
