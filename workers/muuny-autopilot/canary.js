// muuny AI — Canary und Rollback (Single Responsibility: welche Version bedient, und wann zurueck).
//
// Deploy-Stand liegt in e2 (<lager>/deploy.json): {stable, canary, canarySeit, historie}.
// Der Inferenz-Endpunkt (Salad bei Bedarf, sonst Mac-MLX fuer kleine Tests)
// liest diesen Stand; dieses Modul entscheidet nur. Rollback-Ausloeser:
//   * Fehlerrate der Canary > Grenze (Betriebsdaten <lager>/deploy-metriken/<version>.json)
//   * Sicherheitsproblem (kritische Sicherheitsfehler in der Bewertung)
//   * Kosten je Antwort > Grenze  * Instabilitaet (Abstuerze)
// Der Rollback setzt canary auf stable zurueck und schreibt Grund + Zeit.
import { L } from "./lager.js";

export const DEPLOY_KEY = L.deploy;
export const GRENZEN = Object.freeze({ fehlerrateMax: 0.10, kostenProAntwortUsdMax: 0.02, abstuerzeMax: 3, mindestAntworten: 20 });

export async function leseDeploy(e2) {
  return (await e2.getJson(DEPLOY_KEY, null)) || { stable: null, canary: null, canarySeit: null, historie: [] };
}

export async function setzeCanary(e2, registry, version) {
  const d = await leseDeploy(e2);
  const bisherStable = d.stable;
  d.canary = version;
  d.canarySeit = new Date().toISOString();
  d.canaryAnteil = Number(d.canaryAnteil) > 0 ? Number(d.canaryAnteil) : 0.10;
  d.alias ||= ALIAS;
  delete d.canaryWartetAuf;
  d.stable = bisherStable || version; // erste Version ist zugleich stable — es gibt nichts Aelteres zum Zurueckrollen
  d.historie.push({ zeit: d.canarySeit, aktion: "canary", version, stable: d.stable });
  d.historie = d.historie.slice(-100);
  await e2.putJson(DEPLOY_KEY, d);
  return d;
}

/**
 * Darf die Canary auf 100 Prozent?
 *
 * Diese Funktion hat bis zum 20.09.2026 GEFEHLT. Es gab setzeCanary (auf 10 Prozent)
 * und rollbackWennNoetig (zurueck), aber nichts, was eine bewaehrte Version nach vorn
 * bringt. Folge, live nachweisbar: con-1.3 wurde am 05.09. Kandidat, bestand die
 * Pruefung, wurde im Register stabil — und blieb im Deploy-Stand fuenfzehn Tage lang
 * bei 10 Prozent haengen, waehrend der Rueckfall-Anker auf con-1.0 zeigte. Der
 * Kreislauf war an dieser Stelle nicht geschlossen, sondern offen.
 *
 * Bewaehrt heisst: die Bewaehrungszeit ist um, es liegen genug echte Antworten vor,
 * und KEIN Rollback-Grund trifft zu. Ohne Betriebsdaten gibt es keine Befoerderung —
 * eine Canary, die niemand benutzt hat, hat nichts bewiesen. Sie haengt dann nicht
 * still, sondern nennt ihren Grund (siehe `grund` im Rueckgabewert).
 */
export const BEWAEHRUNG_STUNDEN = 24;

export function pruefeBefoerderung(metriken, { canarySeit, jetzt = new Date(), grenzen = GRENZEN,
  bewaehrungStunden = BEWAEHRUNG_STUNDEN, stabilMetriken = null } = {}) {
  if (!canarySeit) return { reif: false, grund: "keine_canary" };
  const stunden = (jetzt.getTime() - new Date(canarySeit).getTime()) / 3_600_000;
  if (!(stunden >= bewaehrungStunden)) return { reif: false, grund: `bewaehrung_laeuft:${stunden.toFixed(1)}h_von_${bewaehrungStunden}h` };
  const n = Number(metriken?.antworten || 0);
  if (n < grenzen.mindestAntworten) return { reif: false, grund: `zu_wenig_betriebsdaten:${n}_von_${grenzen.mindestAntworten}` };
  // Ein Rollback-Grund schlaegt jede Wartezeit: was zurueckmuesste, geht nie nach vorn.
  const r = pruefeRollback(metriken, { grenzen });
  if (r.noetig) return { reif: false, grund: "rollback_grund:" + r.gruende.join("; ") };
  // Gegen den alten Stand: schlechter als vorher ist kein Fortschritt, auch ohne Grenzverletzung.
  if (stabilMetriken) {
    const schlechter = [];
    if (Number(metriken.fehlerrate) > Number(stabilMetriken.fehlerrate ?? 1)) schlechter.push(`fehlerrate ${metriken.fehlerrate} > ${stabilMetriken.fehlerrate}`);
    if (Number(metriken.sicherheitsvorfaelle || 0) > Number(stabilMetriken.sicherheitsvorfaelle || 0)) schlechter.push("mehr_sicherheitsvorfaelle");
    if (Number(metriken.latenzMs || 0) > Number(stabilMetriken.latenzMs || Infinity)) schlechter.push(`latenz ${metriken.latenzMs} > ${stabilMetriken.latenzMs}`);
    if (schlechter.length) return { reif: false, grund: "schlechter_als_stabil:" + schlechter.join("; ") };
  }
  return { reif: true, grund: null, stunden: Math.round(stunden * 10) / 10, antworten: n };
}

/** Befoerdert die Canary auf 100 Prozent, wenn sie sich bewaehrt hat. */
export async function befoerdereCanaryWennBewaehrt(ctx, z) {
  const { e2, jetzt = () => new Date(), log = () => {} } = ctx;
  const d = await leseDeploy(e2);
  if (!d.canary || d.canary === d.stable) return { befoerdert: false, grund: "keine_canary" };
  const metriken = await e2.getJson(`${L.deployMetriken}/${d.canary}.json`, null);
  const stabilMetriken = d.stable ? await e2.getJson(`${L.deployMetriken}/${d.stable}.json`, null) : null;
  const p = pruefeBefoerderung(metriken, { canarySeit: d.canarySeit, jetzt: jetzt(), stabilMetriken });
  if (!p.reif) {
    d.canaryWartetAuf = p.grund;
    await e2.putJson(DEPLOY_KEY, d);
    return { befoerdert: false, grund: p.grund };
  }
  const von = d.stable;
  d.stable = d.canary;
  d.canary = null;
  d.canarySeit = null;
  d.canaryAnteil = 0;
  delete d.canaryWartetAuf;
  d.letzteBefoerderung = { zeit: jetzt().toISOString(), von, nach: d.stable, stunden: p.stunden, antworten: p.antworten };
  d.historie.push({ zeit: d.letzteBefoerderung.zeit, aktion: "befoerdert", von, nach: d.stable, stunden: p.stunden });
  d.historie = d.historie.slice(-100);
  await e2.putJson(DEPLOY_KEY, d);
  if (z) z.historie.push({ zeit: d.letzteBefoerderung.zeit, text: `Alias ${d.alias || "muuny-stable"}: ${von} -> ${d.stable} (100 %, ${p.stunden} h bewaehrt, ${p.antworten} Antworten)` });
  log(`BEFOERDERT ${von} -> ${d.stable} (100 %)`);
  return { befoerdert: true, von, nach: d.stable, stunden: p.stunden };
}

/**
 * Worauf der Alias zeigt. muuny.com fragt NIE eine feste Nummer, sondern diesen Namen —
 * darum ist ein Versionswechsel hier eine Zeile im Deploy-Stand und kein Eingriff in die
 * Anwendung.
 */
export const ALIAS = "muuny-stable";

export async function aliasStand(e2) {
  const d = await leseDeploy(e2);
  return {
    alias: d.alias || ALIAS,
    version: d.stable || null,
    canary: d.canary && d.canary !== d.stable ? d.canary : null,
    canaryAnteil: d.canary && d.canary !== d.stable ? (Number(d.canaryAnteil) || 0.10) : 0,
    canarySeit: d.canarySeit || null,
    wartetAuf: d.canaryWartetAuf || null,
    letzterRollback: d.letzterRollback || null,
    letzteBefoerderung: d.letzteBefoerderung || null
  };
}

/**
 * Welche Version soll DIESE eine Anfrage bedienen?
 * Deterministisch ueber die Anfragekennung, damit derselbe Nutzer innerhalb einer
 * Sitzung nicht zwischen zwei Modellen hin- und herspringt.
 */
export function waehleVersion(stand, kennung = "") {
  if (!stand.canary || !(stand.canaryAnteil > 0)) return { version: stand.version, rolle: "stable" };
  let h = 2166136261;
  const t = String(kennung);
  for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  const anteil = ((h >>> 0) % 10000) / 10000;
  return anteil < stand.canaryAnteil ? { version: stand.canary, rolle: "canary" } : { version: stand.version, rolle: "stable" };
}

export function pruefeRollback(metriken, { grenzen = GRENZEN } = {}) {
  const gruende = [];
  if (!metriken) return { noetig: false, gruende: ["keine_metriken"] };
  const n = Number(metriken.antworten || 0);
  if (n >= grenzen.mindestAntworten && Number(metriken.fehlerrate) > grenzen.fehlerrateMax) gruende.push(`fehlerrate ${metriken.fehlerrate} > ${grenzen.fehlerrateMax}`);
  if (Number(metriken.sicherheitsvorfaelle || 0) > 0) gruende.push(`sicherheitsvorfaelle ${metriken.sicherheitsvorfaelle}`);
  if (n >= grenzen.mindestAntworten && Number(metriken.kostenProAntwortUsd) > grenzen.kostenProAntwortUsdMax) gruende.push(`kosten/antwort ${metriken.kostenProAntwortUsd} > ${grenzen.kostenProAntwortUsdMax}`);
  if (Number(metriken.abstuerze || 0) >= grenzen.abstuerzeMax) gruende.push(`abstuerze ${metriken.abstuerze}`);
  return { noetig: gruende.length > 0, gruende };
}

/** Automatischer Rollback: Canary zurueck auf stable, wenn die Betriebsdaten es verlangen. */
export async function rollbackWennNoetig(ctx, z, registry) {
  const { e2, log = () => {} } = ctx;
  const d = await leseDeploy(e2);
  if (!d.canary || d.canary === d.stable) return { noetig: false };
  const metriken = await e2.getJson(`${L.deployMetriken}/${d.canary}.json`, null);
  const p = pruefeRollback(metriken);
  if (!p.noetig) return p;
  return fuehreRollbackAus(e2, registry, d, p.gruende, log, z);
}

export async function fuehreRollbackAus(e2, registry, d, gruende, log = () => {}, z = null) {
  const von = d.canary;
  const nach = d.stable;
  d.canary = nach;
  d.canarySeit = null;
  d.canaryAnteil = 0;
  delete d.canaryWartetAuf;
  d.letzterRollback = { zeit: new Date().toISOString(), von, nach, gruende };
  d.historie.push({ zeit: d.letzterRollback.zeit, aktion: "rollback", von, nach, gruende });
  await e2.putJson(DEPLOY_KEY, d);
  const eintrag = registry?.versions?.find((v) => v.version === von);
  if (eintrag && eintrag.status === "stable" && von !== nach) {
    // Die zurueckgerollte Version verliert 'stable'; die vorherige stabile bekommt es zurueck.
    eintrag.status = "rejected";
    eintrag.rollback = d.letzterRollback;
    const alt = registry.versions.find((v) => v.version === nach);
    if (alt) alt.status = "stable";
    const { schreibeRegistry } = await import("./registry.js");
    await schreibeRegistry(e2, registry);
  }
  if (z) z.historie.push({ zeit: d.letzterRollback.zeit, text: `ROLLBACK ${von} -> ${nach}: ${gruende.join("; ")}` });
  log(`ROLLBACK ${von} -> ${nach}: ${gruende.join("; ")}`);
  return { noetig: true, gruende, von, nach };
}
