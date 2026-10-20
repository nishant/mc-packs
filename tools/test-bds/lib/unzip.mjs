// Minimal ZIP reader for .mcpack files (stored and deflate entries, no zip64, no encryption). Pairs with tools/lib/zip.mjs.
import fs from "node:fs";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";

/** The files of a zip as { name, data }. Rejects names that escape the archive and entries whose CRC does not match. @param {Buffer} buf */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), packed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new Error(`${name}: encrypted zip entries are not supported`);
    if (/(^|\/)\.\.(\/|$)|^\/|^[A-Za-z]:|\\/.test(name)) throw new Error(`unsafe path in the zip: ${name}`);
    if (name.endsWith("/")) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: corrupt local header`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + packed);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`${name}: unsupported compression method ${method}`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);
    out.push({ name, data });
  }
  return out;
}

/** Extracts a zip file into dest (created if needed). Returns the entry names. */
export function extractZip(file, dest) {
  const entries = readZip(fs.readFileSync(file));
  for (const { name, data } of entries) {
    const to = path.join(dest, ...name.split("/"));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, data);
  }
  return entries.map((e) => e.name);
}
