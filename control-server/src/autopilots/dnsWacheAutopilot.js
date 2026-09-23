// smejj.com — DNS-Wache (Autopilot Nr. 87), Betreiber-Freigabe 2026-09-22
// („Baue Stufe A und B der DNS-Wache"), Vorschlag docs/betrieb/DNS_WACHE_VORSCHLAG_2026-09-21.md.
//
// ANLASS (21.09.2026, ~13:40–13:48): smejj.com und api.smejj.com waren nicht auflösbar.
// Beide zuständigen Nameserver launch1/launch2.spaceship.net antworteten für die Zone
// mit SERVFAIL/REFUSED; Google-DNS meldete „Name server failure", Cloudflare „No
// Reachable Authority". Die SEITE lief die ganze Zeit — nur der Name war weg.
// Bemerkt hat es der Zufall: eine Versionsabfrage scheiterte. Keine der 86 Wachen
// misst die Namensauflösung; die Ampel prüft Seiten und Dienste vom Server aus, und
// der hat die Namen meist noch im Zwischenspeicher.
//
// WAS SIE MISST (alles Lesen, keine Kosten, kein neuer Anbieter):
//   1. die zwei zuständigen Nameserver DIREKT (Resolver mit fester Server-Adresse):
//      das ist die Ursachen-Messung — sie zeigt den Ausfall sofort, auch wenn
//      öffentliche Dienste noch aus dem Zwischenspeicher antworten.
//   2. Google-DNS über HTTPS (dns.google/resolve): Status 0 und AD=true — das
//      AD-Bit ist der DNSSEC-Nachweis. Bricht die Signatur, steht hier Status 2,
//      lange bevor ein Besucher schreibt.
//   3. Soll-Ist-Vergleich gegen DNS_SOLL: eine fremde Änderung an der Zone
//      (Konto-Übernahme beim Anbieter, Fehlklick) wird zum Alarm.
//
// ZWEITER BLICK VOR ROT (Lehre aus Nr. 8/32, dienstSondenAutopilot.js): ein
// einzelner Fehlschlag ist kein Ausfall — ein gestörter Nameserver wird nach
// 10 s einmal wiederholt. Ein eigener Netzfehler des Servers ist KEIN Urteil
// („Netz-Takt abgewartet"), die Regel des Messlaufs: ein gescheiterter
// Transport ist keine schlechte Note.
//
// ALARM: die Läufer-Ampel meldet jeden neuen Rot-Fall per Mail an den Betreiber
// (opsAutopilotenAlerts.js) und ins Werkstatt-Backlog. Bei einem DNS-Ausfall
// kann genau diese Mail im Spam landen (SPF/DKIM derselben Zone) — darum steht
// daneben der Außenposten .github/workflows/dns-wache.yml, der über github.com
// meldet.
import { Resolver } from "node:dns/promises";

/**
 * Das Soll der Zone — eingefroren am 22.09.2026 (Werte aus dns.google, AD=true).
 * Wer die Zone bewusst ändert, zieht ZUERST diese Tabelle nach, sonst wird die
 * Änderung als Fremdeingriff gemeldet — genau das ist der Zweck.
 */
export const DNS_SOLL = Object.freeze({
  zone: "smejj.com",
  api: "api.smejj.com",
  nameserver: Object.freeze(["launch1.spaceship.net", "launch2.spaceship.net"]),
  a: Object.freeze(["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"]),
  aaaa: Object.freeze(["2606:50c0:8000::153", "2606:50c0:8001::153", "2606:50c0:8002::153", "2606:50c0:8003::153"]),
  apiCname: "smejj-control.zeabur.app",
  // Seit 23.09. mitbewacht (Betreiber: „nimm cloud und admin in DNS_SOLL auf"). admin ist eine
  // Spaceship-URL-Weiterleitung — ändert Spaceship die Adresse seiner Weiterleitung, meldet das hier Rot.
  cloud: "cloud.smejj.com",
  cloudCname: "smejj-cloud.zeabur.app",
  admin: "admin.smejj.com",
  adminA: Object.freeze(["15.197.162.184"]),
  mx: Object.freeze(["mx1.efwd.spaceship.net", "mx2.efwd.spaceship.net"]),
  caa: Object.freeze(["issue letsencrypt.org"])
});

/** Abstand für den zweiten Blick auf einen gestörten Nameserver. */
export const WIEDERHOLUNG_MS = 10_000;
/** Zeitgrenze je einzelner Abfrage. */
const ABFRAGE_MS = 4_000;
const DOH = "https://dns.google/resolve";

const norm = (liste) => [...new Set((liste || []).map((x) => String(x).toLowerCase().replace(/\.$/, "")))].sort();
const gleich = (a, b) => { const x = norm(a), y = norm(b); return x.length === y.length && x.every((v, i) => v === y[i]); };

/** Ein Resolver mit fester Server-Adresse — austauschbar für Tests. */
function baueResolver(ip) {
  const r = new Resolver({ timeout: ABFRAGE_MS, tries: 1 });
  r.setServers([ip]);
  return r;
}

/**
 * Fragt EINEN Nameserver direkt nach allem, was die Zone tragen muss.
 * Ergebnis ist immer ein Objekt — nie eine Ausnahme; `fehler` trägt den Grund.
 */
export async function frageNameserver(ip, { resolverFabrik = baueResolver } = {}) {
  const begonnen = Date.now();
  const erg = { ip, ok: false, fehler: null, a: [], aaaa: [], cname: [], cloudCname: [], adminA: [], mx: [], caa: [], ms: 0 };
  try {
    const r = resolverFabrik(ip);
    erg.a = await r.resolve4(DNS_SOLL.zone);
    erg.aaaa = await r.resolve6(DNS_SOLL.zone).catch(() => []);
    erg.cname = await r.resolveCname(DNS_SOLL.api);
    // Fehlt einer der beiden, ist das eine Soll-Abweichung, kein gestörter Nameserver.
    erg.cloudCname = await r.resolveCname(DNS_SOLL.cloud).catch(() => []);
    erg.adminA = await r.resolve4(DNS_SOLL.admin).catch(() => []);
    erg.mx = (await r.resolveMx(DNS_SOLL.zone)).map((m) => m.exchange);
    erg.caa = (await r.resolveCaa(DNS_SOLL.zone)).map((c) => (c.issue ? `issue ${c.issue}` : c.issuewild ? `issuewild ${c.issuewild}` : JSON.stringify(c)));
    erg.ok = true;
  } catch (fehler) {
    erg.fehler = String(fehler?.code || fehler?.message || fehler).slice(0, 60);
  }
  erg.ms = Date.now() - begonnen;
  return erg;
}

/**
 * Fragt Google-DNS über HTTPS. `ad` ist der DNSSEC-Nachweis (Authenticated Data).
 * Status 0 = NOERROR; 2 = SERVFAIL (so sah der Ausfall vom 21.09. aus).
 */
export async function frageDoh(name, typ, { fetchImpl = fetch } = {}) {
  const begonnen = Date.now();
  try {
    const antwort = await fetchImpl(`${DOH}?name=${encodeURIComponent(name)}&type=${typ}`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6_000)
    });
    const j = await antwort.json();
    const typNr = j?.Question?.[0]?.type;
    const daten = (j?.Answer || []).filter((a) => typNr == null || a.type === typNr).map((a) => a.data);
    return { ok: j?.Status === 0 && daten.length > 0, status: j?.Status, ad: j?.AD === true, daten, ms: Date.now() - begonnen, fehler: null };
  } catch (fehler) {
    return { ok: false, status: null, ad: false, daten: [], ms: Date.now() - begonnen, fehler: String(fehler?.message || fehler).slice(0, 60) };
  }
}

/** Vergleicht einen Ist-Stand (a/aaaa/cname/cloudCname/adminA/mx/caa) mit DNS_SOLL. Leere Liste = alles wie eingefroren. */
export function vergleicheSoll(ist) {
  const ab = [];
  if (!gleich(ist.a, DNS_SOLL.a)) ab.push(`A ${norm(ist.a).join(",") || "—"} statt ${DNS_SOLL.a.join(",")}`);
  if (ist.aaaa?.length && !gleich(ist.aaaa, DNS_SOLL.aaaa)) ab.push(`AAAA ${norm(ist.aaaa).join(",")}`);
  if (!gleich(ist.cname, [DNS_SOLL.apiCname])) ab.push(`api.smejj.com → ${norm(ist.cname).join(",") || "—"} statt ${DNS_SOLL.apiCname}`);
  if (!gleich(ist.cloudCname, [DNS_SOLL.cloudCname])) ab.push(`cloud.smejj.com → ${norm(ist.cloudCname).join(",") || "—"} statt ${DNS_SOLL.cloudCname}`);
  if (!gleich(ist.adminA, DNS_SOLL.adminA)) ab.push(`admin.smejj.com A ${norm(ist.adminA).join(",") || "—"} statt ${DNS_SOLL.adminA.join(",")}`);
  if (!gleich(ist.mx, DNS_SOLL.mx)) ab.push(`MX ${norm(ist.mx).join(",") || "—"}`);
  if (!gleich(ist.caa, DNS_SOLL.caa)) ab.push(`CAA ${norm(ist.caa).join(",") || "—"}`);
  return ab;
}

/**
 * Das Urteil — rein, ohne Netz, damit kranke UND gesunde Lagen testbar sind.
 * @param {{netzOk: boolean, udpMoeglich: boolean, nameserver: Array, doh: object, dohApi: object, abweichungen: string[]}} lage
 */
export function beurteile({ netzOk, udpMoeglich, nameserver = [], doh, dohApi, abweichungen = [] }) {
  if (!netzOk) return { ok: true, stufe: "unklar", meldung: "Netz-Takt abgewartet — der Server erreicht gerade selbst kein DNS, Auflösung wird im nächsten Lauf gemessen" };
  const gestoert = nameserver.filter((n) => !n.ok);
  const nsText = nameserver.map((n) => `${n.ip}: ${n.ok ? `${n.ms} ms` : n.fehler}`).join(", ");
  if (!doh?.ok) {
    return { ok: false, stufe: "rot", meldung: `smejj.com ist bei Google-DNS NICHT auflösbar (Status ${doh?.status ?? doh?.fehler ?? "?"}) — Besucher erreichen die App nicht; Nameserver: ${nsText || "nicht gemessen"}` };
  }
  if (doh.ad !== true) {
    return { ok: false, stufe: "rot", meldung: "DNSSEC-Kette von smejj.com gebrochen (Google-DNS liefert ohne AD) — prüfende DNS-Dienste verwerfen bald ALLE Antworten; DS-Eintrag und Schlüssel beim Anbieter prüfen" };
  }
  if (udpMoeglich && nameserver.length && gestoert.length === nameserver.length) {
    return { ok: false, stufe: "rot", meldung: `BEIDE Nameserver von smejj.com antworten nicht (${nsText}) — öffentliche DNS-Dienste liefern nur noch aus dem Zwischenspeicher (TTL 30 min), danach ist smejj.com weg` };
  }
  if (abweichungen.length) {
    return { ok: false, stufe: "rot", meldung: `Zone smejj.com weicht vom eingefrorenen Soll ab: ${abweichungen.join(" · ")} — fremde Änderung oder bewusste Umstellung (dann DNS_SOLL nachziehen)` };
  }
  if (!dohApi?.ok) {
    return { ok: false, stufe: "rot", meldung: `api.smejj.com ist bei Google-DNS nicht auflösbar (Status ${dohApi?.status ?? "?"}) — Chat und Anmeldung erreichen den Server nicht` };
  }
  const hinweise = [];
  if (gestoert.length) hinweise.push(`HINWEIS: ein Nameserver gestört (${gestoert.map((n) => `${n.ip}: ${n.fehler}`).join(", ")}) — Auflösung geht noch über den zweiten`);
  if (!udpMoeglich) hinweise.push("HINWEIS: Nameserver vom Server aus nicht einzeln messbar (UDP/53 gesperrt) — Urteil nur über Google-DNS");
  const gesund = nameserver.filter((n) => n.ok);
  const kopf = `Nameserver ${gesund.length}/${nameserver.length} antworten${gesund.length ? ` (${gesund.map((n) => `${n.ms} ms`).join(", ")})` : ""}, Google-DNS Status 0 mit DNSSEC, Zone = Soll (4 A, 4 AAAA, 3 CNAME/A, 2 MX, CAA)`;
  return { ok: true, stufe: hinweise.length ? "hinweis" : "gruen", meldung: [kopf, ...hinweise].join("; ") };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Proben, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const ns = (ok, ip = "1.1.1.1") => ({ ip, ok, fehler: ok ? null : "ETIMEOUT", ms: 60 });
  const dohGut = { ok: true, status: 0, ad: true, daten: [...DNS_SOLL.a] };
  const gesund = beurteile({ netzOk: true, udpMoeglich: true, nameserver: [ns(true), ns(true, "2.2.2.2")], doh: dohGut, dohApi: { ok: true, status: 0 }, abweichungen: [] });
  if (!gesund.ok || gesund.stufe !== "gruen") fehler.push("die gesunde Lage muss grün sein");
  if (beurteile({ netzOk: true, udpMoeglich: true, nameserver: [ns(false), ns(false, "2.2.2.2")], doh: dohGut, dohApi: { ok: true }, abweichungen: [] }).ok) fehler.push("zwei tote Nameserver müssen rot sein");
  if (beurteile({ netzOk: true, udpMoeglich: true, nameserver: [ns(true), ns(true, "2.2.2.2")], doh: { ok: false, status: 2, ad: false, daten: [] }, dohApi: { ok: true }, abweichungen: [] }).ok) fehler.push("SERVFAIL bei Google-DNS muss rot sein");
  if (beurteile({ netzOk: true, udpMoeglich: true, nameserver: [ns(true), ns(true, "2.2.2.2")], doh: { ...dohGut, ad: false }, dohApi: { ok: true }, abweichungen: [] }).ok) fehler.push("fehlendes AD (DNSSEC) muss rot sein");
  if (beurteile({ netzOk: true, udpMoeglich: true, nameserver: [ns(true), ns(true, "2.2.2.2")], doh: dohGut, dohApi: { ok: true }, abweichungen: ["A 1.2.3.4 statt …"] }).ok) fehler.push("eine Soll-Abweichung muss rot sein");
  const einer = beurteile({ netzOk: true, udpMoeglich: true, nameserver: [ns(true), ns(false, "2.2.2.2")], doh: dohGut, dohApi: { ok: true }, abweichungen: [] });
  if (!einer.ok || einer.stufe !== "hinweis") fehler.push("ein gestörter Nameserver ist ein Hinweis, kein Ausfall");
  if (!beurteile({ netzOk: false }).ok) fehler.push("eigener Netzfehler darf kein Urteil sein");
  const extra = { cloudCname: [DNS_SOLL.cloudCname], adminA: [...DNS_SOLL.adminA] };
  const soll = vergleicheSoll({ a: [...DNS_SOLL.a].reverse(), aaaa: [], cname: [`${DNS_SOLL.apiCname}.`], ...extra, mx: [...DNS_SOLL.mx], caa: [...DNS_SOLL.caa] });
  if (soll.length) fehler.push(`Soll-Vergleich meldet Abweichung, wo keine ist: ${soll.join(" | ")}`);
  if (!vergleicheSoll({ a: ["1.2.3.4"], aaaa: [], cname: [DNS_SOLL.apiCname], ...extra, mx: DNS_SOLL.mx, caa: DNS_SOLL.caa }).length) fehler.push("eine fremde A-Adresse muss als Abweichung gelten");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt (alle 30 min mit dem Läufer). Alle Außenweltzugriffe sind
 * austauschbar: fetchImpl (Google-DoH), resolverFabrik (Nameserver), schlaf.
 */
export async function laufDnsWache({ mitNetz = true, fetchImpl = fetch, resolverFabrik = baueResolver, wiederholAbstandMs = WIEDERHOLUNG_MS, schlaf = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!mitNetz) return { ok: true, meldung: "Netz-Takt abgewartet — Auflösung wird im nächsten Lauf gemessen" };
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `DNS-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };

  // Netz-Kontrolle: erreicht der Server Google-DNS überhaupt? Sonst kein Urteil.
  const kontrolle = await frageDoh("dns.google", "A", { fetchImpl });
  if (!kontrolle.ok) return { ok: true, meldung: `Netz-Takt abgewartet — dns.google nicht erreichbar (${kontrolle.fehler || `Status ${kontrolle.status}`}), Auflösung wird im nächsten Lauf gemessen` };

  // Adressen der Nameserver (über DoH, damit die Messung nicht an derselben Zone hängt).
  const nsAdressen = [];
  for (const ns of DNS_SOLL.nameserver) {
    const a = await frageDoh(ns, "A", { fetchImpl });
    if (a.ok && a.daten[0]) nsAdressen.push(a.daten[0]);
  }
  // UDP-Kontrolle: kann der Server DNS-Server direkt fragen? (Zeabur könnte 53 sperren.)
  let udpMoeglich = true;
  try { const r = resolverFabrik("8.8.8.8"); await r.resolve4("dns.google"); } catch { udpMoeglich = false; }

  let nameserver = [];
  if (udpMoeglich && nsAdressen.length) {
    nameserver = await Promise.all(nsAdressen.map((ip) => frageNameserver(ip, { resolverFabrik })));
    if (nameserver.some((n) => !n.ok)) {
      await schlaf(wiederholAbstandMs); // zweiter Blick
      nameserver = await Promise.all(nameserver.map((n) => (n.ok ? n : frageNameserver(n.ip, { resolverFabrik }))));
    }
  }

  const doh = await frageDoh(DNS_SOLL.zone, "A", { fetchImpl });
  const dohApi = await frageDoh(DNS_SOLL.api, "A", { fetchImpl });
  // Soll-Ist: vom ersten gesunden Nameserver, sonst über Google-DNS (A/AAAA/CNAME/MX/CAA).
  let ist = nameserver.find((n) => n.ok);
  if (!ist) {
    const [aaaa, cname, cloud, admin, mx, caa] = await Promise.all([
      frageDoh(DNS_SOLL.zone, "AAAA", { fetchImpl }), frageDoh(DNS_SOLL.api, "CNAME", { fetchImpl }),
      frageDoh(DNS_SOLL.cloud, "CNAME", { fetchImpl }), frageDoh(DNS_SOLL.admin, "A", { fetchImpl }),
      frageDoh(DNS_SOLL.zone, "MX", { fetchImpl }), frageDoh(DNS_SOLL.zone, "CAA", { fetchImpl })
    ]);
    ist = { a: doh.daten, aaaa: aaaa.daten, cname: cname.daten, cloudCname: cloud.daten, adminA: admin.daten, mx: mx.daten.map((m) => String(m).split(/\s+/).pop()), caa: caa.daten.map((c) => String(c).replace(/^\d+\s+/, "").replace(/"/g, "")) };
  }
  const abweichungen = doh.ok ? vergleicheSoll(ist) : [];
  const urteil = beurteile({ netzOk: true, udpMoeglich, nameserver, doh, dohApi, abweichungen });
  return { ok: urteil.ok, meldung: `Selbsttest 9/9; ${urteil.meldung}` };
}
