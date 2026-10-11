// Minimal little-endian NBT reader/writer for Bedrock level.dat.
// Values are kept as {type, value} so a round trip preserves every tag type.
// level.dat = int32 storage version + int32 payload length + root compound.

export const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

class Reader {
  constructor(buf) { this.b = buf; this.o = 0; }
  u8() { return this.b.readUInt8(this.o++); }
  i8() { return this.b.readInt8(this.o++); }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.o); this.o += 8; return v; }
  str() { const n = this.u16(); const s = this.b.toString("utf8", this.o, this.o + n); this.o += n; return s; }
  payload(type) {
    switch (type) {
      case T.BYTE: return this.i8();
      case T.SHORT: return this.i16();
      case T.INT: return this.i32();
      case T.LONG: return this.i64();
      case T.FLOAT: return this.f32();
      case T.DOUBLE: return this.f64();
      case T.BYTE_ARRAY: { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.i8()); return a; }
      case T.STRING: return this.str();
      case T.LIST: {
        const et = this.u8(); const n = this.i32(); const items = [];
        for (let i = 0; i < n; i++) items.push(this.payload(et));
        return { elementType: et, items };
      }
      case T.COMPOUND: {
        const out = {};
        for (;;) {
          const t = this.u8();
          if (t === T.END) break;
          const name = this.str();
          out[name] = { type: t, value: this.payload(t) };
        }
        return out;
      }
      case T.INT_ARRAY: { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.i32()); return a; }
      case T.LONG_ARRAY: { const n = this.i32(); const a = []; for (let i = 0; i < n; i++) a.push(this.i64()); return a; }
      default: throw new Error(`unknown NBT tag ${type} at ${this.o}`);
    }
  }
}

class Writer {
  constructor() { this.parts = []; }
  push(b) { this.parts.push(b); }
  u8(v) { const b = Buffer.alloc(1); b.writeUInt8(v); this.push(b); }
  i8(v) { const b = Buffer.alloc(1); b.writeInt8(v); this.push(b); }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v); this.push(b); }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); this.push(b); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); this.push(b); }
  i64(v) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); this.push(b); }
  f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); this.push(b); }
  f64(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v); this.push(b); }
  str(s) { const b = Buffer.from(s, "utf8"); this.u16(b.length); this.push(b); }
  payload(type, v) {
    switch (type) {
      case T.BYTE: return this.i8(v);
      case T.SHORT: return this.i16(v);
      case T.INT: return this.i32(v);
      case T.LONG: return this.i64(v);
      case T.FLOAT: return this.f32(v);
      case T.DOUBLE: return this.f64(v);
      case T.BYTE_ARRAY: this.i32(v.length); for (const x of v) this.i8(x); return;
      case T.STRING: return this.str(v);
      case T.LIST: this.u8(v.elementType); this.i32(v.items.length); for (const x of v.items) this.payload(v.elementType, x); return;
      case T.COMPOUND:
        for (const [name, tag] of Object.entries(v)) { this.u8(tag.type); this.str(name); this.payload(tag.type, tag.value); }
        this.u8(T.END); return;
      case T.INT_ARRAY: this.i32(v.length); for (const x of v) this.i32(x); return;
      case T.LONG_ARRAY: this.i32(v.length); for (const x of v) this.i64(x); return;
      default: throw new Error(`unknown NBT tag ${type}`);
    }
  }
  buffer() { return Buffer.concat(this.parts); }
}

/** Parse a Bedrock level.dat buffer. Returns { version, rootName, root }. */
export function readLevelDat(buf) {
  const version = buf.readInt32LE(0);
  const r = new Reader(buf.subarray(8));
  const t = r.u8();
  if (t !== T.COMPOUND) throw new Error("level.dat root is not a compound");
  const rootName = r.str();
  const root = r.payload(T.COMPOUND);
  return { version, rootName, root };
}

/** Serialize back to a level.dat buffer (header recomputed). */
export function writeLevelDat({ version, rootName, root }) {
  const w = new Writer();
  w.u8(T.COMPOUND); w.str(rootName ?? ""); w.payload(T.COMPOUND, root);
  const body = w.buffer();
  const head = Buffer.alloc(8);
  head.writeInt32LE(version, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
