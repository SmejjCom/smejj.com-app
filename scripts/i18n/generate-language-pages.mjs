#!/usr/bin/env node
// generate-language-pages.mjs — erzeugt die 14 lokalisierten Landing Pages
// (public/{lang}/index.html) und die hreflang-Sitemap (public/sitemap.xml)
// aus scripts/i18n/locales.json. Deutsch bleibt die Root-Seite (/).
//
// Aufruf: node scripts/i18n/generate-language-pages.mjs
// Reproduzierbar: gleiche Eingabe -> identische Ausgabe (kein Zeitstempel).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const publicDir = join(repoRoot, "public");
const data = JSON.parse(readFileSync(join(here, "locales.json"), "utf8"));

const { origin, rootLang, xDefault, themeColor, logo, favicon, appleTouchIcon, socialImage, allLanguageNames } = data.site;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// F-06-Fix (2026-07-28, war zuvor nur in den erzeugten Dateien, nicht im
// Generator): die kanonische deutsche Sprachseite ist /de/, nicht /. Die
// Wurzel ist die App-Shell und gehoert in keinen hreflang-Cluster.
function hreflangCluster() {
  const lines = [`    <link rel="alternate" hreflang="${rootLang}" href="${origin}/${rootLang}/">`];
  for (const locale of data.locales) {
    lines.push(`    <link rel="alternate" hreflang="${locale.code}" href="${origin}/${locale.code}/">`);
  }
  lines.push(`    <link rel="alternate" hreflang="x-default" href="${origin}${xDefault}">`);
  return lines.join("\n");
}

function languageNav(current) {
  const entries = [[`/${rootLang}/`, allLanguageNames[rootLang]]];
  for (const locale of data.locales) {
    entries.push([`/${locale.code}/`, allLanguageNames[locale.code]]);
  }
  return entries
    .filter(([href]) => href !== `/${current}/`)
    .map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`)
    .join("\n        ");
}

function jsonLd(locale) {
  const url = `${origin}/${locale.code}/`;
  const inLanguage = [rootLang, ...data.locales.map((entry) => entry.code)];
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "smejj.com",
        url: `${origin}/`,
        inLanguage
      },
      {
        "@type": "SoftwareApplication",
        name: "smejj.com",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url,
        inLanguage: locale.code,
        description: locale.description
      },
      {
        "@type": "FAQPage",
        inLanguage: locale.code,
        mainEntity: locale.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a }
        }))
      }
    ]
  };
  return JSON.stringify(graph, null, 2).replaceAll("</", "<\\/");
}

function renderPage(locale) {
  const url = `${origin}/${locale.code}/`;
  const features = locale.features
    .map(
      (feature) => `        <article class="card">
          <h3>${escapeHtml(feature.h)}</h3>
          <p>${escapeHtml(feature.p)}</p>
        </article>`
    )
    .join("\n");
  const faq = locale.faq
    .map(
      (item) => `        <details>
          <summary>${escapeHtml(item.q)}</summary>
          <p>${escapeHtml(item.a)}</p>
        </details>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="${locale.code}" dir="${locale.dir}" class="p-sprachstart">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="${themeColor}">
    <meta name="description" content="${escapeHtml(locale.description)}">
    <meta name="keywords" content="${escapeHtml(locale.keywords)}">
    <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="smejj.com">
    <meta property="og:title" content="${escapeHtml(locale.title)}">
    <meta property="og:description" content="${escapeHtml(locale.description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:locale" content="${locale.code}">
    <meta property="og:image" content="${socialImage}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="smejj.com — Autonomous AI Coding OS">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(locale.title)}">
    <meta name="twitter:description" content="${escapeHtml(locale.description)}">
    <meta name="twitter:image" content="${socialImage}">
    <meta name="twitter:image:alt" content="smejj.com">
    <link rel="canonical" href="${url}">
${hreflangCluster()}
    <title>${escapeHtml(locale.title)}</title>
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" href="/favicon.ico?v=112" sizes="any">
    <link rel="icon" href="${favicon}" type="image/svg+xml">
    <link rel="icon" href="/icons/favicon-32x32.png?v=112" type="image/png" sizes="32x32">
    <link rel="icon" href="/icons/favicon-16x16.png?v=112" type="image/png" sizes="16x16">
    <link rel="apple-touch-icon" href="${appleTouchIcon}" sizes="180x180">
    <script type="application/ld+json">
${jsonLd(locale)}
    </script>
    <link rel="stylesheet" href="/assets/static-pages.css">
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <a href="/" aria-label="smejj.com">
          <img src="${logo}" alt="smejj.com" width="2000" height="1532">
        </a>
      </header>
      <main>
        <h1>${escapeHtml(locale.h1)}</h1>
        <p class="tagline">${escapeHtml(locale.tagline)}</p>
        <p><a class="cta" href="/">${escapeHtml(locale.cta)}</a></p>
        <h2>${escapeHtml(locale.featuresTitle)}</h2>
        <div class="cards">
${features}
        </div>
        <h2>${escapeHtml(locale.faqTitle)}</h2>
${faq}
        <h2>${escapeHtml(locale.langNote)}</h2>
        <nav class="langs" aria-label="Languages">
        ${languageNav(locale.code)}
        </nav>
      </main>
      <footer>
        <span>© smejj.com</span>
        <a href="/impressum.html">${escapeHtml(locale.imprint)}</a>
        <a href="/datenschutz.html">${escapeHtml(locale.privacy)}</a>
      </footer>
    </div>
    <script src="/assets/voice-landing.js?v=blitz-20260726" type="module"></script>
  </body>
</html>
`;
}

function sitemapAlternates(indent) {
  const lines = [`${indent}<xhtml:link rel="alternate" hreflang="${rootLang}" href="${origin}/${rootLang}/"/>`];
  for (const locale of data.locales) {
    lines.push(`${indent}<xhtml:link rel="alternate" hreflang="${locale.code}" href="${origin}/${locale.code}/"/>`);
  }
  lines.push(`${indent}<xhtml:link rel="alternate" hreflang="x-default" href="${origin}${xDefault}"/>`);
  return lines.join("\n");
}

function renderSitemap() {
  // Nur URLs, die auf GitHub Pages wirklich HTTP 200 liefern. SPA-Routen
  // (/home, /search, ...) antworten server-seitig mit 404 und gehoeren
  // deshalb NICHT in die Sitemap (Fix 2026-07-03, schriftlich freigegeben).
  const appRoutes = [
    ["/impressum.html", "yearly", "0.3"],
    ["/datenschutz.html", "yearly", "0.3"]
  ];
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
  // Die Wurzel ist die App-Shell: eigener Eintrag OHNE hreflang-Cluster (F-06).
  parts.push("  <url>");
  parts.push(`    <loc>${origin}/</loc>`);
  parts.push("    <changefreq>daily</changefreq>");
  parts.push("    <priority>1.0</priority>");
  parts.push("  </url>");
  // /de/ wird nicht vom Generator erzeugt (Root-Sprache, eigene Datei),
  // gehoert aber wie jede Sprachseite in die Sitemap.
  parts.push("  <url>");
  parts.push(`    <loc>${origin}/${rootLang}/</loc>`);
  parts.push(sitemapAlternates("    "));
  parts.push("    <changefreq>weekly</changefreq>");
  parts.push("    <priority>0.9</priority>");
  parts.push("  </url>");
  for (const locale of data.locales) {
    parts.push("  <url>");
    parts.push(`    <loc>${origin}/${locale.code}/</loc>`);
    parts.push(sitemapAlternates("    "));
    parts.push("    <changefreq>weekly</changefreq>");
    parts.push("    <priority>0.9</priority>");
    parts.push("  </url>");
  }
  for (const [path, changefreq, priority] of appRoutes) {
    parts.push(`  <url><loc>${origin}${path}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`);
  }
  parts.push("</urlset>");
  return parts.join("\n") + "\n";
}

// CSP-Haertung 2026-07-28: der Seitenstil liegt jetzt in public/static-pages.css
// (Abschnitt html.p-sprachstart) statt in einem <style>-Block je Seite.
// Fail-closed-Abgleich: der dortige Hintergrund muss dem themeColor aus
// locales.json entsprechen, sonst driften Meta-Angabe und Darstellung auseinander.
const staticCss = readFileSync(join(publicDir, "static-pages.css"), "utf8");
if (!staticCss.includes(`html.p-sprachstart body { margin: 0; background: ${themeColor};`)) {
  throw new Error(
    `generate-language-pages: public/static-pages.css traegt nicht den themeColor ${themeColor} ` +
    "als Hintergrund der Sprachseiten (html.p-sprachstart body). Bitte angleichen."
  );
}

let written = 0;
for (const locale of data.locales) {
  const dir = join(publicDir, locale.code);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderPage(locale), "utf8");
  written += 1;
}
writeFileSync(join(publicDir, "sitemap.xml"), renderSitemap(), "utf8");
console.log(`smejj.com i18n: ${written} Sprachseiten + sitemap.xml erzeugt.`);
