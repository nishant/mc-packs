// Minimal RGBA PNG reader and writer (8-bit, non-interlaced), so the rain textures need no dependencies.
import { deflateSync, inflateSync, crc32 } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @typedef {{ width: number, height: number, data: Uint8Array }} Image RGBA, row-major */

/** @param {number} width @param {number} height @returns {Image} a fully transparent image */
export function blank(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** @param {Buffer} buf @returns {Image} */
export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, colorType = -1;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
      if (body[8] !== 8 || colorType !== 6 || body[12] !== 0) throw new Error("only 8-bit RGBA non-interlaced PNGs are supported");
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4, data = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride), i = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const line = new Uint8Array(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      if (filter === 1) line[x] += a;
      else if (filter === 2) line[x] += b;
      else if (filter === 3) line[x] += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    data.set(line, y * stride);
    prev = line;
  }
  return { width, height, data };
}

/** @param {string} type @param {Buffer} body */
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** @param {Image} img @returns {Buffer} */
export function encode(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = img.width * 4, raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none (the images are tiny)
    raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** True when two images have the same size and pixels (compressed bytes may differ between zlib versions). */
export function samePixels(/** @type {Image} */ a, /** @type {Image} */ b) {
  return a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
}
