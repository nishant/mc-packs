import assert from "node:assert/strict";
import test from "node:test";
import { createStatePacketizer, createStateReassembler, MAX_EVENT_BYTES, MAX_PACKETS, MAX_PENDING, MAX_SOURCE_BYTES, MAX_TEXT_BYTES, utf8Length } from "../packs/map_bp/scripts/map-debug-state.js";

const U = (s) => Buffer.byteLength(s, "utf8");
const parse = (m) => JSON.parse(m);
/** A realistic full state: a 3299 byte UTF-8 radar made of 3-byte Private Use glyphs, plus a strip and terrain. */
const bigState = (radarChars = 1100) => ({ player: "p-1", strip: "N\uF301".repeat(20), radar: "\uF310".repeat(radarChars), terrain: { store: "s", samples: [] }, quote: 'say "hi"\\' });

test("a state that fits goes out as ONE legacy whole message, unchanged", () => {
    const json = JSON.stringify({ player: "p", tick: 1 });
    assert.deepEqual(createStatePacketizer()(json, "p"), [json]);
});

test("the legacy cutoff is 2047 UTF-8 bytes, counted in bytes not characters", () => {
    const pack = createStatePacketizer();
    const fits = JSON.stringify({ t: "a".repeat(MAX_EVENT_BYTES - 8) });
    assert.equal(U(fits), MAX_EVENT_BYTES);
    assert.deepEqual(pack(fits, "p"), [fits]);
    const wide = JSON.stringify({ t: "\uF301".repeat(700) }); // 700 characters, 2100+ bytes
    assert.ok(wide.length < 2048 && U(wide) > MAX_EVENT_BYTES);
    assert.ok(pack(wide, "p").length > 1);
});

test("a 33-radar (3299 byte) state round-trips through packets and the reassembler", () => {
    const state = bigState(1100);
    const json = JSON.stringify(state);
    assert.ok(U(json) >= 3299);
    const messages = createStatePacketizer()(json, state.player);
    assert.ok(messages.length > 1 && messages.length <= MAX_PACKETS);
    const rebuild = createStateReassembler();
    let last;
    for (const m of messages) last = rebuild.accept(m, 0);
    assert.deepEqual(last.state, state);
    assert.equal(last.text, json);
    assert.equal(last.packets, messages.length);
    assert.equal(rebuild.pending(), 0);
});

test("every packet obeys the byte limits, escaping included, with ordered indexes and one id", () => {
    const state = { player: "p", text: '"'.repeat(2500) + '\\\n\t'.repeat(300) + "\u0001".repeat(100) }; // quoting the JSON again doubles every quote and backslash
    const messages = createStatePacketizer()(JSON.stringify(state), "p");
    const ids = new Set();
    messages.forEach((m, i) => {
        const data = parse(m);
        assert.ok(U(m) <= MAX_EVENT_BYTES, `packet ${i} is ${U(m)} bytes`);
        assert.ok(U(data.chunk.text) <= MAX_TEXT_BYTES);
        assert.equal(data.channel, "state");
        assert.equal(data.v, 1);
        assert.equal(data.player, "p");
        assert.equal(data.chunk.index, i);
        assert.equal(data.chunk.total, messages.length);
        ids.add(data.chunk.id);
    });
    assert.equal(ids.size, 1);
    const rebuild = createStateReassembler();
    let last;
    for (const m of messages) last = rebuild.accept(m, 0);
    assert.deepEqual(last.state, state);
});

test("non-BMP characters and escaped text are never split inside a character", () => {
    const state = { player: "p", text: "\u{1F600}".repeat(600) + "\u00E9\u20AC".repeat(300) };
    const messages = createStatePacketizer()(JSON.stringify(state), "p");
    const pieces = messages.map((m) => parse(m).chunk.text);
    for (const piece of pieces) {
        assert.doesNotMatch(piece, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u, "no lone high surrogate");
        assert.doesNotMatch(piece, /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u, "no lone low surrogate");
        assert.ok(U(piece) <= MAX_TEXT_BYTES);
    }
    assert.equal(pieces.join(""), JSON.stringify(state));
    // No slice ends inside a JSON escape: each piece of an escape-heavy state keeps its backslashes whole.
    const heavy = { player: "p", text: '\\"'.repeat(1500) };
    const heavyPieces = createStatePacketizer()(JSON.stringify(heavy), "p").map((m) => parse(m).chunk.text);
    assert.equal(heavyPieces.join(""), JSON.stringify(heavy));
    const rebuild = createStateReassembler();
    let last;
    for (const m of createStatePacketizer()(JSON.stringify(state), "p")) last = rebuild.accept(m, 0);
    assert.deepEqual(last.state, state);
});

test("packet ids are unique across states and local to each packetizer", () => {
    const pack = createStatePacketizer();
    const json = JSON.stringify(bigState());
    const idOf = (messages) => parse(messages[0]).chunk.id;
    const a = idOf(pack(json, "p"));
    const b = idOf(pack(json, "p"));
    assert.notEqual(a, b);
    assert.equal(idOf(createStatePacketizer()(json, "p")), a, "a fresh packetizer starts its own counter (no clock or secret)");
});

test("out-of-order packets still reassemble; duplicates and a changed total are rejected", () => {
    const state = bigState(1800);
    const messages = createStatePacketizer()(JSON.stringify(state), "p");
    assert.ok(messages.length >= 3);
    const rebuild = createStateReassembler();
    let last;
    for (const m of [...messages].reverse()) last = rebuild.accept(m, 0);
    assert.deepEqual(last.state, state);
    const again = createStateReassembler();
    assert.deepEqual(again.accept(messages[0], 0), { partial: true });
    assert.equal(again.accept(messages[0], 0).error, "duplicate chunk");
    assert.equal(again.pending(), 0);
    const lie = parse(messages[1]);
    lie.chunk.total += 1;
    const other = createStateReassembler();
    other.accept(messages[0], 0);
    assert.equal(other.accept(JSON.stringify(lie), 0).error, "total changed");
});

test("the packet cap and the source cap fail clearly", () => {
    const pack = createStatePacketizer();
    const over = JSON.stringify({ player: "p", text: "x".repeat(MAX_PACKETS * MAX_TEXT_BYTES) });
    assert.throws(() => pack(over, "p"), /packet/);
    const huge = JSON.stringify({ player: "p", text: "x".repeat(MAX_SOURCE_BYTES) });
    assert.throws(() => pack(huge, "p"), /byte debug limit/);
    const edge = JSON.stringify({ player: "p", text: "x".repeat(10000) });
    assert.ok(pack(edge, "p").length <= MAX_PACKETS);
});

test("the protocol shape is fixed: legacy whole, or channel state v1 chunk {id,index,total,text}", () => {
    const messages = createStatePacketizer()(JSON.stringify(bigState()), "p-1");
    const data = parse(messages[0]);
    assert.deepEqual(Object.keys(data), ["player", "channel", "v", "chunk"]);
    assert.deepEqual(Object.keys(data.chunk), ["id", "index", "total", "text"]);
    const rebuild = createStateReassembler();
    assert.deepEqual(rebuild.accept('{"player":"p","tick":3}', 0), { state: { player: "p", tick: 3 }, text: '{"player":"p","tick":3}', packets: 1 });
    assert.equal(rebuild.accept(JSON.stringify({ ...data, v: 2 }), 0).error, "unknown channel or version");
    assert.equal(rebuild.accept("{nope", 0).error, "not JSON");
});

test("the packetizer never mutates its inputs or the state", () => {
    const state = bigState();
    const json = JSON.stringify(state);
    const before = JSON.stringify(state);
    createStatePacketizer()(json, state.player);
    assert.equal(JSON.stringify(state), before);
    assert.ok(createStatePacketizer()(json, state.player).length > 1);
    assert.equal(json, before);
});

test("the reassembler holds at most 16 pending states and drops the oldest", () => {
    const rebuild = createStateReassembler({ maxPending: 99 });
    const pack = createStatePacketizer();
    const firsts = [];
    for (let i = 0; i < MAX_PENDING + 4; i++) firsts.push(pack(JSON.stringify({ player: "p" + i, text: "x".repeat(3000) }), "p" + i)[0]);
    for (const m of firsts) rebuild.accept(m, 0);
    assert.equal(rebuild.pending(), MAX_PENDING);
    assert.equal(rebuild.counters().dropped, 4);
});

test("a state waiting longer than the timeout is dropped (the caller's tick counter, no clock)", () => {
    const rebuild = createStateReassembler({ timeout: 100 });
    const messages = createStatePacketizer()(JSON.stringify(bigState()), "p");
    rebuild.accept(messages[0], 10);
    rebuild.expire(110);
    assert.equal(rebuild.pending(), 1);
    rebuild.expire(111);
    assert.equal(rebuild.pending(), 0);
    assert.equal(rebuild.counters().expired, 1);
    // the late rest cannot complete a dropped state
    let last;
    for (const m of messages.slice(1)) last = rebuild.accept(m, 112);
    assert.ok(last.partial);
});

test("utf8Length agrees with Buffer.byteLength", () => {
    for (const s of ["", "abc", "\u00E9", "\u20AC", "\u{1F600}", "\uF301x"]) assert.equal(utf8Length(s), U(s));
});
