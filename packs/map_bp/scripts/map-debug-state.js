// Debug-only transport for the operator `realm:map_debug` state query. Pure: no game imports, no clocks, no
// randomness, no per-tick work. A script event message may hold at most 2047 UTF-8 bytes, so a full state that
// does not fit goes out as bounded packets that a receiver puts back together:
//   whole state fits      -> ONE legacy message: the state JSON itself (unchanged shape)
//   otherwise             -> up to 12 messages {"player","channel":"state","v":1,"chunk":{"id","index","total","text"}}
// `text` is a code-point-safe slice of the ONE JSON string of the state (never split inside a surrogate pair or
// an escape, because it is cut from the raw JSON text, not from an escaped copy); at most 1024 UTF-8 bytes raw and
// the whole message, JSON escaping included, at most 2047 bytes. `index` counts from 0. `id` is a local counter
// (no time, no secret). A state over 32768 bytes, or one that needs more than 12 packets, throws a RangeError.

export const CHUNK_VERSION = 1;
export const MAX_EVENT_BYTES = 2047;
export const MAX_TEXT_BYTES = 1024;
export const MAX_PACKETS = 12;
export const MAX_SOURCE_BYTES = 32768;
export const MAX_PENDING = 16;

/** UTF-8 bytes of a string (a lone surrogate counts 3, like TextEncoder's replacement character). @param {string} s */
export const utf8Length = (s) => {
  let n = 0;
  for (const ch of s) {
    const c = /** @type {number} */ (ch.codePointAt(0));
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};

/**
 * A packetizer with its own packet-id counter. `packetize(json, player)` returns the messages to send, in order.
 * @param {number} [start] first packet id
 */
export function createStatePacketizer(start = 1) {
  let next = start;
  return (/** @type {string} */ json, /** @type {unknown} */ player) => {
    const size = utf8Length(json);
    if (size <= MAX_EVENT_BYTES) return [json];
    if (size > MAX_SOURCE_BYTES) throw new RangeError(`map state is ${size} bytes, over the ${MAX_SOURCE_BYTES} byte debug limit`);
    // Largest envelope: the biggest index/total, an empty text. The real ones can only be smaller or equal.
    const frame = (/** @type {number} */ id, /** @type {number} */ index, /** @type {number} */ total, /** @type {string} */ text) =>
      JSON.stringify({ player, channel: "state", v: CHUNK_VERSION, chunk: { id, index, total, text } });
    const id = next++;
    const room = Math.min(MAX_TEXT_BYTES, MAX_EVENT_BYTES - utf8Length(frame(id, MAX_PACKETS, MAX_PACKETS, "")));
    /** @type {string[]} */
    const texts = [];
    let text = "", raw = 0, escaped = 0;
    for (const ch of json) {
      const rawCost = utf8Length(ch);
      const escCost = utf8Length(JSON.stringify(ch)) - 2; // the quote, backslash and control expansion
      if (text && (raw + rawCost > MAX_TEXT_BYTES || escaped + escCost > room)) {
        texts.push(text);
        text = "";
        raw = 0;
        escaped = 0;
      }
      text += ch;
      raw += rawCost;
      escaped += escCost;
    }
    if (text) texts.push(text);
    if (texts.length > MAX_PACKETS) throw new RangeError(`map state needs ${texts.length} packets, over the ${MAX_PACKETS} packet debug limit`);
    return texts.map((t, i) => {
      const message = frame(id, i, texts.length, t);
      if (utf8Length(message) > MAX_EVENT_BYTES) throw new RangeError("map state packet over the event size limit");
      return message;
    });
  };
}

/**
 * Puts packets back together. `accept(message, now)` takes one event message and the caller's own tick (or any
 * counter); it returns `{ state, text, packets }` for a whole state (legacy or the last packet), `{ partial: true }`
 * while packets are missing, or `{ error }` for a bad packet. At most `maxPending` states wait at once (the oldest
 * is dropped) and a state older than `timeout` ticks is dropped: `counters()` reports `{ expired, dropped, errors }`.
 * @param {{ maxPending?: number, timeout?: number }} [options]
 */
export function createStateReassembler(options = {}) {
  const maxPending = Math.min(MAX_PENDING, Math.max(1, options.maxPending ?? MAX_PENDING));
  const timeout = options.timeout ?? 200;
  /** @type {Map<string, { total: number, parts: (string | undefined)[], got: number, at: number }>} */
  const pending = new Map();
  const counters = { expired: 0, dropped: 0, errors: 0 };
  const fail = (/** @type {string} */ error) => (counters.errors++, { error });
  return {
    pending: () => pending.size,
    counters: () => ({ ...counters }),
    /** Drops what is older than the timeout. @param {number} now */
    expire(now) {
      for (const [key, entry] of pending)
        if (now - entry.at > timeout) {
          pending.delete(key);
          counters.expired++;
        }
    },
    /** @param {string} message @param {number} [now] */
    accept(message, now = 0) {
      this.expire(now);
      let data;
      try {
        data = JSON.parse(message);
      } catch {
        return fail("not JSON");
      }
      const c = data && typeof data === "object" ? data.chunk : undefined;
      if (!c) return { state: data, text: message, packets: 1 };
      if (data.channel !== "state" || data.v !== CHUNK_VERSION) return fail("unknown channel or version");
      const key = `${data.player ?? ""}:${c.id}`;
      if (!Number.isInteger(c.total) || c.total < 1 || c.total > MAX_PACKETS || !Number.isInteger(c.index) || c.index < 0 || c.index >= c.total || typeof c.text !== "string" || c.text.length === 0)
        return fail("bad chunk");
      let entry = pending.get(key);
      if (entry && entry.total !== c.total) {
        pending.delete(key);
        return fail("total changed");
      }
      if (!entry) {
        if (pending.size >= maxPending) {
          pending.delete(/** @type {string} */ (pending.keys().next().value));
          counters.dropped++;
        }
        entry = { total: c.total, parts: new Array(c.total), got: 0, at: now };
        pending.set(key, entry);
      }
      if (entry.parts[c.index] !== undefined) {
        pending.delete(key);
        return fail("duplicate chunk");
      }
      entry.parts[c.index] = c.text;
      if (++entry.got < entry.total) return { partial: true };
      pending.delete(key);
      const text = entry.parts.join("");
      try {
        return { state: JSON.parse(text), text, packets: entry.total };
      } catch {
        return fail("reassembled state is not JSON");
      }
    },
  };
}
