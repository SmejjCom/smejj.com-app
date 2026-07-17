#!/usr/bin/env node
// Live-DNS-Guard fuer smejj.com Mail-Stack (Free-Only).
//
// Normaler Check:
//   npm run verify:free-stack:live-dns
// Harter Empfangsmodus (nur gruen, wenn s@smejj.com wirklich empfangen kann):
//   SMEJJ_MAIL_RECEIVE_REQUIRED=1 npm run verify:free-stack:live-dns
//
// Prueft ausschliesslich live per DNS-over-HTTPS (kein UDP noetig):
//   - smejj.com DNS ist aktiv erreichbar (NS + SOA)
//   - Gmail-SPF ist vorhanden (include:_spf.google.com)
//   - DMARC-Monitoring ist vorhanden (v=DMARC1; p=none; rua=mailto:s@smejj.com)
//   - keine fremden MX-Routing-Eintraege (nur der freie Spaceship-Forwarder efwd.spaceship.net)
//   - keine fremden SPF-Includes ausser Gmail (Ausnahme: der aktive freie Forwarder)
//   - keine doppelten SPF-Records (nach Merge genau einer)
//   - keine kostenpflichtige Mail-Infrastruktur (Workspace/365/Zoho-Paid etc.)
//   - Empfang: solange nicht live bewiesen, nur Hinweis; im harten Modus Fehler.
//
// Exit 0 = ok (ggf. mit Hinweisen), Exit 1 = Verletzung.

import fs from "node:fs";
import path from "node:path";

const DOMAIN = "smejj.com";
const TARGET_ADDRESS = "s@smejj.com";
const FORWARD_TARGET = "smejjcom@gmail.com";

// Der aktive, dauerhaft kostenlose Empfangsweg: Spaceship "Email Forwarding Free".
const ALLOWED_MX_SUFFIX = "efwd.spaceship.net";
// SPF: Gmail ist Pflicht; der freie Forwarder-Include ist die einzige geduldete Ausnahme,
// weil er untrennbar zum aktiven freien Empfang gehoert.
const REQUIRED_SPF_INCLUDE = "_spf.google.com";
const ALLOWED_SPF_INCLUDES = new Set(["_spf.google.com", "spf.efwd.spaceship.net"]);

// Bekannte KOSTENPFLICHTIGE Mail-Infrastruktur -> harte Verletzung, falls als MX aktiv.
const PAID_MX_MARKERS = [
  "aspmx.l.google.com", // Google Workspace (kostenpflichtig)
  "googlemail.com",     // Workspace-Variante
  "mail.protection.outlook.com", // Microsoft 365
  "outlook.com",
  "zoho.com", "zoho.eu", "zohomail",
  "mx.yandex", "improvmx", "mailgun", "sendgrid", "mxroute", "fastmail", "messagingengine.com"
];
// Bekannte KOSTENPFLICHTIGE / fremde SPF-Includes -> Verletzung.
const PAID_SPF_MARKERS = [
  "_spf.google.com" /* erlaubt, hier nur zur Klarheit ausgenommen */
];

const rootDir = process.cwd();
const RECEIVE_REQUIRED = process.env.SMEJJ_MAIL_RECEIVE_REQUIRED === "1";
const RECEIVE_EVIDENCE = path.join(rootDir, "docs", "mail", "RECEIVE_TEST.json");

const DOH_ENDPOINTS = [
  "https://dns.google/resolve",
  "https://cloudflare-dns.com/dns-query"
];

const failures = [];
const warnings = [];
const notes = [];

async function dohQuery(name, type) {
  let lastErr;
  for (const ep of DOH_ENDPOINTS) {
    try {
      const url = `${ep}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
      const res = await fetch(url, { headers: { accept: "application/dns-json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`DNS-over-HTTPS fehlgeschlagen fuer ${name}/${type}: ${lastErr && lastErr.message}`);
}

function answers(json, type) {
  const t = { A: 1, NS: 2, SOA: 6, MX: 15, TXT: 16 }[type];
  return (json.Answer || []).filter((a) => a.type === t).map((a) => a.data);
}

function cleanTxt(data) {
  // DoH liefert TXT teils mit umschliessenden Quotes / gesplitteten Strings.
  return String(data).replace(/^"|"$/g, "").replace(/"\s+"/g, "");
}

async function checkReachable() {
  const ns = await dohQuery(DOMAIN, "NS");
  const nsData = answers(ns, "NS");
  if (nsData.length === 0) {
    failures.push(`${DOMAIN}: keine aktiven Nameserver gefunden (DNS-Zone nicht erreichbar).`);
    return false;
  }
  notes.push(`Nameserver: ${nsData.join(", ")}`);
  const soa = await dohQuery(DOMAIN, "SOA");
  if (answers(soa, "SOA").length === 0) {
    warnings.push(`${DOMAIN}: keine SOA-Antwort (Zone evtl. instabil).`);
  }
  return true;
}

async function checkSpf() {
  const txt = await dohQuery(DOMAIN, "TXT");
  const all = answers(txt, "TXT").map(cleanTxt);
  const spf = all.filter((v) => /^v=spf1\b/i.test(v));
  if (spf.length === 0) {
    failures.push(`${DOMAIN}: kein SPF-Record vorhanden.`);
    return;
  }
  if (spf.length > 1) {
    failures.push(`${DOMAIN}: mehrere SPF-Records (${spf.length}) – doppelte SPF-Records sind ungueltig.`);
  }
  const record = spf[0];
  notes.push(`SPF: ${record}`);
  if (!record.includes(`include:${REQUIRED_SPF_INCLUDE}`)) {
    failures.push(`${DOMAIN}: SPF ohne Gmail-Include (include:${REQUIRED_SPF_INCLUDE} fehlt).`);
  }
  const includes = [...record.matchAll(/include:([^\s]+)/gi)].map((m) => m[1].toLowerCase());
  for (const inc of includes) {
    if (!ALLOWED_SPF_INCLUDES.has(inc)) {
      failures.push(`${DOMAIN}: fremder SPF-Include nicht erlaubt: include:${inc}`);
    }
    if (inc === "spf.efwd.spaceship.net") {
      notes.push("SPF enthaelt den freien Spaceship-Forwarder-Include (Teil des aktiven Gratis-Empfangs).");
    }
  }
}

async function checkDmarc() {
  const txt = await dohQuery(`_dmarc.${DOMAIN}`, "TXT");
  const all = answers(txt, "TXT").map(cleanTxt);
  const dmarc = all.filter((v) => /^v=DMARC1\b/i.test(v));
  if (dmarc.length === 0) {
    failures.push(`_dmarc.${DOMAIN}: kein DMARC-Record vorhanden.`);
    return;
  }
  if (dmarc.length > 1) failures.push(`_dmarc.${DOMAIN}: mehrere DMARC-Records.`);
  const record = dmarc[0];
  notes.push(`DMARC: ${record}`);
  const policy = (record.match(/\bp=([a-z]+)/i) || [])[1];
  if (policy !== "none") {
    warnings.push(`DMARC-Policy ist p=${policy} (erwartet Monitoring p=none, bis Versand+Empfang getestet sind).`);
  }
  if (!/rua=mailto:s@smejj\.com/i.test(record)) {
    warnings.push(`DMARC ohne rua=mailto:${TARGET_ADDRESS} (Aggregat-Reporte nicht konfiguriert).`);
  }
}

async function checkMx() {
  const mx = await dohQuery(DOMAIN, "MX");
  const data = answers(mx, "MX"); // z.B. "0 mx1.efwd.spaceship.net."
  if (data.length === 0) {
    // Kein MX = kein Empfang moeglich. Hinweis (nicht hart), solange Empfang offen.
    notes.push(`${DOMAIN}: keine MX-Records (kein Empfang aktiv).`);
    return { hasForwarderMx: false };
  }
  let hasForwarderMx = false;
  for (const row of data) {
    const host = row.split(/\s+/).pop().replace(/\.$/, "").toLowerCase();
    notes.push(`MX: ${host}`);
    if (host.endsWith(ALLOWED_MX_SUFFIX)) {
      hasForwarderMx = true;
    } else {
      failures.push(`${DOMAIN}: fremder MX-Routing-Eintrag nicht erlaubt: ${host}`);
    }
    if (PAID_MX_MARKERS.some((m) => host.includes(m))) {
      failures.push(`${DOMAIN}: kostenpflichtige Mail-Infrastruktur als MX erkannt: ${host}`);
    }
  }
  return { hasForwarderMx };
}

function checkReceiveEvidence(hasForwarderMx) {
  let proven = false;
  let detail = "kein Empfangs-Nachweis vorhanden";
  if (fs.existsSync(RECEIVE_EVIDENCE)) {
    try {
      const ev = JSON.parse(fs.readFileSync(RECEIVE_EVIDENCE, "utf8"));
      if (ev && ev.passed === true) {
        proven = true;
        detail = `Live-Empfang bestaetigt am ${ev.testedAt || "?"} (${ev.method || "Test"})`;
      } else {
        detail = "RECEIVE_TEST.json vorhanden, aber passed!=true";
      }
    } catch {
      detail = "RECEIVE_TEST.json nicht lesbar";
    }
  }
  if (proven) {
    notes.push(`Empfang: ${detail}.`);
    return;
  }
  const msg = `Empfang fuer ${TARGET_ADDRESS} noch nicht als live-getestet dokumentiert (${detail}).`
    + (hasForwarderMx ? " Forwarder-MX ist aktiv, aber ein bestandener Live-Empfangstest fehlt." : "");
  if (RECEIVE_REQUIRED) {
    failures.push("HARTER EMPFANGSMODUS: " + msg);
  } else {
    warnings.push(msg);
  }
}

async function main() {
  console.log(`Live-DNS-Guard fuer ${DOMAIN} (Modus: ${RECEIVE_REQUIRED ? "HART/Empfang-Pflicht" : "normal"})\n`);
  try {
    const reachable = await checkReachable();
    if (reachable) {
      await checkSpf();
      await checkDmarc();
      const { hasForwarderMx } = await checkMx();
      checkReceiveEvidence(hasForwarderMx);
    }
  } catch (err) {
    failures.push(err.message);
  }

  if (notes.length) {
    console.log("Befunde:");
    for (const n of notes) console.log("  - " + n);
    console.log("");
  }
  if (warnings.length) {
    console.log("Hinweise:");
    for (const w of warnings) console.log("  ! " + w);
    console.log("");
  }
  if (failures.length) {
    console.error("VERLETZUNGEN:");
    for (const f of failures) console.error("  x " + f);
    console.error(`\nLive-DNS-Guard: FEHLGESCHLAGEN (${failures.length}).`);
    process.exit(1);
  }
  console.log("Live-DNS-Guard: OK" + (warnings.length ? ` (mit ${warnings.length} Hinweis(en))` : "") + ".");
  process.exit(0);
}

main();
