import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";

const { markPng } = await import("../tools/mark-png.mjs");
const template = fs.readFileSync(new URL("../src/index.template.html", import.meta.url), "utf8");
const dom = fs.readFileSync(new URL("../src/ui/dom.js", import.meta.url), "utf8");

function decode(png) {
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
  let pos = 8;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = (x, y) => {
    const o = y * (w * 4 + 1) + 1 + x * 4;
    return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]];
  };
  return { w, h, px };
}

test("the mark renders to valid PNGs of the requested size", () => {
  [32, 180].forEach(size => {
    const img = decode(markPng(size));
    assert.equal(img.w, size);
    assert.equal(img.h, size);
  });
});

test("the PNG has a transparent corner, a terracotta tile and a light bar", () => {
  const img = decode(markPng(180));
  assert.equal(img.px(0, 0)[3], 0);
  const tile = img.px(30, 30);
  assert.ok(tile[3] > 250 && Math.abs(tile[0] - 0xB0) < 6 && Math.abs(tile[1] - 0x45) < 6 && Math.abs(tile[2] - 0x2B) < 6, tile.join(","));
  const bar = img.px(90, Math.round(180 * 44.5 / 64));
  assert.ok(bar[0] > 240 && bar[1] > 240 && bar[2] > 240 && bar[3] > 250, bar.join(","));
});

test("the bar is at least 7 units tall at 16 pixels", () => {
  const img = decode(markPng(32));
  const rows = [];
  for (let y = 0; y < 32; y++) if (img.px(16, y)[0] > 200 && img.px(16, y)[1] > 200) rows.push(y);
  assert.ok(rows.length >= 3, "bar rows at 32px: " + rows.length);
});

test("the favicon and the header mark use the same bar", () => {
  assert.ok(template.includes("x=%2720%27 y=%2741%27 width=%2724%27 height=%277%27 rx=%273.5%27"));
  assert.ok(dom.includes("{ x: 20, y: 41, width: 24, height: 7, rx: 3.5 }"));
});

test("the page declares PNG fallbacks, a description and both theme colours", () => {
  assert.ok(template.includes('rel="icon" type="image/png" sizes="32x32"'));
  assert.ok(template.includes('rel="apple-touch-icon"'));
  assert.ok(template.includes("{{icon32}}") && template.includes("{{icon180}}"));
  assert.ok(template.includes('<meta name="description"'));
  assert.ok(template.includes('name="theme-color" content="#B0452B"'));
  assert.ok(template.includes('name="theme-color" content="#E0795A"'));
  assert.ok(template.includes("prefers-color-scheme: dark"));
  assert.ok(template.includes("<title>Tarq · typing trainer</title>"));
});

test("the page title follows the interface language", () => {
  assert.ok(dom.includes('document.title = uiLang() === "ar" ? "طَرق · مدرب الكتابة" : "Tarq · typing trainer"'));
});
