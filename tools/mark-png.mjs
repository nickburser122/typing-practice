import zlib from "node:zlib";

const TILE = [3, 3, 58, 58, 14];
const BAR = [20, 41, 24, 7, 3.5];
const TILE_RGB = [0xB0, 0x45, 0x2B];
const BAR_RGB = [255, 255, 255];
const SUB = 4;

function inRound(px, py, r) {
  const [x, y, w, h, rad] = r;
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = px < x + rad ? x + rad : px > x + w - rad ? x + w - rad : px;
  const cy = py < y + rad ? y + rad : py > y + h - rad ? y + h - rad : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= rad * rad;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function markPng(size) {
  const scale = 64 / size;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const base = y * (size * 4 + 1);
    rows[base] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const px = (x + (sx + 0.5) / SUB) * scale;
          const py = (y + (sy + 0.5) / SUB) * scale;
          const rgb = inRound(px, py, BAR) ? BAR_RGB : inRound(px, py, TILE) ? TILE_RGB : null;
          if (rgb) {
            r += rgb[0];
            g += rgb[1];
            b += rgb[2];
            a += 1;
          }
        }
      }
      const o = base + 1 + x * 4;
      if (a > 0) {
        rows[o] = Math.round(r / a);
        rows[o + 1] = Math.round(g / a);
        rows[o + 2] = Math.round(b / a);
      }
      rows[o + 3] = Math.round((a / (SUB * SUB)) * 255);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export { markPng };
