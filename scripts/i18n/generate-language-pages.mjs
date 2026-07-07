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

const { origin, rootLang, xDefault, themeColor, icon, allLanguageNames } = data.site;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hreflangCluster() {
  const lines = [`    <link rel="alternate" hreflang="${rootLang}" href="${origin}/">`];
  for (const locale of data.locales) {
    lines.push(`    <link rel="alternate" hreflang="${locale.code}" href="${origin}/${locale.code}/">`);
  }
  lines.push(`    <link rel="alternate" hreflang="x-default" href="${origin}${xDefault}">`);
  return lines.join("\n");
}

function languageNav(current) {
  const entries = [["/", allLanguageNames[rootLang]]];
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
<html lang="${locale.code}" dir="${locale.dir}">
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
    <meta property="og:image" content="https://smejj.com/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="smejj.com — Autonomous AI Coding OS">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(locale.title)}">
    <meta name="twitter:description" content="${escapeHtml(locale.description)}">
    <meta name="twitter:image" content="https://smejj.com/og-image.png">
    <link rel="canonical" href="${url}">
${hreflangCluster()}
    <title>${escapeHtml(locale.title)}</title>
    <link rel="icon" href="${icon}" type="image/svg+xml">
    <link rel="apple-touch-icon" href="${icon}">
    <script type="application/ld+json">
${jsonLd(locale)}
    </script>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; background: ${themeColor}; color: #1c1c1a; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; line-height: 1.6; }
      .wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 56px; }
      header.top { display: flex; align-items: center; gap: 10px; margin-bottom: 40px; }
      header.top img { width: 28px; height: 28px; }
      header.top strong { font-size: 18px; letter-spacing: 0.2px; }
      h1 { font-size: clamp(28px, 5vw, 40px); line-height: 1.2; margin: 0 0 12px; }
      p.tagline { font-size: 18px; color: #44443f; margin: 0 0 24px; }
      a.cta { display: inline-block; background: #1c1c1a; color: #f7f7f4; text-decoration: none; padding: 12px 26px; border-radius: 999px; font-weight: 600; }
      a.cta:hover { background: #333330; }
      h2 { font-size: 22px; margin: 48px 0 16px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
      .card { background: #ffffff; border: 1px solid #e6e6e0; border-radius: 14px; padding: 18px; }
      .card h3 { margin: 0 0 8px; font-size: 16px; }
      .card p { margin: 0; font-size: 14.5px; color: #44443f; }
      details { background: #ffffff; border: 1px solid #e6e6e0; border-radius: 12px; padding: 12px 16px; margin-bottom: 10px; }
      summary { cursor: pointer; font-weight: 600; }
      details p { margin: 10px 0 4px; color: #44443f; }
      nav.langs { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 12px; }
      nav.langs a { color: #1c1c1a; text-decoration: none; border-bottom: 1px solid #c9c9c2; padding-bottom: 1px; font-size: 14.5px; }
      nav.langs a:hover { border-color: #1c1c1a; }
      footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid #e6e6e0; font-size: 13.5px; color: #6b6b64; display: flex; flex-wrap: wrap; gap: 8px 18px; }
      footer a { color: #6b6b64; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="top">
        <img src="${icon}" alt="" aria-hidden="true">
        <strong>smejj.com</strong>
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
  </body>
</html>
`;
}

function sitemapAlternates(indent) {
  const lines = [`${indent}<xhtml:link rel="alternate" hreflang="${rootLang}" href="${origin}/"/>`];
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
  parts.push("  <url>");
  parts.push(`    <loc>${origin}/</loc>`);
  parts.push(sitemapAlternates("    "));
  parts.push("    <changefreq>daily</changefreq>");
  parts.push("    <priority>1.0</priority>");
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

let written = 0;
for (const locale of data.locales) {
  const dir = join(publicDir, locale.code);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), renderPage(locale), "utf8");
  written += 1;
}
writeFileSync(join(publicDir, "sitemap.xml"), renderSitemap(), "utf8");
console.log(`smejj.com i18n: ${written} Sprachseiten + sitemap.xml erzeugt.`);
