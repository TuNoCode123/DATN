/**
 * Smart answer matching for IELTS-style fill-in-the-blank questions.
 *
 * Supports:
 *  - [OR]  — separate completely different acceptable answers
 *  - /     — alternative forms within one answer (e.g. TWO/2)
 *  - (text) — optional parts (e.g. (THE) MOTORWAY)
 *  - (A/B) — optional part with alternatives (e.g. 10 (A.M./AM))
 *  - Case-insensitive, whitespace-collapsed, hyphen-tolerant, abbreviation-dot-tolerant
 */

/** Normalize a string for comparison: lowercase, collapse whitespace, normalize hyphens, strip non-decimal dots. */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    // Strip dots UNLESS between two digits (preserve decimal points like 1.50)
    .replace(/\./g, (_, offset, str) => {
      const before = offset > 0 ? str[offset - 1] : '';
      const after = offset < str.length - 1 ? str[offset + 1] : '';
      return /\d/.test(before) && /\d/.test(after) ? '.' : '';
    })
    .replace(/-/g, ' ')       // treat hyphens as spaces
    .replace(/\s+/g, ' ')     // collapse multiple spaces
    .trim();
}

/**
 * Split a string by "/" but only outside parentheses.
 * e.g. "10 (A.M./AM)/TEN O'CLOCK" → ["10 (A.M./AM)", "TEN O'CLOCK"]
 */
function splitSlashOutsideParens(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === '/' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Given a single answer variant (no [OR], no outside-paren /), expand all
 * (optional) parts into every combination of present/absent.
 * Supports "/" inside optional groups for alternatives:
 *   "(A.M./AM)" expands the "present" case into two variants.
 *
 * Example: "(THE) MOTORWAY" → ["THE MOTORWAY", "MOTORWAY"]
 * Example: "10 (A.M./AM)" → ["10 A.M.", "10 AM", "10"]
 */
function expandOptionalParts(answer: string): string[] {
  const optionalRegex = /\(([^)]+)\)/g;
  const optionals: { fullMatch: string; inner: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = optionalRegex.exec(answer)) !== null) {
    optionals.push({ fullMatch: match[0], inner: match[1] });
  }

  if (optionals.length === 0) {
    return [answer];
  }

  // Generate 2^n combinations (present/absent for each optional)
  const count = optionals.length;
  let results: string[] = [];

  for (let mask = 0; mask < (1 << count); mask++) {
    let variants = [answer];

    // Replace from last to first to preserve string indices
    for (let i = count - 1; i >= 0; i--) {
      const opt = optionals[i];
      if (mask & (1 << i)) {
        // Include: expand slash alternatives inside the optional group
        const innerAlts = opt.inner.split('/');
        const newVariants: string[] = [];
        for (const v of variants) {
          for (const alt of innerAlts) {
            newVariants.push(v.replace(opt.fullMatch, alt));
          }
        }
        variants = newVariants;
      } else {
        // Exclude the optional part entirely
        variants = variants.map((v) => v.replace(opt.fullMatch, ''));
      }
    }
    results.push(...variants);
  }

  return results;
}

/** Detect time suffixes: AM, PM, A.M., P.M. */
const SUFFIX_MODIFIER = /^a\.?m\.?$|^p\.?m\.?$/i;
/** Detect currency/unit prefix symbols */
const PREFIX_MODIFIER = /^[£$€]+$/;

function classifyToken(token: string): 'main' | 'suffix' | 'prefix' {
  const trimmed = token.trim();
  if (SUFFIX_MODIFIER.test(trimmed)) return 'suffix';
  if (PREFIX_MODIFIER.test(trimmed)) return 'prefix';
  return 'main';
}

/**
 * Parse a correctAnswer pattern and return all accepted normalized forms.
 *
 * Pattern syntax:
 *  - " [OR] " separates independent alternative answers
 *  - "/" separates alternative forms within one group (only outside parentheses)
 *  - "(text)" marks optional parts; "/" inside parens creates optional alternatives
 *
 * Smart modifier handling:
 *  - Bare time suffixes (AM, PM, A.M., P.M.) after "/" are treated as optional
 *    suffixes combined with main answers, not standalone alternatives.
 *  - Bare currency symbols (£, $, €) after "/" are treated as optional prefixes.
 */
export function getAcceptedForms(correctAnswer: string): string[] {
  if (!correctAnswer) return [];

  const orGroups = correctAnswer.split(/\s*\[OR\]\s*/i);
  const accepted = new Set<string>();

  for (const group of orGroups) {
    const slashAlternatives = splitSlashOutsideParens(group);

    // Classify each slash-part as main answer, suffix modifier, or prefix modifier
    const mains: string[] = [];
    const suffixes: string[] = [];
    const prefixes: string[] = [];

    for (const alt of slashAlternatives) {
      const type = classifyToken(alt);
      if (type === 'suffix') suffixes.push(alt.trim());
      else if (type === 'prefix') prefixes.push(alt.trim());
      else mains.push(alt);
    }

    // If everything was classified as modifier, fall back to treating all as mains
    if (mains.length === 0) {
      mains.push(...suffixes, ...prefixes);
      suffixes.length = 0;
      prefixes.length = 0;
    }

    for (const main of mains) {
      const expanded = expandOptionalParts(main);
      for (const form of expanded) {
        const n = normalize(form);
        if (!n) continue;

        // Add the main form itself
        accepted.add(n);

        // Add main + each suffix (e.g. "10" + "AM" → "10 am")
        for (const suf of suffixes) {
          const combined = normalize(form + ' ' + suf);
          if (combined) accepted.add(combined);
        }

        // Add prefix + main (e.g. "£" + "1" → "£1")
        for (const pre of prefixes) {
          const combined = normalize(pre + form);
          if (combined) accepted.add(combined);
        }
      }
    }
  }

  return Array.from(accepted);
}

/**
 * Check whether a user's answer matches the correctAnswer pattern.
 *
 * @param userAnswer   The text the user typed
 * @param correctAnswer The pattern stored in the database (e.g. "TWO/2", "(THE) MOTORWAY [OR] M1")
 * @returns true if the user's answer matches any accepted form
 */
export function matchAnswer(
  userAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
): boolean {
  if (!userAnswer || !correctAnswer) return false;

  const normalizedUser = normalize(userAnswer);
  if (!normalizedUser) return false;

  const acceptedForms = getAcceptedForms(correctAnswer);
  return acceptedForms.includes(normalizedUser);
}
