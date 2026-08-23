// smejj.com — Zertifikats-Wache (Autopilot Nr. 49): misst die Restlaufzeit
// der TLS-Zertifikate der ausgelieferten Domains — BEVOR der Browser eine
// rote Warnseite zeigt.
//
// Ein abgelaufenes Zertifikat ist ein Totalausfall mit Ansage: das Ablauf-
// datum steht Wochen vorher fest, niemand schaut hin. Diese Wache schaut hin.
//
// Gemessen wird per echtem TLS-Handshake (node:tls), nicht per HTTP: uns
// interessiert das Zertifikat, nicht die Antwort dahinter. GRENZE, ehrlich:
// Domain-REGISTRIERUNG (Ablauf beim Registrar) ist ohne WHOIS-Zugang nicht
// messbar — wenn die Domain ausläuft, fällt hier vorher trotzdem auf, dass
// kein neues Zertifikat mehr ausgestellt wird.
import tls from "node:tls";

/** Die Domains, an denen Nutzer und Dienste wirklich hängen. */
export const ZERTIFIKAT_ZIELE = Object.freeze([
  "smejj.com",
  "api.smejj.com",
  "smejj-control.zeabur.app",
  "smejj-chat-bridge.zeabur.app"
]);

/** Unter dieser Restlaufzeit wird die Ampel rot. Let's Encrypt erneuert bei 30. */
export const WARN_TAGE = 21;

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Bewertet gemessene Restlaufzeiten. Getrennt von jedem Netz, damit der
 * Selbsttest kaputte UND gesunde Werte prüfen kann.
 *
 * @param {Array<{domain: string, tageRest: number|null, fehler?: string}>} messungen
 */
export function bewerteLaufzeiten(messungen = [], { warnTage = WARN_TAGE } = {}) {
  const probleme = [];
  for (const m of messungen) {
    if (m.fehler) { probleme.push(`${m.domain}: ${m.fehler}`); continue; }
    if (!Number.isFinite(m.tageRest)) { probleme.push(`${m.domain}: Restlaufzeit nicht lesbar`); continue; }
    if (m.tageRest < warnTage) probleme.push(`${m.domain}: Zertifikat läuft in ${m.tageRest} Tag(en) ab`);
  }
  return { ok: probleme.length === 0, probleme };
}

/** Selbsttest: knappe Frist und toter Handshake MÜSSEN auffallen, gesunde nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = bewerteLaufzeiten([
    { domain: "bald-tot.example", tageRest: 5 },
    { domain: "nicht-erreichbar.example", tageRest: null, fehler: "Handshake gescheitert" }
  ]);
  if (kaputt.ok || kaputt.probleme.length !== 2) fehler.push(`kaputte Werte: ${kaputt.probleme.length}/2 Probleme erkannt`);
  const gesund = bewerteLaufzeiten([
    { domain: "gesund.example", tageRest: 60 },
    { domain: "auch-gesund.example", tageRest: 89 }
  ]);
  if (!gesund.ok) fehler.push("gesunde Werte lösen fälschlich Alarm aus");
  return { bestanden: fehler.length === 0, fehler };
}

/** Ein echter TLS-Handshake gegen eine Domain; liefert die Restlaufzeit in Tagen. */
export function messeZertifikat(domain, { port = 443, timeoutMs = 10_000, verbinde = tls.connect, jetztMs = Date.now() } = {}) {
  return new Promise((resolve) => {
    let fertig = false;
    const ende = (ergebnis) => {
      if (fertig) return;
      fertig = true;
      try { sockel.destroy(); } catch { /* schon zu */ }
      resolve(ergebnis);
    };
    const sockel = verbinde({ host: domain, servername: domain, port, timeout: timeoutMs }, () => {
      try {
        const zert = sockel.getPeerCertificate();
        const bisMs = Date.parse(zert?.valid_to || "");
        if (!Number.isFinite(bisMs)) return ende({ domain, tageRest: null, fehler: "Zertifikat ohne lesbares Ablaufdatum" });
        ende({ domain, tageRest: Math.floor((bisMs - jetztMs) / TAG_MS) });
      } catch (f) {
        ende({ domain, tageRest: null, fehler: String(f?.message || f).slice(0, 60) });
      }
    });
    sockel.on("error", (f) => ende({ domain, tageRest: null, fehler: String(f?.message || f).slice(0, 60) }));
    sockel.on("timeout", () => ende({ domain, tageRest: null, fehler: `Zeitlimit ${Math.round(timeoutMs / 1000)} s` }));
  });
}

/**
 * Der Lauf im Takt: Selbsttest, dann echte Handshakes gegen alle Ziele.
 */
export async function laufZertifikatsWache({ mitNetz = true, ziele = ZERTIFIKAT_ZIELE, messe = messeZertifikat } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Zertifikats-Wache beurteilt bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: "Netz-Takt abgewartet — Zertifikate werden im nächsten Lauf gemessen" };
  }
  const messungen = await Promise.all(ziele.map((domain) => messe(domain)));
  const urteil = bewerteLaufzeiten(messungen);
  if (!urteil.ok) {
    return { ok: false, meldung: `Zertifikats-Problem: ${urteil.probleme.join("; ").slice(0, 160)}` };
  }
  const knappstes = messungen.reduce((min, m) => (m.tageRest < min.tageRest ? m : min));
  return {
    ok: true,
    meldung: `${messungen.length} Domains geprüft, alle Zertifikate gesund — knappstes: ${knappstes.domain} mit ${knappstes.tageRest} Tagen Rest`
  };
}
