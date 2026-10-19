// The Crowns audit ledger and the daily pay limit: pure helpers, so the byte bound and the day rule are testable.
// Ledger (world property `crowns:ledger`): a JSON array of [time ms, "p" pay | "g" give, from, to, amount, ...].
// Fields after the fifth are kept as they are, so a newer version's entries survive an older one rewriting the list.
// Paid today (player property `crowns:paid`): JSON [UTC day number, Crowns sent that day].

export const LEDGER_MAX = 200;
/** The most UTF-8 bytes the saved ledger may use: well under the 32,767 a dynamic property holds. */
export const LEDGER_BYTES = 30000;
/** A name takes at most this many UTF-8 bytes once JSON-encoded (quotes included): 200 entries of at most about 135 bytes fit LEDGER_BYTES. */
const NAME_BYTES = 50;
export const DAY_MS = 86400000;

/** @param {string} s exact UTF-8 length */
export function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) < 0xe000) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** The UTC day number of a time (the day the daily bonus and the pay limit both use). @param {number} ms */
export const utcDay = (ms) => Math.floor(ms / DAY_MS);

/** @param {unknown} raw the saved ledger text @returns {unknown[][]} */
export function parseLedger(raw) {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((e) => Array.isArray(e) && e.length >= 5) : [];
  } catch {
    return [];
  }
}

/** @param {unknown} name */
export function clean(name) {
  const chars = Array.from(String(name ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, ""));
  while (chars.length && utf8Length(JSON.stringify(chars.join(""))) > NAME_BYTES) chars.pop();
  return chars.join("");
}

/**
 * The ledger text after adding one entry: the newest LEDGER_MAX entries, and the oldest dropped until it fits LEDGER_BYTES.
 * @param {unknown} raw the saved ledger text @param {{ at: number, kind: "p" | "g", from: string, to: string, amount: number }} e
 * @returns {string}
 */
export function appendEntry(raw, e) {
  const list = parseLedger(raw);
  list.push([Math.floor(e.at), e.kind, clean(e.from), clean(e.to), Math.floor(e.amount)]);
  let out = list.slice(-LEDGER_MAX);
  let text = JSON.stringify(out);
  if (utf8Length(text) > LEDGER_BYTES) {
    // Shorten older, wider entries first (names, then extra fields) before any of the newest 200 is lost.
    out = out.map((e) => [e[0], e[1], clean(e[2]), clean(e[3]), ...e.slice(4)]);
    text = JSON.stringify(out);
    for (let i = 0; i < out.length && utf8Length(text) > LEDGER_BYTES; i++) {
      if (out[i].length > 5) {
        out[i] = out[i].slice(0, 5);
        text = JSON.stringify(out);
      }
    }
  }
  while (out.length > 1 && utf8Length(text) > LEDGER_BYTES) {
    out = out.slice(1);
    text = JSON.stringify(out);
  }
  return text;
}

/** Crowns the player has sent today. @param {unknown} raw the player's saved value @param {number} day */
export function paidOn(raw, day) {
  if (typeof raw !== "string") return 0;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v[0] === day && Number.isFinite(v[1]) && v[1] > 0 ? Math.floor(v[1]) : 0;
  } catch {
    return 0;
  }
}

/** @param {unknown} raw @param {number} day @param {number} amount @returns {string} */
export const addPaid = (raw, day, amount) => JSON.stringify([day, paidOn(raw, day) + Math.floor(amount)]);
