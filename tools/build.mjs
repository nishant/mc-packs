// Zips every folder in packs/ into dist/<folder>.mcpack (no dependencies).
// Double-click / open the .mcpack on any device with Minecraft to import it.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const packsDir = join(root, "packs");
const distDir = join(root, "dist");

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Minimal ZIP writer (deflate, no zip64 — packs are tiny). @param {{name: string, data: Buffer}[]} files */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

mkdirSync(distDir, { recursive: true });
for (const pack of readdirSync(packsDir)) {
  const packDir = join(packsDir, pack);
  if (!statSync(packDir).isDirectory()) continue;
  const manifest = JSON.parse(readFileSync(join(packDir, "manifest.json"), "utf8"));
  const files = walk(packDir).map((p) => ({
    name: relative(packDir, p).split(sep).join("/"),
    data: readFileSync(p),
  }));
  const out = join(distDir, `${pack}.mcpack`);
  writeFileSync(out, zip(files));
  console.log(`${relative(root, out)}  v${manifest.header.version.join(".")}  (${files.length} files)`);
}
