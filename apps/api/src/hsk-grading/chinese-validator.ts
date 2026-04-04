/** Count only CJK Unified Ideographs (hanzi) */
export function countHanzi(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
}

/** Validate text contains Chinese characters + allowed punctuation */
export function isValidChineseInput(text: string): boolean {
  const valid =
    /^[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\d\s\n]+$/;
  return valid.test(text.trim());
}

/** Check which required keywords appear in text */
export function checkKeywordsUsed(
  text: string,
  keywords: string[],
): {
  allPresent: boolean;
  used: string[];
  missing: string[];
} {
  const used = keywords.filter((kw) => text.includes(kw));
  const missing = keywords.filter((kw) => !text.includes(kw));
  return { allPresent: missing.length === 0, used, missing };
}
