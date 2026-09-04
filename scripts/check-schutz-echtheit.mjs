#!/usr/bin/env node
// smejj.com — bewacht ein Manifest noch das, was die Nutzer WIRKLICH bekommen?
//
// Betreiber-Auftrag 2026-09-04 abends: "Taeglichen Phantom-Waechter bauen".
//
// DIE LUECKE, DIE ER SCHLIESST — und warum keine der bestehenden Sperren sie
// sieht: Jedes check-*-lock.mjs vergleicht das Manifest mit der ARBEITSKOPIE.
// Beide koennen uebereinstimmen und trotzdem beide falsch sein. Genau das war
// am 2026-09-04 den ganzen Tag der Fall:
//
//   Datei                     Manifest    smejj.com liefert
//   public/composer-plus-menu.js  6d26716c    5f3a314d
//   public/index.html             4b450e89    5be2690b
//   public/app.js                 5342b75e    7a0263e7
//   public/sw.js                  ca1dd35d    14bea8b0
//
// Der Start-Lock meldete dabei GRUEN. Er bewachte vier Fassungen, die niemand
// bekommt — und die echten, ausgelieferten Dateien waren voellig ungeschuetzt.
// Aufgefallen ist es nur, weil ein Mensch die Zahlen gegen die Wirklichkeit
// gehalten hat.
//
// Dieser Waechter stellt genau diese Frage, und zwar taeglich:
// Stimmt der eingefrorene Hash mit dem ueberein, was smejj.com AUSLIEFERT?
//
// GRENZE, ehrlich benannt: geprueft werden kann nur, was oeffentlich abrufbar
// ist. Serverdateien (control-server/, src/) liefert niemand aus; sie werden
// gezaehlt und benannt, aber nicht als Verstoss gewertet — "nicht messbar" ist
// kein Verstoss (dieselbe Regel wie in der Stempel-Kaskade).
//
// Aufruf:
//   node scripts/check-schutz-echtheit.mjs
//   node scripts/check-schutz-echtheit.mjs --basis https://smejj.com
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASIS_VORGABE = "https://smejj.com";

/** Die Manifeste, die Dateien per Hash einfrieren. */
export const MANIFESTE = Object.freeze([
  { name: "start-lock", pfad: "docs/frontend/start-lock-manifest.json", stempel: "scripts/check-start-lock.mjs" },
  { name: "security-lock", pfad: "docs/security/security-lock-manifest.json", stempel: "scripts/check-security-lock.mjs" },
  { name: "admin-lock", pfad: "docs/security/admin-lock-manifest.json", stempel: "scripts/check-admin-lock.mjs" },
  { name: "favicon-lock", pfad: "docs/frontend/favicon-lock-manifest.json", stempel: "scripts/check-favicon-lock.mjs" },
  { name: "abo-lock", pfad: "docs/approvals/abo-lock-manifest.json", stempel: "scripts/check-abo-lock.mjs" },
  { name: "einwilligung-lock", pfad: "docs/approvals/einwilligung-lock-manifest.json", stempel: "scripts/check-einwilligung-lock.mjs" },
  { name: "modell-menue-lock", pfad: "docs/approvals/modell-menue-lock-manifest.json", stempel: "scripts/check-modell-menue-lock.mjs" },
  { name: "deploy-lock", pfad: "docs/deploy/deploy-lock-manifest.json", stempel: "scripts/check-deploy-lock.mjs" }
]);

/**
 * Unter welcher Adresse wird eine geschuetzte Datei ausgeliefert?
 * `null` heisst: gar nicht — dann ist sie nicht messbar, nicht verdaechtig.
 */
export function adresseVon(datei, basis = BASIS_VORGABE) {
  if (!datei.startsWith("public/")) return null;         // Server- und Werkzeugdateien
  if (/\.test\.[cm]?js$/.test(datei)) return null;       // Tests gehen nie ins Netz
  return `${basis}/${datei.slice("public/".length)}`;
}

function sha256(puffer) {
  return createHash("sha256").update(puffer).digest("hex");
}

// Manche Adressen liefern nicht die Quelldatei, sondern ein daraus GEBAUTES
// Buendel. /chat-bridge.js ist so ein Fall: die Quelle hat 36 KB, ausgeliefert
// werden 813 KB, zusammengesetzt aus einem Dutzend Dateien. Der erste Entwurf
// dieses Waechters meldete das als Phantom — und lag falsch.
//
// Ein Artefakt gegen seine Quelle zu haschen beantwortet die falsche Frage
// (dieselbe Lehre wie "Artefakt ersetzt NIE die Quelle"). Erkannt wird es am
// Kopf, den der Buendler selbst schreibt; er steht nur im Artefakt, nie in
// einer Quelldatei.
const ARTEFAKT_KOPF = "ERZEUGTE DATEI";

function istArtefakt(ausgeliefert, quelle) {
  const kopf = ausgeliefert.subarray(0, 200).toString("utf8");
  if (!kopf.includes(ARTEFAKT_KOPF)) return false;
  // Traegt schon die Quelle denselben Kopf, ist die Datei selbst das Artefakt
  // und der Vergleich wieder gueltig.
  return !(quelle && quelle.subarray(0, 200).toString("utf8").includes(ARTEFAKT_KOPF));
}

async function holen(adresse) {
  try {
    const antwort = await fetch(adresse, { redirect: "follow" });
    if (!antwort.ok) return null;
    return Buffer.from(await antwort.arrayBuffer());
  } catch (fehler) {
    return null;
  }
}

/**
 * Vergleicht ein Manifest mit der Auslieferung.
 * @returns {{name: string, geprueft: number, nichtMessbar: string[], phantome: Array<{datei: string, eingefroren: string, live: string}>}}
 */
export async function pruefeManifest(eintrag, basis = BASIS_VORGABE, hole = holen) {
  const voll = path.join(WURZEL, eintrag.pfad);
  if (!existsSync(voll)) return { name: eintrag.name, stempel: eintrag.stempel, fehlt: true, geprueft: 0, nichtMessbar: [], artefakte: [], phantome: [], veraltet: [] };
  const manifest = JSON.parse(readFileSync(voll, "utf8"));
  const dateien = manifest.files || {};
  const phantome = [];
  const nichtMessbar = [];
  const artefakte = [];
  const veraltet = [];
  let geprueft = 0;
  for (const [datei, eingefroren] of Object.entries(dateien)) {
    const adresse = adresseVon(datei, basis);
    if (!adresse) { nichtMessbar.push(datei); continue; }
    const inhalt = await hole(adresse);
    if (inhalt === null) { nichtMessbar.push(datei); continue; }
    const quelle = existsSync(path.join(WURZEL, datei)) ? readFileSync(path.join(WURZEL, datei)) : null;
    if (istArtefakt(inhalt, quelle)) { artefakte.push(datei); continue; }
    geprueft += 1;
    const live = sha256(inhalt);
    if (live === eingefroren) continue;
    // DREI-WEG-EINORDNUNG, und darauf kommt es an:
    //
    //   Manifest == Arbeitskopie, aber != Auslieferung
    //     -> STUMM FALSCH. Die eigene Sperre meldet gruen und bewacht doch
    //        etwas, das niemand bekommt. Genau der Fall vom 04.09. mit
    //        composer-plus-menu.js. Nur diesen Fall sieht sonst NIEMAND —
    //        deshalb faellt der Waechter allein darueber.
    //
    //   Manifest != Arbeitskopie
    //     -> VERALTET. Die eigene Sperre ist bereits rot und sagt es laut.
    //        Hier nur benennen, nicht ein zweites Mal durchfallen: sonst
    //        meldeten zwei Pruefungen denselben Befund und man sucht zweimal.
    const inKopie = quelle ? sha256(quelle) : null;
    const stumm = inKopie !== null && inKopie === eingefroren;
    (stumm ? phantome : veraltet).push({ datei, eingefroren, live, inKopie });
  }
  return { name: eintrag.name, stempel: eintrag.stempel, geprueft, nichtMessbar, artefakte, phantome, veraltet, frozenAt: manifest.frozenAt || "?" };
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--basis");
  const basis = i >= 0 ? argv[i + 1] : BASIS_VORGABE;

  const berichte = [];
  for (const eintrag of MANIFESTE) berichte.push(await pruefeManifest(eintrag, basis));

  const fehlend = berichte.filter((b) => b.fehlt);
  const mitPhantomen = berichte.filter((b) => (b.phantome || []).length > 0);
  const gesamtGeprueft = berichte.reduce((s, b) => s + b.geprueft, 0);

  for (const b of fehlend) console.error(`schutz-echtheit: Manifest fehlt — ${b.name}`);
  for (const b of berichte.filter((x) => (x.veraltet || []).length)) {
    console.log(`schutz-echtheit: ${b.name} ist VERALTET (${b.veraltet.length}) — die eigene Sperre meldet das bereits:`);
    for (const v of b.veraltet) console.log(`  - ${v.datei} (Arbeitskopie und Auslieferung sind neuer als das Manifest)`);
  }
  for (const b of mitPhantomen) {
    console.error(`schutz-echtheit VERLETZT: ${b.name} bewacht ${b.phantome.length} Fassung(en), die ${basis} nicht ausliefert (eingefroren ${b.frozenAt}):`);
    for (const p of b.phantome) {
      console.error(`  - ${p.datei}`);
      console.error(`      Manifest:  ${p.eingefroren.slice(0, 16)}`);
      console.error(`      ausgeliefert: ${p.live.slice(0, 16)}`);
    }
  }
  if (mitPhantomen.length || fehlend.length) {
    console.error(`\n  Diese Manifeste sind GRUEN und trotzdem wirkungslos: sie bewachen etwas,`);
    console.error(`  das niemand bekommt, waehrend die echten Dateien ungeschuetzt sind.`);
    console.error(`\n  SO WIRD ES BEHOBEN — in dieser Reihenfolge, sonst friert der Stempel`);
    console.error(`  wieder eine Fassung ein, die niemand ausliefert:`);
    console.error(`    1. Die AUSGELIEFERTEN Fassungen in den Zweig holen (nicht umgekehrt).`);
    console.error(`    2. Alle Pruefungen gruen bekommen.`);
    console.error(`    3. Diesen Waechter erneut laufen lassen — er muss 0 Phantome melden.`);
    console.error(`    4. Dann stempeln:`);
    for (const b of mitPhantomen) {
      if (b.stempel) console.error(`         node ${b.stempel} --freeze --confirm "<Wortlaut der Freigabe>"`);
    }
    console.error(`\n  NICHT automatisch stempeln. Ein Stempel ohne Blick haette am 2026-09-04`);
    console.error(`  genau die Phantom-Fassungen abgesegnet, die er verhindern soll.`);
    process.exit(1);
  }
  const nichtMessbar = berichte.reduce((s, b) => s + b.nichtMessbar.length, 0);
  const artefakte = berichte.reduce((s, b) => s + (b.artefakte || []).length, 0);
  console.log(`schutz-echtheit OK — ${gesamtGeprueft} ausgelieferte Dateien aus ${berichte.length} Manifesten`
    + ` stimmen mit ${basis} ueberein (${nichtMessbar} nicht abrufbar, ${artefakte} gebuendelt — beide uebersprungen).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((fehler) => { console.error("schutz-echtheit:", fehler.message); process.exit(1); });
}
