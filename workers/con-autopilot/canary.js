// con-Autopilot — Canary und Rollback (Single Responsibility: welche Version bedient, und wann zurueck).
//
// Deploy-Stand liegt in e2 (con/deploy.json): {stable, canary, canarySeit, historie}.
// Der Inferenz-Endpunkt (Salad bei Bedarf, sonst Mac-MLX fuer kleine Tests)
// liest diesen Stand; dieses Modul entscheidet nur. Rollback-Ausloeser:
//   * Fehlerrate der Canary > Grenze (Betriebsdaten con/deploy-metriken/<version>.json)
//   * Sicherheitsproblem (kritische Sicherheitsfehler in der Bewertung)
//   * Kosten je Antwort > Grenze  * Instabilitaet (Abstuerze)
// Der Rollback setzt canary auf stable zurueck und schreibt Grund + Zeit.
export const DEPLOY_KEY = "con/deploy.json";
export const GRENZEN = Object.freeze({ fehlerrateMax: 0.10, kostenProAntwortUsdMax: 0.02, abstuerzeMax: 3, mindestAntworten: 20 });

export async function leseDeploy(e2) {
  return (await e2.getJson(DEPLOY_KEY, null)) || { stable: null, canary: null, canarySeit: null, historie: [] };
}

export async function setzeCanary(e2, registry, version) {
  const d = await leseDeploy(e2);
  const bisherStable = d.stable;
  d.canary = version;
  d.canarySeit = new Date().toISOString();
  d.stable = bisherStable || version; // erste Version ist zugleich stable — es gibt nichts Aelteres zum Zurueckrollen
  d.historie.push({ zeit: d.canarySeit, aktion: "canary", version, stable: d.stable });
  d.historie = d.historie.slice(-100);
  await e2.putJson(DEPLOY_KEY, d);
  return d;
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
  const metriken = await e2.getJson(`con/deploy-metriken/${d.canary}.json`, null);
  const p = pruefeRollback(metriken);
  if (!p.noetig) return p;
  return fuehreRollbackAus(e2, registry, d, p.gruende, log, z);
}

export async function fuehreRollbackAus(e2, registry, d, gruende, log = () => {}, z = null) {
  const von = d.canary;
  const nach = d.stable;
  d.canary = nach;
  d.canarySeit = null;
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
