// UTF-8 size of a string, counted with native regular expressions instead of a loop over every character: a story
// save is up to 30,000 characters, measured on every flush. Imports nothing, so the unit test loads it directly.

const NON_ASCII = /[^\x00-\x7f]/;
const TWO_BYTES = /[\u0080-\u07ff]/g;
const WIDE = /[\u0800-\uffff]/g; // 3 bytes, or one unit of a surrogate pair (4 bytes for the pair)
const SURROGATES = /[\ud800-\udfff]/g;

/**
 * UTF-8 bytes of `s` (the safe measure for a dynamic property: no more than 32,767). Exact for well-formed text,
 * which is all JSON.stringify writes (it escapes a lone surrogate). @param {string} s
 */
export function utf8Length(s) {
  if (!NON_ASCII.test(s)) return s.length;
  return s.length + (s.match(TWO_BYTES)?.length ?? 0) + 2 * (s.match(WIDE)?.length ?? 0) - (s.match(SURROGATES)?.length ?? 0);
}
