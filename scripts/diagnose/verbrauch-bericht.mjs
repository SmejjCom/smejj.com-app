#!/usr/bin/env node
// smejj.com — Verbrauchs-Bericht aus dem Messschrieb.
//
// Der Control-Server schreibt je Anfrage EINE Zeile nach stdout:
//   [verbrauch] {"tag":"2026-08-18","modell":"glm-5.2","einTokens":12345,...}
// Diese Zeilen ueberleben jeden Neustart (der Arbeitsspeicher nicht) und sind
// damit der eigentliche Messschrieb. Dieses Werkzeug macht eine lesbare
// Uebersicht daraus — ohne Anmeldung, ohne Netz, ohne Adminrechte.
//
// Aufruf:
//   node scripts/diagnose/verbrauch-bericht.mjs zeabur-log.txt
//   zeabur logs smejj-control | node scripts/diagnose/verbrauch-bericht.mjs
//
// Zwei Zahlen stehen NIE in derselben Spalte: was der Anbieter gemeldet hat
// (gemessen) und was wir aus Zeichen geschaetzt haben. Ein Bericht, der beides
// vermischt, sieht genauer aus als er ist.

import { readFileSync } from "node:fs";

const MARKE = "[verbrauch] ";

const datei = process.argv[2];
const roh = datei ? readFileSync(datei, "utf8") : readFileSync(0, "utf8");
const zeilen = roh.split("\n");

const saetze = [];
for (const zeile of zeilen) {
  const start = zeile.indexOf(MARKE);
  if (start === -1) continue;
  try {
    const datensatz = JSON.parse(zeile.slice(start + MARKE.length));
    if (datensatz?.tag) saetze.push(datensatz);
  } catch {
    // Abgeschnittene Zeile am Logrand — ueberspringen, nicht abbrechen.
  }
}

if (saetze.length === 0) {
  console.log("Keine Messzeilen gefunden.");
  console.log("Erwartet werden Zeilen mit dem Praefix \"[verbrauch] \" aus dem Control-Log.");
  console.log("Steht SMEJJ_VERBRAUCH_LOG auf \"aus\", schreibt der Server keine.");
  process.exit(0);
}

const tage = new Map();
for (const satz of saetze) {
  const tag = holen(tage, satz.tag, () => ({ ...leer(), modelle: new Map(), nutzer: new Map(), spuren: new Map() }));
  addiere(tag, satz);
  addiere(holen(tag.modelle, satz.modell || "unbekannt", leer), satz);
  addiere(holen(tag.nutzer, satz.nutzer || "unbekannt", leer), satz);
  addiere(holen(tag.spuren, satz.spur || "unbekannt", leer), satz);
}

for (const [name, tag] of [...tage.entries()].sort()) {
  console.log("");
  console.log(`══ ${name} ${"═".repeat(Math.max(0, 62 - name.length))}`);
  console.log("");
  console.log(`  Anfragen        ${zahl(tag.anfragen)}   (${zahl(tag.gemessen)} gemessen, ${zahl(tag.geschaetzt)} geschaetzt)`);
  console.log(`  Eingabe-Tokens  ${zahl(tag.einTokens)}   davon ${zahl(tag.cacheTokens)} aus dem Cache (${prozent(tag.cacheTokens, tag.einTokens)})`);
  console.log(`  Ausgabe-Tokens  ${zahl(tag.ausTokens)}   davon ${zahl(tag.denkTokens)} Denk-Tokens`);
  console.log(`  Kosten          ${geld(tag.kostenUsd)}${tag.ohnePreis ? `   (${tag.ohnePreis} Anfragen ohne hinterlegten Preis)` : ""}`);
  console.log(`  je Anfrage      ${geld(tag.kostenUsd / tag.anfragen)}   Eingabe ${zahl(Math.round(tag.einTokens / tag.anfragen))} Tokens, Dauer ${sekunden(tag.dauerMsSumme / tag.anfragen)}`);
  console.log(`  Eingabeanteil   ${prozent(tag.einTokens, tag.einTokens + tag.ausTokens)} der Tokens`);

  tabelle("Modelle", tag.modelle);
  tabelle("Spuren", tag.spuren);
  tabelle("Nutzer (Top 10)", tag.nutzer, 10);
}

console.log("");
console.log("Hinweis: 'geschaetzt' heisst Zeichen/4, nicht gemessen. Wo viele Zeilen");
console.log("geschaetzt sind, hat der Anbieter keinen usage-Block geliefert —");
console.log("dann zuerst SMEJJ_USAGE_MESSUNG pruefen, nicht die Zahlen deuten.");
console.log("");

function tabelle(titel, karte, grenze = 0) {
  const eintraege = [...karte.entries()].sort((a, b) => b[1].kostenUsd - a[1].kostenUsd || b[1].anfragen - a[1].anfragen);
  const sichtbar = grenze ? eintraege.slice(0, grenze) : eintraege;
  if (sichtbar.length === 0) return;
  console.log("");
  console.log(`  ${titel}`);
  console.log(`  ${"─".repeat(74)}`);
  console.log(`  ${"Name".padEnd(30)}${"Anfragen".padStart(9)}${"Eingabe".padStart(12)}${"Ausgabe".padStart(11)}${"Kosten".padStart(12)}`);
  for (const [name, werte] of sichtbar) {
    console.log(
      `  ${String(name).slice(0, 29).padEnd(30)}`
      + `${zahl(werte.anfragen).padStart(9)}`
      + `${zahl(werte.einTokens).padStart(12)}`
      + `${zahl(werte.ausTokens).padStart(11)}`
      + `${spalteKosten(werte).padStart(12)}`
    );
  }
}

/**
 * "0,00 $" und "Preis unbekannt" sehen in einer Zahlenspalte gleich aus — und
 * genau daraus entsteht der Irrtum, ein Modell sei gratis. Zeilen ohne
 * hinterlegten Preis sagen das deshalb im Klartext.
 */
function spalteKosten(werte) {
  if (werte.ohnePreis === werte.anfragen) return "kein Preis";
  if (werte.ohnePreis > 0) return `${geld(werte.kostenUsd)}+?`;
  return geld(werte.kostenUsd);
}

function leer() {
  return {
    anfragen: 0, gemessen: 0, geschaetzt: 0, einTokens: 0, ausTokens: 0,
    cacheTokens: 0, denkTokens: 0, kostenUsd: 0, ohnePreis: 0, dauerMsSumme: 0
  };
}

function addiere(zaehler, satz) {
  zaehler.anfragen += 1;
  zaehler[satz.quelle === "gemessen" ? "gemessen" : "geschaetzt"] += 1;
  zaehler.einTokens += nummer(satz.einTokens);
  zaehler.ausTokens += nummer(satz.ausTokens);
  zaehler.cacheTokens += nummer(satz.cacheTokens);
  zaehler.denkTokens += nummer(satz.denkTokens);
  zaehler.dauerMsSumme += nummer(satz.dauerMs);
  if (satz.kostenUsd === null || satz.kostenUsd === undefined) zaehler.ohnePreis += 1;
  else zaehler.kostenUsd += nummer(satz.kostenUsd);
}

function holen(karte, schluessel, bauen) {
  if (!karte.has(schluessel)) karte.set(schluessel, bauen());
  return karte.get(schluessel);
}

function nummer(wert) {
  const zahlWert = Number(wert);
  return Number.isFinite(zahlWert) ? zahlWert : 0;
}

function zahl(wert) {
  return nummer(wert).toLocaleString("de-DE");
}

function geld(wert) {
  const betrag = nummer(wert);
  return `${betrag < 0.01 && betrag > 0 ? betrag.toFixed(5) : betrag.toFixed(2)} $`;
}

function prozent(teil, ganzes) {
  const unten = nummer(ganzes);
  if (unten <= 0) return "0 %";
  return `${Math.round((nummer(teil) / unten) * 100)} %`;
}

function sekunden(millis) {
  return `${(nummer(millis) / 1000).toFixed(1)} s`;
}
