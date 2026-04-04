/**
 * Client-side answer pattern parser for admin preview.
 * Mirrors the backend logic in api/src/attempts/answer-matcher.ts
 */

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
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split by "/" only outside parentheses. */
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
 * Expand (optional) parts. Supports "/" inside parens for alternatives:
 * "(A.M./AM)" present → "A.M." or "AM"; absent → removed.
 */
function expandOptionalParts(answer: string): string[] {
  const optionalRegex = /\(([^)]+)\)/g;
  const optionals: { fullMatch: string; inner: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = optionalRegex.exec(answer)) !== null) {
    optionals.push({ fullMatch: match[0], inner: match[1] });
  }

  if (optionals.length === 0) return [answer];

  const count = optionals.length;
  const results: string[] = [];

  for (let mask = 0; mask < (1 << count); mask++) {
    let variants = [answer];
    for (let i = count - 1; i >= 0; i--) {
      const opt = optionals[i];
      if (mask & (1 << i)) {
        const innerAlts = opt.inner.split('/');
        const newVariants: string[] = [];
        for (const v of variants) {
          for (const alt of innerAlts) {
            newVariants.push(v.replace(opt.fullMatch, alt));
          }
        }
        variants = newVariants;
      } else {
        variants = variants.map((v) => v.replace(opt.fullMatch, ''));
      }
    }
    results.push(...variants);
  }

  return results;
}

const SUFFIX_MODIFIER = /^a\.?m\.?$|^p\.?m\.?$/i;
const PREFIX_MODIFIER = /^[£$€]+$/;

function classifyToken(token: string): 'main' | 'suffix' | 'prefix' {
  const trimmed = token.trim();
  if (SUFFIX_MODIFIER.test(trimmed)) return 'suffix';
  if (PREFIX_MODIFIER.test(trimmed)) return 'prefix';
  return 'main';
}

/**
 * Parse a correctAnswer pattern and return all accepted normalized forms.
 * Used in admin UI to preview what answers will be accepted.
 */
export function getAcceptedForms(correctAnswer: string): string[] {
  if (!correctAnswer) return [];

  const orGroups = correctAnswer.split(/\s*\[OR\]\s*/i);
  const accepted = new Set<string>();

  for (const group of orGroups) {
    const slashAlternatives = splitSlashOutsideParens(group);

    const mains: string[] = [];
    const suffixes: string[] = [];
    const prefixes: string[] = [];

    for (const alt of slashAlternatives) {
      const type = classifyToken(alt);
      if (type === 'suffix') suffixes.push(alt.trim());
      else if (type === 'prefix') prefixes.push(alt.trim());
      else mains.push(alt);
    }

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
        accepted.add(n);
        for (const suf of suffixes) {
          const combined = normalize(form + ' ' + suf);
          if (combined) accepted.add(combined);
        }
        for (const pre of prefixes) {
          const combined = normalize(pre + form);
          if (combined) accepted.add(combined);
        }
      }
    }
  }

  return Array.from(accepted);
}
