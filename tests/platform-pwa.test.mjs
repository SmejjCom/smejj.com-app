import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync("public/index.html", "utf8");
// Seit der Aufteilung vom 2026-07-28 liegen die Ansichtstabellen in
// public/view-routes.js. Geprueft wird weiterhin dieselbe Zusage.
const app = fs.readFileSync("public/app.js", "utf8")
  + fs.readFileSync("public/view-routes.js", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const brandingCss = fs.readFileSync("public/branding.css", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
const iconSvg = fs.readFileSync("public/icons/smejj_icon.svg", "utf8");

function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function icoDimensions(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    return [bytes[offset] || 256, bytes[offset + 1] || 256];
  });
}

function normalizedSvgHash(file) {
  const bytes = fs.readFileSync(file);
  const normalized = bytes.at(-1) === 10 ? bytes.subarray(0, -1) : bytes;
  return createHash("sha256").update(normalized).digest("hex");
}

test("PWA manifest is install-ready for mobile shells", () => {
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /mobile-web-app-capable/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test("service worker caches only small app shell assets and has offline fallback", () => {
  // Erwartung auf den GELEBTEN, live deployten Stand nachgezogen (2026-07-15,
  // Freigabe "Ja"). public/sw.js wurde von einer parallelen Session auf v121
  // gebumpt und ist auf GitHub Pages bereits live; sw.js selbst wurde dabei
  // NICHT angefasst — hier steht nur die Test-Erwartung.
  // v121 -> v122 am 2026-07-16: View-Navigation (view-chrome.js/.css) in den
  // Shell-Precache aufgenommen; schriftliche Freigabe des Nutzers ("Ich finde
  // deinen Vorschlag gut mit X Icon schliessen und Zurueckpfeile ... Wie
  // wuerdest du jetzt machen?" + Master-Prompt "eigenstaendig weiter").
  // v135 -> v138 am 2026-07-26: Sprachwellen-Sessions hatten v136/v137 gebumpt,
  // ohne die Test-Erwartung nachzuziehen (Test war rot). v138 = Konto-Light-Mode-
  // Fix (account-privacy.css im Precache; Freigabe Betreiber "eigenstaendig
  // weiter ... live gehen").
  // v143 (2026-07-26): Stand nach Abo (v141), Stufe C (v142) und Folge-Bump.
  // v143 -> v146 am 2026-07-27: Die drei Salad-Abloesungs-Commits (v144 Zeabur
  // als Haupt-Endpunkt, v145 Tempo-Korrektur zurueck auf Salad, v146 Zeabur
  // primaer nach Groq-Key) haben die Test-Erwartung nicht nachgezogen — der
  // Test war seitdem rot und blockierte check:all. public/sw.js selbst wurde
  // hier NICHT angefasst; v146 ist der live ausgelieferte Stand (geprueft am
  // 2026-07-27 gegen https://smejj.com/sw.js). Nachgezogen im Rahmen der
  // QA-Welle-1-Behebung, Freigabe des Betreibers "platform-pwa auf Service
  // Worker v146 nachziehen ... bis check:all vollstaendig gruen ist".
  // v146 -> v148 am 2026-07-28 nachgezogen: Commit 947efe0 (Startseite Stufe 2,
  // Seiten-Kontext fuer das Modell) hat public/sw.js gebumpt, ohne diese Erwartung
  // mitzunehmen — der Test war seitdem rot und blockierte check:all. public/sw.js
  // selbst wurde hier NICHT angefasst.
    // v153 -> v154 am 2026-07-28: view-title.js neu im Precache (Seitentitel je
  // Ansicht, QA-Welle 2 Befund W2-05). public/sw.js selbst siehe dort.
  // v157 -> v158 am 2026-07-28: englische Hoeflichkeitsfassungen der Rechtstexte
  // im Precache (siehe tests/profile-dock.test.mjs).
  // v164 -> v165 am 2026-07-28: Aktionen pro Chat-Nachricht — chat-actions.js,
  // chat-messages.js und chat-actions-menu.js neu im Precache, start-styles.css
  // enthaelt neu chat-actions.css (siehe public/sw.js).
  assert.match(sw, /CACHE_NAME = "smejj-shell-v221"/);
  assert.match(sw, /\/assets\/view-chrome\.js/);
  // view-chrome.css liegt seit dem Ladezeit-Buendel (2026-07-27) in start-styles.css.
  assert.match(sw, /\/assets\/start-styles\.css/);
  assert.ok(fs.readFileSync("public/start-styles.css", "utf8").includes("view-chrome"), "view-chrome-CSS fehlt im Buendel");
  assert.match(sw, /\/assets\/search\.js/);
  assert.match(sw, /\/assets\/autonomous-coding\.js/);
  assert.match(sw, /\/assets\/autonomous-coding\.css/);
  assert.match(sw, /url\.pathname\.replace\(\/\\\/\$\/, ""\) === "\/home"/);
  assert.match(sw, /Response\.redirect\(new URL\("\/", url\.origin\)\.href, 302\)/);
  assert.match(sw, /cache\.addAll\(SHELL\.map\(\(url\) => new Request\(url, \{ cache: "reload" \}\)\)\)/);
  assert.match(sw, /fetch\(request\)\.catch/);
  assert.match(sw, /caches\.match\("\/"\)/);
  // v159 -> v160 (QA-Welle 1, F-24): Precache-Dateien cache-first, HTML und
  // /api/ network-first. Drei Zusicherungen: (1) der cache-first-Zweig existiert
  // und prueft die Precache-Menge, (2) HTML-Anfragen (navigate/document/.html)
  // sind davon ausgenommen, (3) der Treffer ignoriert ?v=-Kennungen.
  assert.match(sw, /PRECACHE_PATHS\.has\(url\.pathname\)/);
  assert.match(sw, /isHtmlRequest\(request, url\)/);
  assert.match(sw, /ignoreSearch: true/);
  assert.match(sw, /request\.mode === "navigate" \|\| request\.destination === "document"/);
  assert.doesNotMatch(sw, /model-files|\.gguf|\.safetensors|workers-ai|cloudflare-r2/i);
});

test("official logo, favicons, PWA icons and social card stay complete", () => {
  assert.equal(normalizedSvgHash("public/icons/smejj_icon.svg"), "1e9add8a2ad37ba02d7adda67a545ba7e63938cf5e47a45d85ded50b11b25a4d");
  assert.equal(normalizedSvgHash("public/icons/smejj_full_logo.svg"), "df1db549d8c5d7642d2889f1e4200329b428db86f53a83c5eb81fe961960ba49");
  assert.doesNotMatch(iconSvg, /<(?:rect|image)\b|style=/i, "official icon must not paint a background");
  assert.ok(!fs.existsSync("public/icons/icon.svg"));
  assert.ok(!fs.existsSync("public/icons/maskable.svg"));

  const pngs = new Map([
    ["public/icons/favicon-16x16.png", [16, 16]],
    ["public/icons/favicon-32x32.png", [32, 32]],
    ["public/icons/favicon-48x48.png", [48, 48]],
    ["public/apple-touch-icon.png", [180, 180]],
    ["public/icons/pwa-192x192.png", [192, 192]],
    ["public/icons/pwa-512x512.png", [512, 512]],
    ["public/icons/maskable-192x192.png", [192, 192]],
    ["public/icons/maskable-512x512.png", [512, 512]],
    ["public/og-image.png", [1200, 630]]
  ]);
  for (const [file, expected] of pngs) assert.deepEqual(pngDimensions(file), expected, file);
  assert.deepEqual(icoDimensions("public/favicon.ico"), [[16, 16], [32, 32], [48, 48]]);

  const expectedManifestIcons = [
    ["/icons/pwa-192x192.png", "192x192", "image/png", "any"],
    ["/icons/pwa-512x512.png", "512x512", "image/png", "any"],
    ["/icons/maskable-192x192.png", "192x192", "image/png", "maskable"],
    ["/icons/maskable-512x512.png", "512x512", "image/png", "maskable"]
  ];
  assert.deepEqual(manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type, icon.purpose]), expectedManifestIcons);
  for (const [src] of expectedManifestIcons) assert.ok(fs.existsSync(`public${src}`), `missing ${src}`);

  for (const asset of [
    "/assets/start-styles.css",
    "/favicon.ico?v=112",
    "/apple-touch-icon.png",
    "/og-image.png",
    "/icons/smejj_icon.svg",
    "/icons/smejj_favicon.svg?v=112",
    "/icons/smejj_full_logo.svg",
    "/icons/smejj_full_logo_on_dark.svg",
    ...expectedManifestIcons.map(([src]) => src)
  ]) assert.ok(sw.includes(`"${asset}"`), `service worker missing ${asset}`);

  assert.match(html, /<body data-left-menu-state="closed">/);
  assert.match(html, /class="app-brand-icon"[^>]*\/icons\/smejj_icon\.svg/);
  assert.match(html, /class="app-brand-wordmark"[^>]*\/icons\/smejj_full_logo_on_dark\.svg/);
  assert.match(html, /href="\/icons\/smejj_favicon\.svg\?v=112" type="image\/svg\+xml"/);
  assert.match(brandingCss, /\.app-brand-logo[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(brandingCss, /\.app-brand-icon[\s\S]*background: transparent;/);
  assert.match(brandingCss, /body\[data-left-menu-state="expanded"\] \.app-brand-wordmark[\s\S]*visibility: visible;/);
  assert.match(html, /href="\/favicon\.ico\?v=112"/);
  assert.match(html, /href="\/apple-touch-icon\.png" sizes="180x180"/);
  const locales = JSON.parse(fs.readFileSync("scripts/i18n/locales.json", "utf8"));
  for (const locale of locales.locales) {
    const page = fs.readFileSync(`public/${locale.code}/index.html`, "utf8");
    assert.match(page, /\/icons\/smejj_icon\.svg/);
    assert.match(page, /\/icons\/smejj_favicon\.svg/);
    assert.doesNotMatch(page, /\/icons\/smejj_full_logo\.svg/);
    assert.doesNotMatch(page, /\/icons\/icon\.svg/);
  }
  for (const file of ["public/impressum.html", "public/datenschutz.html", "public/404.html"]) {
    const page = fs.readFileSync(file, "utf8");
    assert.match(page, /\/icons\/smejj_icon\.svg/, file);
    assert.match(page, /\/icons\/smejj_favicon\.svg/, file);
    assert.doesNotMatch(page, /\/icons\/smejj_full_logo\.svg/, file);
  }
});

test("browser history and reload deep links are wired for app navigation", () => {
  assert.match(app, /pushState/);
  assert.match(app, /replaceState/);
  assert.match(app, /popstate/);
  assert.match(app, /restoreViewFromUrl/);
});

test("mobile and tablet breakpoints keep layouts single-column on small screens", () => {
  assert.match(css, /@media \(max-width: 920px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /touch-action: manipulation/);
});

test("no automatic model or paid provider downloads are wired into public assets", () => {
  const publicFiles = fs.readdirSync("public", { recursive: true })
    .filter((file) => fs.statSync(path.join("public", file)).isFile());
  for (const file of publicFiles) {
    const fullPath = path.join("public", file);
    const size = fs.statSync(fullPath).size;
    assert.ok(size < 512 * 1024, `${file} is unexpectedly large`);
    if (/\.(js|html|css|txt|webmanifest|svg)$/.test(file)) {
      const text = fs.readFileSync(fullPath, "utf8");
      assert.doesNotMatch(text, /fetch\([^)]*(workers-ai|cloudflare-r2|trial-api|auto-billing|\.gguf|\.safetensors)/i, `${file} contains forbidden provider autoload`);
      assert.doesNotMatch(text, /import\([^)]*(\.gguf|\.safetensors|model-files)/i, `${file} imports model files`);
    }
  }
});

test("public assets include imported browser modules", () => {
  for (const file of [
    "public/storage/index.js",
    "public/storage/localWorkspace.js",
    "public/search.js",
    "public/ai/index.js",
    "public/ai/router.js",
    "public/shared/securityPolicy.js"
  ]) {
    assert.ok(fs.existsSync(file), `missing public module ${file}`);
  }
});
