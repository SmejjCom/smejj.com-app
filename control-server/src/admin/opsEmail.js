// smejj.com — Modul V: E-Mail-Zustellung (Single Responsibility: kommt die Post an).
//
// "Der Link kommt nicht an" ist der haeufigste Supportfall ueberhaupt. Dieses
// Modul beantwortet ihn so weit, wie es ehrlich geht — und sagt klar, wo es
// aufhoert.
//
// ES GIBT KEIN ZUSTELLPROTOKOLL.
//
// `sendAuthMail` liefert zwar `{sent, reason}` zurueck, aber niemand schreibt
// das weg. Ob eine einzelne Mail angekommen ist, ob sie abgewiesen wurde oder
// im Spam liegt, weiss dieses System nicht. Eine Ansicht, die eine
// Zustellquote zeigt, muesste sie erfinden.
//
// Gezeigt werden deshalb zwei Dinge, die wirklich messbar sind:
//
//   1. IST DER VERSAND UEBERHAUPT EINGERICHTET? Ohne vollstaendige
//      SMTP-Konfiguration verschickt smejj.com fail-closed gar nichts — dann
//      kommt kein Link an, und zwar bei allen. Das ist die erste Frage.
//   2. WIE VIELE KONTEN HAENGEN UNBESTAETIGT? Das ist der beste verfuegbare
//      Hinweis: wer sich registriert und nie bestaetigt, hat den Link entweder
//      ignoriert — oder nie bekommen. Haeufen sich junge Faelle, stimmt etwas
//      mit dem Versand nicht.
//
// Kein Passwort und kein SMTP-Benutzer verlassen dieses Modul. Von den
// Zugangsdaten wird ausschliesslich gemeldet, OB sie gesetzt sind.
import { mailerConfig } from "../auth/mailer.js";
import { leseZustellungen } from "../auth/mailDeliveryLog.js";
import { readUserIndex } from "./userIndex.js";

const TAG_MS = 24 * 60 * 60 * 1000;

export const NICHT_ERFASST = Object.freeze([
  { was: "Abweisungen (Bounces)", warum: "Dafuer braeuchte es einen Rueckkanal vom Anbieter, den es nicht gibt." },
  { was: "Spam-Einstufung", warum: "Weiss nur das Postfach der Empfaengerin, nie der Absender." },
  { was: "Oeffnungen und Klicks", warum: "Wird bewusst nicht gemessen — das waere Nachverfolgung ohne Anlass." }
]);

export async function emailUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  leseIndex = readUserIndex,
  leseProtokoll = null
} = {}) {
  const cfg = sichereKonfiguration(env);
  const versand = cfg
    ? {
      eingerichtet: true,
      server: cfg.host,
      port: cfg.port,
      verschluesselung: cfg.implicitTls ? "TLS ab Verbindungsaufbau (465)" : "STARTTLS (587)",
      absender: cfg.from,
      // Nur die Tatsache, nie der Wert.
      zugangsdatenGesetzt: true
    }
    : {
      eingerichtet: false,
      zugangsdatenGesetzt: false,
      folge: "Ohne vollstaendige SMTP-Angaben verschickt smejj.com fail-closed gar keine Mail. "
        + "Dann kommt kein Bestaetigungslink an — bei allen."
    };

  const [index, protokoll] = await Promise.all([
    sicher(() => leseIndex({ env })),
    sicher(() => (leseProtokoll || standardProtokoll)({ env, jetztMs }))
  ]);
  const konten = kontenLage(index, jetztMs);
  const versandprotokoll = protokollLage(protokoll);

  return {
    ok: true,
    versand,
    konten,
    versandprotokoll,
    nichtErfasst: {
      punkte: NICHT_ERFASST,
      hinweis: "Seit dem 29.07.2026 wird festgehalten, ob eine Mail den Server VERLASSEN hat. "
        + "Ob sie beim Empfaenger ankam oder im Spam landete, weiss smejj.com weiterhin nicht — "
        + "dafuer gibt es keinen Rueckkanal."
    },
    bewertung: bewerte(versand, konten, versandprotokoll),
    gemessenAm: new Date(jetztMs).toISOString()
  };
}

function kontenLage(index, jetztMs) {
  if (!index?.ok) return { erreichbar: false, grund: index?.error || "unbekannt" };

  const alle = Array.isArray(index.entries) ? index.entries : [];
  const offen = alle.filter((e) => e.emailVerified !== true && e.status === "active");
  const mitAlter = offen.map((e) => {
    const erstelltMs = e.createdAt ? Date.parse(e.createdAt) : NaN;
    return {
      email: e.email,
      seitTagen: Number.isFinite(erstelltMs) ? Math.max(0, Math.floor((jetztMs - erstelltMs) / TAG_MS)) : null,
      erstelltAm: e.createdAt || null
    };
  }).sort((a, b) => (b.seitTagen ?? -1) - (a.seitTagen ?? -1));

  // Junge Faelle sind das interessante Signal: haeufen sie sich, stimmt gerade
  // etwas nicht. Alte Faelle sind meist einfach verlorene Registrierungen.
  const jung = mitAlter.filter((e) => (e.seitTagen ?? 99) <= 1).length;
  return {
    erreichbar: true,
    gesamt: alle.length,
    unbestaetigt: offen.length,
    unbestaetigtHeuteOderGestern: jung,
    aeltesteTage: mitAlter.length ? mitAlter[0].seitTagen : null,
    liste: mitAlter.slice(0, 20)
  };
}

async function standardProtokoll({ env, jetztMs }) {
  return leseZustellungen({ env, jetztMs, tage: 14, limit: 100 });
}

function protokollLage(protokoll) {
  if (!protokoll?.ok) return { erreichbar: false, grund: protokoll?.error || "unbekannt" };
  return {
    erreichbar: true,
    zeitraumTage: protokoll.zeitraumTage,
    versendet: protokoll.total,
    verlassen: protokoll.zugestellt,
    gescheitert: protokoll.fehlgeschlagen,
    aufbewahrungTage: protokoll.aufbewahrungTage,
    // Kopfdaten je Versand. Der Mailtext wurde nie gespeichert.
    letzte: (protokoll.eintraege || []).slice(0, 20).map((e) => ({
      am: e.am, empfaenger: e.empfaenger, betreff: e.betreff || null,
      verlassen: e.zugestellt === true, grund: e.grund || null
    }))
  };
}

function bewerte(versand, konten, protokoll) {
  if (!versand.eingerichtet) {
    return "Der Versand ist NICHT eingerichtet — es geht keine einzige Mail hinaus. "
      + "Solange das so ist, kann sich niemand neu bestaetigen.";
  }
  // Das Protokoll ist der harte Nachweis und schlaegt jeden Hinweis aus dem
  // Verzeichnis: gescheiterte Versuche sind gemessen, nicht gefolgert.
  if (protokoll?.erreichbar && protokoll.gescheitert > 0) {
    return `${protokoll.gescheitert} von ${protokoll.versendet} Mails der letzten `
      + `${protokoll.zeitraumTage} Tage haben den Server NICHT verlassen. Das ist gemessen, `
      + "nicht gefolgert — der Grund steht bei jedem Eintrag.";
  }
  if (!konten.erreichbar) return "Versand eingerichtet. Das Verzeichnis ist gerade nicht lesbar.";
  if (konten.unbestaetigt === 0) return "Versand eingerichtet, kein Konto haengt unbestaetigt.";

  // Der Satz muss zur Kachel passen. Eine Schwelle darf "wenige" nicht in
  // "keine" verwandeln — live stand einmal "keines davon frisch" neben einer
  // Kachel, die 2 frische zeigte. Ein Bildschirm, der sich selbst
  // widerspricht, ist schlimmer als einer, der schweigt.
  const frisch = konten.unbestaetigtHeuteOderGestern || 0;
  if (frisch >= 3) {
    return `${frisch} Konten aus den letzten 24 Stunden sind unbestaetigt. `
      + "Das kann Zufall sein — oder der Versand kommt nicht durch.";
  }
  const frischText = frisch === 0
    ? "keines davon aus den letzten 24 Stunden"
    : `${frisch} davon aus den letzten 24 Stunden`;

  // Haengen ALLE aktiven Konten unbestaetigt, ist das kein Einzelfall mehr.
  if (konten.gesamt > 0 && konten.unbestaetigt === konten.gesamt) {
    const nachweis = protokoll?.erreichbar && protokoll.versendet > 0
      ? ` Alle ${protokoll.versendet} Mails der letzten ${protokoll.zeitraumTage} Tage haben den `
        + "Server verlassen — das Problem liegt also nach dem Versand, nicht davor."
      : "";
    return `Versand eingerichtet, aber ALLE ${konten.gesamt} aktiven Konten sind unbestaetigt `
      + `(${frischText}). Bei jedem einzelnen Konto ist der Link nie bestaetigt worden — `
      + `das spricht eher fuer ein Zustellproblem als fuer Zufall.${nachweis}`;
  }
  return `Versand eingerichtet. ${konten.unbestaetigt} von ${konten.gesamt} aktiven Konten `
    + `unbestaetigt, ${frischText}.`;
}

function sichereKonfiguration(env) {
  try {
    return mailerConfig(env);
  } catch {
    return null;
  }
}

async function sicher(aufgabe) {
  try {
    return await aufgabe();
  } catch (error) {
    return { ok: false, error: String(error?.message || "fehler").slice(0, 120) };
  }
}
