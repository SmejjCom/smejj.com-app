import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

const html = fs.readFileSync("public/index.html", "utf8");
const css = fs.readFileSync("public/branding.css", "utf8");
const appCss = fs.readFileSync("public/styles.css", "utf8");
const officialIcon = fs.readFileSync("public/icons/smejj_icon.svg", "utf8");
const officialFullLogo = fs.readFileSync("public/icons/smejj_full_logo.svg", "utf8");
const faviconSvg = fs.readFileSync("public/icons/smejj_favicon.svg", "utf8");
const onDarkLogo = fs.readFileSync("public/icons/smejj_full_logo_on_dark.svg", "utf8");

test("official geometry stays unchanged in transparent and on-dark derivatives", () => {
  assert.deepEqual(pathGeometry(faviconSvg), pathGeometry(officialIcon));
  assert.deepEqual(circleGeometry(faviconSvg), circleGeometry(officialIcon));
  assert.equal(onDarkLogo.replaceAll('fill="#f7f7f4"', 'fill="#050910"'), officialFullLogo);
  assert.match(faviconSvg, /viewBox="0 0 2000 2000"/);
  assert.match(faviconSvg, /translate\(233\.8325 233\.8325\) scale\(0\.7661675 1\)/);
  assert.doesNotMatch(faviconSvg, /<(?:rect|image)\b|\bstyle=|\bfilter=|\bmask=/i);
  assert.doesNotMatch(onDarkLogo, /<(?:rect|image)\b|\bstyle=|\bfilter=|\bmask=/i);
});

test("menu branding is optically compact, transparent and layout-independent", () => {
  const base = cssBlock(css, ".app-brand-logo");
  const expanded = cssBlock(css, 'body[data-left-menu-state="expanded"] .app-brand-logo');
  assert.match(base, /--app-brand-expanded-width:\s*80px/);
  assert.match(base, /--app-brand-expanded-height:\s*28px/);
  assert.match(base, /position:\s*fixed/);
  assert.match(base, /top:\s*calc\(env\(safe-area-inset-top\) \+ 0px\)/);
  assert.match(base, /left:\s*calc\(env\(safe-area-inset-left\) \+ 36px\)/);
  assert.match(base, /width:\s*28px/);
  assert.match(base, /height:\s*28px/);
  assert.match(base, /overflow:\s*visible/);
  assert.match(base, /border-radius:\s*0/);
  assert.match(base, /background:\s*transparent/);
  assert.match(base, /box-shadow:\s*none/);
  assert.match(cssBlock(css, ".app-brand-icon"), /width:\s*16px[\s\S]*height:\s*16px/);
  assert.match(cssBlock(css, ".app-brand-wordmark"), /height:\s*auto[\s\S]*max-height:\s*19px/);
  assert.match(expanded, /calc\(var\(--left-panel-width\) - 52px\)/);
  assert.match(expanded, /padding:\s*0/);
  assert.match(expanded, /background:\s*transparent/);
  assert.match(expanded, /box-shadow:\s*none/);
  assert.doesNotMatch(expanded, /rgba\(|#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(css, /\b(?:filter|mask|transform|transition)\s*:/i);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*--app-brand-expanded-width:\s*76px/);
  assert.match(cssBlock(css, ".sidebar"), /border-right:\s*0/);
  assert.match(cssBlock(appCss, ".panel-resizer::before"), /width:\s*1px/);
  assert.match(html, /class="app-brand-icon"[^>]*\/icons\/smejj_icon\.svg/);
  assert.match(html, /class="app-brand-wordmark"[^>]*\/icons\/smejj_full_logo_on_dark\.svg/);
  assert.match(html, /href="\/icons\/smejj_favicon\.svg\?v=112" type="image\/svg\+xml"/);
});

test("closed, compact, opening and expanded states never expose a stale wordmark", async () => {
  const sidebar = createSidebar();
  const timeouts = [];
  globalThis.document = {
    body: { dataset: {} },
    querySelector(selector) {
      return selector === ".sidebar" ? sidebar : null;
    }
  };
  globalThis.window = {
    setTimeout(callback) {
      timeouts.push(callback);
      return timeouts.length;
    }
  };
  const { applyPanelCompact, syncLeftMenuState } = await import(`../public/left-menu-state.js?branding=${Date.now()}`);

  syncLeftMenuState();
  assert.equal(document.body.dataset.leftMenuState, "closed");

  sidebar.classList.add("is-open", "is-compact");
  syncLeftMenuState();
  assert.equal(document.body.dataset.leftMenuState, "compact");

  sidebar.classList.remove("is-compact");
  syncLeftMenuState({ waitForOpenTransition: true });
  assert.equal(document.body.dataset.leftMenuState, "opening");
  const staleFinish = sidebar.listeners.at(-1);
  sidebar.classList.remove("is-open");
  syncLeftMenuState();
  assert.equal(document.body.dataset.leftMenuState, "closed");
  staleFinish({ propertyName: "transform" });
  assert.equal(document.body.dataset.leftMenuState, "closed");

  sidebar.classList.add("is-open");
  syncLeftMenuState({ waitForOpenTransition: true });
  assert.equal(document.body.dataset.leftMenuState, "opening");
  sidebar.listeners.at(-1)({ propertyName: "opacity" });
  assert.equal(document.body.dataset.leftMenuState, "opening");
  timeouts.at(-1)();
  assert.equal(document.body.dataset.leftMenuState, "expanded");

  applyPanelCompact("left", 187, 187);
  assert.equal(document.body.dataset.leftMenuState, "compact");
  applyPanelCompact("left", 188, 187);
  assert.equal(document.body.dataset.leftMenuState, "expanded");
});

test("browser favicons optically fill the maximum transparent square canvas", () => {
  const expected = new Map([
    ["public/icons/favicon-16x16.png", { size: 16, bounds: [0, 0, 16, 16] }],
    ["public/icons/favicon-32x32.png", { size: 32, bounds: [0, 0, 32, 32] }],
    ["public/icons/favicon-48x48.png", { size: 48, bounds: [0, 0, 48, 48] }]
  ]);
  for (const [file, contract] of expected) {
    const png = decodePng(fs.readFileSync(file));
    assert.deepEqual([png.width, png.height], [contract.size, contract.size], file);
    assert.deepEqual(pixel(png, 0, 0), [0, 0, 0, 0], `${file} corner must remain transparent`);
    assert.deepEqual(bounds(png, ([, , , alpha]) => alpha > 0), contract.bounds, file);
  }

  const ico = fs.readFileSync("public/favicon.ico");
  assert.equal(ico.readUInt16LE(4), 3);
  for (let index = 0; index < 3; index += 1) {
    const entry = 6 + index * 16;
    const size = ico[entry] || 256;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const embedded = decodePng(ico.subarray(offset, offset + length));
    assert.deepEqual([embedded.width, embedded.height], [size, size]);
    assert.deepEqual(pixel(embedded, 0, 0), [0, 0, 0, 0]);
    assert.deepEqual(bounds(embedded, ([, , , alpha]) => alpha > 0), [0, 0, size, size]);
  }
});

test("Apple, PWA, maskable and social assets use platform-safe visual mass", () => {
  const darkBackground = [5, 9, 16, 255];
  const iconContracts = new Map([
    ["public/apple-touch-icon.png", [180, 148]],
    ["public/icons/pwa-192x192.png", [192, 158]],
    ["public/icons/pwa-512x512.png", [512, 418]],
    ["public/icons/maskable-192x192.png", [192, 118]],
    ["public/icons/maskable-512x512.png", [512, 314]]
  ]);
  for (const [file, [size, expectedWidth]] of iconContracts) {
    const png = decodePng(fs.readFileSync(file));
    assert.deepEqual([png.width, png.height], [size, size], file);
    assert.deepEqual(pixel(png, 0, 0), darkBackground, `${file} must have an opaque controlled background`);
    const mark = bounds(png, (rgba) => colorDistance(rgba, darkBackground) > 8);
    assert.equal(mark[2] - mark[0], expectedWidth, file);
  }

  const social = decodePng(fs.readFileSync("public/og-image.png"));
  const socialBackground = [247, 247, 244, 255];
  assert.deepEqual([social.width, social.height], [1200, 630]);
  assert.deepEqual(pixel(social, 0, 0), socialBackground);
  const logoBounds = bounds(social, (rgba) => colorDistance(rgba, socialBackground) > 8);
  assert.ok(logoBounds[2] - logoBounds[0] >= 656 && logoBounds[2] - logoBounds[0] <= 662);
});

test("all derivatives are byte-reproducible", () => {
  const result = spawnSync(process.execPath, ["scripts/branding/generate-brand-assets.mjs", "--check"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /check:branding OK/);
});

function pathGeometry(svg) {
  return [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map((match) => match[1]);
}

function circleGeometry(svg) {
  return [...svg.matchAll(/<circle\s+cx="([^"]+)"\s+cy="([^"]+)"\s+r="([^"]+)"/g)]
    .map((match) => match.slice(1));
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing CSS block ${selector}`);
  return match[1];
}

function createSidebar() {
  const values = new Set();
  return {
    listeners: [],
    classList: {
      contains(name) {
        return values.has(name);
      },
      add(...names) {
        names.forEach((name) => values.add(name));
      },
      remove(...names) {
        names.forEach((name) => values.delete(name));
      },
      toggle(name, force) {
        if (force) values.add(name);
        else values.delete(name);
        return Boolean(force);
      }
    },
    addEventListener(type, listener) {
      if (type === "transitionend") this.listeners.push(listener);
    }
  };
}

function decodePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let cursor = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  while (cursor < bytes.length) {
    const length = bytes.readUInt32BE(cursor);
    const type = bytes.toString("ascii", cursor + 4, cursor + 8);
    const data = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    cursor += length + 12;
  }
  assert.equal(bitDepth, 8);
  assert.equal(interlace, 0);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(channels > 0, `unsupported PNG color type ${colorType}`);
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[sourceOffset + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      pixels[y * stride + x] = (raw + filterValue(filter, left, up, upLeft)) & 255;
    }
    sourceOffset += stride;
  }
  return { width, height, channels, pixels };
}

function filterValue(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`unsupported PNG filter ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  return upDistance <= diagonalDistance ? up : upLeft;
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * image.channels;
  const rgb = [...image.pixels.subarray(offset, offset + 3)];
  return [...rgb, image.channels === 4 ? image.pixels[offset + 3] : 255];
}

function bounds(image, predicate) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!predicate(pixel(image, x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert.ok(maxX >= minX && maxY >= minY, "expected non-empty pixel bounds");
  return [minX, minY, maxX + 1, maxY + 1];
}

function colorDistance(left, right) {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
    Math.abs(left[3] - right[3])
  );
}
