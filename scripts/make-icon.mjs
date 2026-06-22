// Generates a 1024x1024 source PNG (assets/icon.png) for the app icon.
// Run `npm run tauri icon assets/icon.png` afterwards to produce the full
// platform icon set in src-tauri/icons. Pure Node, no dependencies.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 1024;

// palette
const ground = [21, 24, 29]; // #15181d
const pine = [79, 138, 107]; // #4f8a6b
const ember = [224, 145, 63]; // #e0913f

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const px = Buffer.alloc(SIZE * SIZE * 4);
const cx = SIZE / 2;
const cy = SIZE / 2;
const r = SIZE * 0.42;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // rounded background
    let color = ground;
    let a = 255;
    if (dist <= r) {
      // subtle vertical gradient pine
      const t = y / SIZE;
      color = lerp(pine, [44, 77, 58], t);
      // clock-style ember hands: two thick lines from center
      const ang = Math.atan2(dy, dx);
      const handA = Math.abs(angDiff(ang, -Math.PI / 2)) < 0.08 && dist < r * 0.7; // 12 o'clock
      const handB = Math.abs(angDiff(ang, 0)) < 0.08 && dist < r * 0.55; // 3 o'clock
      const hub = dist < r * 0.07;
      if (handA || handB || hub) color = ember;
    } else if (dist <= r + 6) {
      // antialias edge
      const t = (dist - r) / 6;
      color = lerp(pine, ground, t);
    } else {
      a = 0; // transparent outside
    }
    px[i] = Math.round(color[0]);
    px[i + 1] = Math.round(color[1]);
    px[i + 2] = Math.round(color[2]);
    px[i + 3] = a;
  }
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Build PNG
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// raw with filter byte per scanline
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/icon.png", png);
console.log("Wrote assets/icon.png (1024x1024)");
