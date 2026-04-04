/** Count only CJK Unified Ideographs (hanzi) */
export function countHanzi(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
}

/** Check which required keywords appear in text */
export function checkKeywordsUsed(
  text: string,
  keywords: string[],
): { allPresent: boolean; used: string[]; missing: string[] } {
  const used = keywords.filter((kw) => text.includes(kw));
  const missing = keywords.filter((kw) => !text.includes(kw));
  return { allPresent: missing.length === 0, used, missing };
}
