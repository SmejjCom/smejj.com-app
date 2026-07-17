#!/usr/bin/env node
// Reproducible smejj.com brand derivatives. Official SVG geometry is never
// redrawn: every output embeds the approved source paths unchanged.

import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const checkOnly = process.argv.includes("--check");
const colors = Object.freeze({
  cyan: "#02fdfd",
  dark: "#050910",
  light: "#f7f7f4"
});

const iconPath = path.join(root, "public/icons/smejj_icon.svg");
const fullLogoPath = path.join(root, "public/icons/smejj_full_logo.svg");
const iconSvg = readFileSync(iconPath, "utf8");
const fullLogoSvg = readFileSync(fullLogoPath, "utf8");
const iconInner = svgInner(iconSvg, "smejj_icon.svg");
const fullLogoInner = svgInner(fullLogoSvg, "smejj_full_logo.svg");

assertSourceContract();

const outputs = new Map();
outputs.set("public/icons/smejj_full_logo_on_dark.svg", Buffer.from(onDarkLogo(), "utf8"));
outputs.set("public/icons/smejj_favicon.svg", Buffer.from(paddedFavicon(), "utf8"));

const faviconSpecs = [16, 32, 48];
const faviconPngs = faviconSpecs.map((size) => {
  const png = opticalSquareFavicon(size);
  outputs.set(`public/icons/favicon-${size}x${size}.png`, png);
  return { size, png };
});

outputs.set("public/favicon.ico", buildIco(faviconPngs));
outputs.set("public/apple-touch-icon.png", squareIcon({ size: 180, markWidth: 148, background: colors.dark }));
outputs.set("public/icons/pwa-192x192.png", squareIcon({ size: 192, markWidth: 158, background: colors.dark }));
outputs.set("public/icons/pwa-512x512.png", squareIcon({ size: 512, markWidth: 420, background: colors.dark }));
outputs.set("public/icons/maskable-192x192.png", squareIcon({ size: 192, markWidth: 118, background: colors.dark }));
outputs.set("public/icons/maskable-512x512.png", squareIcon({ size: 512, markWidth: 314, background: colors.dark }));
outputs.set("public/og-image.png", socialCard());

const stale = [];
for (const [relativePath, expected] of outputs) {
  const absolutePath = path.join(root, relativePath);
  if (checkOnly) {
    if (!existsSync(absolutePath) || !readFileSync(absolutePath).equals(expected)) stale.push(relativePath);
    continue;
  }
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, expected);
}

if (stale.length > 0) {
  console.error(`check:branding FAILED — regenerate: ${stale.join(", ")}`);
  process.exit(1);
}

console.log(checkOnly
  ? `check:branding OK — ${outputs.size} assets are byte-identical to their approved sources.`
  : `brand:generate OK — ${outputs.size} assets generated from the approved smejj.com SVG geometry.`);

function assertSourceContract() {
  if (!iconSvg.includes('viewBox="0 0 2000 1532.335"')) throw new Error("official icon viewBox changed");
  if (!fullLogoSvg.includes('viewBox="0 0 2920.43 659.983"')) throw new Error("official full-logo viewBox changed");
  if ((fullLogoSvg.match(/fill="#050910"/g) || []).length !== 5) throw new Error("official wordmark color contract changed");
  for (const [name, source] of [["icon", iconSvg], ["full logo", fullLogoSvg]]) {
    if (/<(?:rect|image)\b|\bstyle=/i.test(source)) throw new Error(`official ${name} must remain background-free`);
  }
}

function svgInner(source, label) {
  const withoutDeclaration = source.replace(/^\uFEFF?<\?xml[^>]*>\s*/i, "").trim();
  const match = withoutDeclaration.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/i);
  if (!match) throw new Error(`cannot read ${label}`);
  return match[1].trim();
}

function onDarkLogo() {
  return ensureNewline(fullLogoSvg.replaceAll(`fill="${colors.dark}"`, `fill="${colors.light}"`));
}

function paddedFavicon() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000">
  <g transform="translate(233.8325 233.8325) scale(0.7661675 1)">
${indent(iconInner, 4)}
  </g>
</svg>
`;
}

function opticalSquareFavicon(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <svg width="${size}" height="${size}" viewBox="0 0 2000 1532.335" preserveAspectRatio="none">
${indent(iconInner, 4)}
  </svg>
</svg>`;
  return render(svg, size);
}

function squareIcon({ size, markWidth, background }) {
  const markHeight = markWidth * 1532.335 / 2000;
  const x = (size - markWidth) / 2;
  const y = (size - markHeight) / 2;
  const backgroundRect = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${backgroundRect}
  <svg x="${number(x)}" y="${number(y)}" width="${number(markWidth)}" height="${number(markHeight)}" viewBox="0 0 2000 1532.335" preserveAspectRatio="xMidYMid meet">
${indent(iconInner, 4)}
  </svg>
</svg>`;
  return render(svg, size);
}

function socialCard() {
  const width = 1200;
  const height = 630;
  const logoWidth = 660;
  const logoHeight = logoWidth * 659.983 / 2920.43;
  const x = (width - logoWidth) / 2;
  const y = (height - logoHeight) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${colors.light}"/>
  <svg x="${number(x)}" y="${number(y)}" width="${number(logoWidth)}" height="${number(logoHeight)}" viewBox="0 0 2920.43 659.983" preserveAspectRatio="xMidYMid meet">
${indent(fullLogoInner, 4)}
  </svg>
</svg>`;
  return render(svg, width);
}

function render(svg, width) {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0
  });
  return Buffer.from(renderer.render().asPng());
}

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

function number(value) {
  return Number(value.toFixed(6)).toString();
}

function indent(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function ensureNewline(value) {
  return `${value.trimEnd()}\n`;
}
