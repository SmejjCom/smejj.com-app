// smejj.com — Adminbereich Stufe 14: schreibende Routen fuer Modelle.
//
// Drei Aktionen, in aufsteigender Schwere:
//   schalten     — Modell an/aus. Umkehrbar, aendert nur eine Absichtsmarke.
//   schluessel   — Anbieter-Schluessel ersetzen. Umkehrbar durch erneutes Setzen.
//   loeschen     — Gewichte aus e2 entfernen. NICHT umkehrbar.
//
// Der Ablauf ist fuer jede derselbe (wie in adminWriteRoutes.js):
//   1. Rolle frisch aus dem Store — nie aus dem Token.
//   2. Recht pruefen.
//   3. Grund ist Pflicht.
//   4. Ausfuehren.
//   5. Audit-Eintrag mit VORHER und NACHHER.
//
// Warum "schalten" nur eine Marke schreibt und nicht in den Motor greift: die
// Motoren sind von hier aus nicht erreichbar (Mac 2 haengt hinter smee.io, der
// Draht geht nur in eine Richtung). Der Server legt die Absicht in e2 ab, die
// Motoren holen sie sich im selben Takt wie ihr Lebenszeichen. Ein Aufruf, den
// der Server nicht zustellen kann, waere ein Knopf, der nur so tut.
//
// Und warum das Loeschen die hoechste Huerde hat: die Gewichte kommen ueber
// eine gemessene 1-MB/s-Leitung zurueck. 704 GB sind gut 200 Stunden. Ein
// Fehlklick kostet hier mehr als jede andere Aktion im Adminbereich.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { signedS3List, signedS3Put, signedS3Delete } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";
import { modellbestandUebersicht } from "../admin/opsModellbestand.js";
import { putProviderCredential } from "../providers/providerCredentialVault.js";

const PREFIX = "/api/admin/modelle";
const gate = createRateLimiter({ capacity: 20, refillPerSec: 0.3, maxKeys: 5_000 });

/** Wo die Absichtsmarken liegen. Die Motoren lesen denselben Pfad. */
const SCHALT_PRAEFIX = "admin/modelle/schaltung/";

/** Grundlaengen. Loeschen verlangt mehr, weil es nicht umkehrbar ist. */
const GRUND_MIN = 10;
const GRUND_MIN_LOESCHEN = 20;

/** Sicherheitsnetz: mehr Objekte als das loescht diese Route nicht am Stueck. */
const LOESCH_GRENZE = 2000;

export async function handleAdminModellRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const aktion = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  if (!["schalten", "loeschen", "schluessel"].includes(aktion)) return false;

  if (req.method !== "POST") {
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed", hinweis: "Diese Aktionen sind POST." });
    return true;
  }

  const resolved = await resolveAdminActor(req.authUser, { env });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;

  const limit = gate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const body = await readJson(req).catch(() => ({}));
  try {
    if (aktion === "schalten") return await schalten(req, res, actor, body, env), true;
    if (aktion === "loeschen") return await loeschen(req, res, actor, body, env), true;
    return await schluesselErsetzen(req, res, actor, body, env), true;
  } catch (fehler) {
    privateJson(res, 500, { ok: false, error: "modell_aktion_fehlgeschlagen", hinweis: String(fehler?.message || fehler) });
    return true;
  }
}

// ---------------------------------------------------------------- schalten

async function schalten(req, res, actor, body, env) {
  const verweigert = rechtPruefen(res, actor, "models.write");
  if (verweigert) return;

  const id = String(body.id || "").trim();
  const an = body.an === true;
  const grund = grundLesen(res, body, GRUND_MIN);
  if (!id) return privateJson(res, 400, { ok: false, error: "modell_id_fehlt" });
  if (grund === null) return;

  const modell = await modellSuchen(env, id);
  if (!modell) return privateJson(res, 404, { ok: false, error: "modell_unbekannt", id });

  // Ein Modell einzuschalten, das kein Motor laden kann, ergibt eine gruene
  // Marke und trotzdem keine Antwort. Lieber hier abweisen als spaeter raten.
  if (an && !modell.motorId) {
    return privateJson(res, 409, {
      ok: false,
      error: "kein_motor",
      hinweis: `Kein eingetragener Motor kann ${modell.name} laden. Erst einen Motor anbinden.`
    });
  }

  const cfg = eimerConfig(env, env.IDRIVE_E2_BUCKET);
  if (!cfg) return privateJson(res, 503, { ok: false, error: "e2_zugang_fehlt" });

  const marke = {
    id,
    aktiv: an,
    gesetztVon: actor.email,
    gesetztAm: new Date().toISOString(),
    grund
  };
  const geschrieben = await signedS3Put({
    ...cfg,
    key: `${SCHALT_PRAEFIX}${dateiName(id)}`,
    body: JSON.stringify(marke, null, 2),
    contentType: "application/json"
  });
  if (!geschrieben?.ok) return privateJson(res, 503, { ok: false, error: "schaltung_nicht_gespeichert" });

  const spur = await appendAuditEntry({
    actor,
    action: an ? "modell.an" : "modell.aus",
    target: id,
    before: { zustand: modell.zustand },
    after: { aktiv: an },
    reason: grund,
    ip: clientIp(req)
  }, { env });

  return privateJson(res, 200, {
    ok: true,
    id,
    aktiv: an,
    spur: spur?.ok !== false,
    // Ehrlich sagen, dass es nicht sofort wirkt: der Motor holt die Marke im
    // Takt seines Lebenszeichens. Wer hier "erledigt" liest und in zehn
    // Sekunden das Gegenteil sieht, glaubt der Seite beim naechsten Mal nicht.
    hinweis: `Vermerkt. Der Motor uebernimmt es beim naechsten Lebenszeichen — bis zu einer Minute.`
  });
}

// ---------------------------------------------------------------- loeschen

async function loeschen(req, res, actor, body, env) {
  const verweigert = rechtPruefen(res, actor, "models.write");
  if (verweigert) return;

  const id = String(body.id || "").trim();
  const grund = grundLesen(res, body, GRUND_MIN_LOESCHEN,
    "Loeschen ist nicht umkehrbar — mindestens 20 Zeichen Begruendung.");
  if (!id) return privateJson(res, 400, { ok: false, error: "modell_id_fehlt" });
  if (grund === null) return;

  const modell = await modellSuchen(env, id);
  if (!modell) return privateJson(res, 404, { ok: false, error: "modell_unbekannt", id });

  // Zeilen, die nur ein Motor gemeldet hat, tragen KEINEN Pfad. Ohne diese
  // Schranke liefe die Suche mit leerem Praefix — und loeschte im schlimmsten
  // Fall den halben Eimer. Aufgefallen am 08.09. auf dem Live-Bildschirm:
  // ornith-1.0-9b stand dort mit Loeschen-Knopf und "Groesse: —".
  if (!modell.pfad) {
    return privateJson(res, 409, {
      ok: false,
      error: "kein_pfad",
      hinweis: `${modell.name} ist nur eine Meldung des Motors, keine Datei in den hier gelesenen Eimern.`
        + " Es gibt nichts zu loeschen."
    });
  }

  const cfg = eimerConfig(env, eimerName(env, modell.eimer));
  if (!cfg) return privateJson(res, 503, { ok: false, error: "e2_zugang_fehlt" });

  const schluessel = await alleSchluessel(cfg, modell.pfad);
  if (schluessel.length === 0) {
    return privateJson(res, 409, { ok: false, error: "nichts_zu_loeschen", pfad: modell.pfad });
  }
  // Mehr als das ist kein normaler Modellordner. Lieber abbrechen als einen
  // falsch geratenen Praefix ausraeumen.
  if (schluessel.length > LOESCH_GRENZE) {
    return privateJson(res, 409, {
      ok: false,
      error: "zu_viele_objekte",
      anzahl: schluessel.length,
      hinweis: `Mehr als ${LOESCH_GRENZE} Objekte unter ${modell.pfad}. Das wird nicht automatisch geloescht.`
    });
  }

  const ergebnisse = await mapMitGrenze(schluessel, async (key) => {
    try {
      const weg = await signedS3Delete({ ...cfg, key });
      return weg?.ok !== false;
    } catch {
      return false;
    }
  }, 4);
  const geloescht = ergebnisse.filter(Boolean).length;
  const uebrig = schluessel.length - geloescht;

  const spur = await appendAuditEntry({
    actor,
    action: "modell.loeschen",
    target: id,
    before: { pfad: modell.pfad, dateien: schluessel.length, groesseBytes: modell.groesseBytes },
    after: { geloescht, uebrig },
    reason: grund,
    ip: clientIp(req)
  }, { env });

  // Teilerfolg ist KEIN Erfolg. Bleiben Reste liegen, steht das in der Antwort:
  // ein halb geloeschter Modellordner sieht in der Liste aus wie ein
  // abgebrochener Download und kostet weiter Speichergebuehr.
  return privateJson(res, uebrig === 0 ? 200 : 207, {
    ok: uebrig === 0,
    id,
    pfad: modell.pfad,
    geloescht,
    uebrig,
    spur: spur?.ok !== false,
    hinweis: uebrig === 0
      ? `${geloescht} Datei(en) geloescht.`
      : `${geloescht} geloescht, ${uebrig} blieben liegen. Aktion wiederholen.`
  });
}

// -------------------------------------------------------------- schluessel

async function schluesselErsetzen(req, res, actor, body, env) {
  // Einen Schluessel HINTERLEGEN ist naeher am Ausstellen als am Widerrufen:
  // wer ihn setzt, oeffnet einen bezahlten Zugang. Deshalb apikeys.issue.
  const verweigert = rechtPruefen(res, actor, "apikeys.issue");
  if (verweigert) return;

  const zugangId = String(body.zugangId || "").trim().toLowerCase();
  const schluessel = String(body.schluessel || "").trim();
  const konto = String(body.konto || actor.email || "").trim().toLowerCase();
  const grund = grundLesen(res, body, GRUND_MIN);
  if (!zugangId) return privateJson(res, 400, { ok: false, error: "zugang_fehlt" });
  if (schluessel.length < 8) return privateJson(res, 400, { ok: false, error: "schluessel_zu_kurz" });
  if (grund === null) return;

  const abgelegt = await putProviderCredential(konto, zugangId, {
    apiKey: schluessel,
    aktualisiertAm: new Date().toISOString(),
    aktualisiertVon: actor.email
  }, env);
  if (!abgelegt?.ok) return privateJson(res, 503, { ok: false, error: "schluessel_nicht_gespeichert" });

  // Im Audit steht NIE der Schluessel, auch nicht gekuerzt — nur dass einer
  // gesetzt wurde. Das Audit-Log ist fuer mehr Augen lesbar als der Tresor.
  const spur = await appendAuditEntry({
    actor,
    action: "modell.schluessel.ersetzen",
    target: `${konto}:${zugangId}`,
    before: { gesetzt: true },
    after: { gesetzt: true, laenge: schluessel.length },
    reason: grund,
    ip: clientIp(req)
  }, { env });

  return privateJson(res, 200, {
    ok: true,
    zugangId,
    konto,
    spur: spur?.ok !== false,
    hinweis: "Schluessel verschluesselt abgelegt. Geprueft wird er beim naechsten Aufruf des Anbieters."
  });
}

// ------------------------------------------------------------------ Helfer

function rechtPruefen(res, actor, recht) {
  if (can(actor.role, recht) === GRANT.allow) return false;
  privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
  return true;
}

/** Gibt den Grund zurueck oder null, wenn schon geantwortet wurde. */
function grundLesen(res, body, min, hinweis) {
  const grund = String(body.reason || body.grund || "").trim();
  if (grund.length >= min) return grund;
  privateJson(res, 400, {
    ok: false,
    error: "admin_reason_required",
    hinweis: hinweis || `Mindestens ${min} Zeichen.`
  });
  return null;
}

/** Sucht das Modell im aktuellen Bestand. Nur was dort steht, wird angefasst. */
async function modellSuchen(env, id) {
  const bestand = await modellbestandUebersicht({ env });
  return (bestand.modelle || []).find((m) => m.id === id) || null;
}

async function alleSchluessel(cfg, praefix) {
  const gesammelt = [];
  let token = null;
  do {
    const antwort = await signedS3List({ ...cfg, prefix: praefix, continuationToken: token });
    const xml = typeof antwort === "string" ? antwort : (antwort?.body ?? "");
    for (const treffer of String(xml).matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      if (treffer[1]) gesammelt.push(treffer[1]);
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(String(xml))
      ? ((String(xml).match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || null)
      : null;
  } while (token && gesammelt.length <= LOESCH_GRENZE);
  return gesammelt;
}

function eimerName(env, art) {
  if (art === "modell") return env.IDRIVE_E2_MODEL_BUCKET || env.IDRIVE_E2_DEPLOY_BUCKET || env.IDRIVE_E2_BUCKET;
  return env.IDRIVE_E2_BUCKET;
}

function eimerConfig(env, bucket) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function dateiName(id) {
  return `${String(id).replace(/[^A-Za-z0-9._-]+/g, "-")}.json`;
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}
