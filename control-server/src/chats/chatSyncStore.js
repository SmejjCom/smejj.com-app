// smejj.com — Verlauf-Sync Stufe 3 (docs/verlauf-pro-konto-plan.md).
//
// Zweck: Der Chat-Verlauf soll dem KONTO folgen, nicht dem Geraet — wie bei
// Claude/ChatGPT. Ablage: IDrive e2 unter `chats/<userId>/<chatId>.json`.
//
// Drei Grundsaetze, die hier alles bestimmen:
//
// 1. FAIL-CLOSED UND AUS. Ohne `SMEJJ_CHAT_SYNC_ENABLED=1` passiert nichts.
//    Chats sind Nutzerinhalte; sie verlassen das Geraet erst, wenn der Betreiber
//    das ausdruecklich einschaltet (und die Datenschutzerklaerung das deckt).
// 2. DER SERVER GLAUBT DEM CLIENT NICHT. userId kommt IMMER aus der geprueften
//    Sitzung, nie aus dem Datensatz. Sonst koennte ein Aufrufer in fremde
//    Ablagen schreiben — genau die Trennung, die Stufe 2 lokal hergestellt hat.
// 3. GRENZEN VOR SPEICHERPLATZ. Zu grosse oder zu viele Chats werden abgewiesen
//    bzw. gekappt, damit ein Endlos-Verlauf keine Kosten treibt.

import { signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";
import {
  baueIndex,
  eintraegeMitZeit,
  indexEintragSetzen,
  indexIstFrisch,
  indexSchluessel,
  istIndexSchluessel,
  leseIndex
} from "./chatIndex.js";

export const PRAEFIX = "chats";
// 500 seit 2026-08-23 (Betreiber-Freigabe): am Betreiberkonto lagen 126 Dateien,
// die Grenze von 100 schnitt 26 Chats serverseitig ab. Der Index haelt auch
// 500 Eintraege in EINEM Abruf (~60 KB); der Vollpfad bleibt bei 8 parallel.
// Muss mit MAX_CHATS in public/chat-store.js uebereinstimmen — der Client
// raeumt sonst lokal weg, was der Server gerade geliefert hat.
export const MAX_CHATS_PRO_KONTO = 500;
export const MAX_CHAT_BYTES = 512 * 1024; // ein Chat mit 8 Fassungen bleibt klar darunter
// S3-Schreibwege ohne Zeitlimit scheitern STILL (Befund 2026-08-xx, S3-Timeout).
export const S3_TIMEOUT_MS = 2500;

export function syncAktiv(env = process.env) {
  return /^(1|true|yes|on)$/i.test(String(env.SMEJJ_CHAT_SYNC_ENABLED || ""));
}

export function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

// Aus der Sitzung eine stabile, dateisystem-sichere Kontokennung machen.
//
// BEFUND 2026-08-15 (A-bis-Z-Pruefung, Runde 3): Hier stand
//   `user_${email.replace(/[^a-z0-9]+/g, "_")}`
// Diese Regel ist NICHT EINDEUTIG. Jedes Sonderzeichen wurde zu "_", und damit
// landeten verschiedene, unabhaengig registrierbare Konten im GLEICHEN Ordner:
//
//   max.mustermann@example.com  ─┐
//   max-mustermann@example.com   ├─> alle: chats/user_max_mustermann_example_com/
//   max_mustermann@example.com   │
//   max+mustermann@example.com  ─┘
//
// Wer sich mit der Bindestrich-Schreibweise anmeldete, las und ueberschrieb die
// Gespraeche desjenigen mit der Punkt-Schreibweise. Das ist keine theoretische
// Kollision: bei jedem Anbieter mit freier Adresswahl sind das verschiedene
// Postfaecher, und der Angreifer sucht sich die passende Variante selbst aus.
//
// Gefunden, bevor es Schaden anrichten konnte: der Sync steht fail-closed
// hinter SMEJJ_CHAT_SYNC_ENABLED und war nie eingeschaltet. Deshalb gibt es
// keinen Datenbestand und BEWUSST KEINEN Rueckfall auf die alte Regel — ein
// Rueckfall wuerde genau das Leck offenhalten, das hier geschlossen wird.
//
// Die neue Regel bildet ueber SHA-256 ab. Das bringt zweierlei:
//   1. Eindeutig. Zwei verschiedene Adressen ergeben nie denselben Ordner.
//   2. Die E-Mail-Adresse steht nicht mehr im Ablagepfad. Wer die Dateiliste
//      des Eimers sieht, sieht keine Postfaecher mehr — Datenminimierung, ohne
//      dass es etwas kostet.
//
// Zuordnung bleibt moeglich: Aus der Adresse laesst sich der Ordner jederzeit
// nachrechnen (fuer Support und DSGVO-Auskunft reicht genau das).
//
// 128 Bit (32 Hex-Zeichen) — bei dieser Menge ist eine Kollision
// ausgeschlossen, und der Pfad bleibt kurz.
import { createHash } from "node:crypto";

export function kontoKennung(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (email) return `user_${createHash("sha256").update(`email:${email}`).digest("hex").slice(0, 32)}`;
  const id = String(user?.sub || user?.userId || "").trim();
  return id ? `user_${createHash("sha256").update(`id:${id}`).digest("hex").slice(0, 32)}` : "";
}

// Chat-Kennungen kommen vom Client. Alles, was nicht wie eine Kennung aussieht,
// wird abgewiesen — ein "../" darin waere ein Weg in fremde Ablagen.
export function chatKennungGueltig(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || ""));
}

export function schluessel(kontoId, chatId) {
  return `${PRAEFIX}/${kontoId}/${chatId}.json`;
}

/**
 * Pruefen, ob ein eingehender Chat gespeichert werden darf.
 * Reine Funktion — der Test braucht keinen Speicher.
 * @returns {{ok: true, chat: object} | {ok: false, error: string}}
 */
export function pruefeChat(roh, { maxBytes = MAX_CHAT_BYTES } = {}) {
  if (!roh || typeof roh !== "object") return { ok: false, error: "chat_ungueltig" };
  if (!chatKennungGueltig(roh.id)) return { ok: false, error: "chat_id_ungueltig" };
  if (!Array.isArray(roh.messages)) return { ok: false, error: "nachrichten_fehlen" };
  const updatedAt = String(roh.updatedAt || "");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return { ok: false, error: "zeitstempel_ungueltig" };
  const groesse = Buffer.byteLength(JSON.stringify(roh), "utf8");
  if (groesse > maxBytes) return { ok: false, error: "chat_zu_gross" };
  return { ok: true, chat: roh };
}

/**
 * Wer gewinnt bei einem Konflikt? Der juengere Stand.
 * Gleichstand heisst: nichts tun — sonst schreiben zwei Geraete sich gegenseitig
 * im Kreis, ohne dass sich etwas aendert.
 * @returns {"neu"|"server"|"gleich"}
 */
export function konfliktSieger(neuUpdatedAt, serverUpdatedAt) {
  const a = Date.parse(String(neuUpdatedAt || "")) || 0;
  const b = Date.parse(String(serverUpdatedAt || "")) || 0;
  if (a > b) return "neu";
  if (b > a) return "server";
  return "gleich";
}

/** Legt einen Chat ab (nur wenn er juenger ist als der gespeicherte Stand). */
export async function speichereChat({ kontoId, chat, env = process.env, fetchImpl = fetch }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  const key = schluessel(kontoId, chat.id);
  let vorhanden = null;
  try {
    const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    if (antwort?.body) vorhanden = JSON.parse(antwort.body);
  } catch { vorhanden = null; }
  if (vorhanden && konfliktSieger(chat.updatedAt, vorhanden.updatedAt) !== "neu") {
    return { ok: true, uebersprungen: true, grund: "server_ist_neuer" };
  }
  await signedS3Put({
    ...cfg,
    key,
    body: `${JSON.stringify({ ...chat, ownerId: kontoId }, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
    fetchImpl,
    timeoutMs: S3_TIMEOUT_MS
  });
  // NACH der Chat-Datei, nie davor: der Index soll juenger sein als jeder Chat,
  // sonst haelt ihn `indexIstFrisch` zu Recht fuer veraltet.
  await indexNachtragen({ cfg, kontoId, chat: { ...chat, ownerId: kontoId }, fetchImpl });
  return { ok: true, key };
}

/** Holt alle Chats eines Kontos, juengste zuerst. */
/**
 * Nimmt einem Chat die Nachrichten ab und haengt ihre Anzahl an.
 *
 * GEMESSEN 2026-08-19: `/api/chats` lieferte 2,50 MB fuer 88 Chats, weil jeder
 * Eintrag sein komplettes `messages`-Feld mitschleppte — bei JEDEM Seitenaufruf,
 * ungecacht. Das waren 65 % des Seitengewichts und brach Static-First: der
 * Control Server stand damit im Pfad jedes normalen Aufrufs.
 *
 * Der Verlaufs-Abgleich braucht die Nachrichten dafuer gar nicht. Er vergleicht
 * `updatedAt` und holt nur, was wirklich neuer ist. Alles andere war bezahlte
 * Bandbreite fuer eine Verwerfung.
 */
/**
 * Nur das, was der Abgleich zum ENTSCHEIDEN braucht: drei Felder.
 *
 * GEMESSEN 2026-08-20: die schlanke Liste war immer noch 42 KB bei 88 Chats
 * (~490 Byte je Eintrag) — Titel, Projekt, Modell, Marken und Zeitstempel
 * reisen mit, obwohl `pull()` in chat-sync.js sie nie ansieht. Es liest
 * genau `id` (welcher Chat), `updatedAt` (ist er neuer?) und `ownerId`
 * (gehoert er diesem Konto? — gehoertNutzer). Alles andere wird verworfen,
 * nachdem es bezahlt wurde.
 *
 * Der VOLLE Chat kommt ohnehin einzeln nach, sobald einer wirklich neuer ist.
 */
export function nurAbgleichsfelder(chat) {
  return {
    id: chat?.id,
    updatedAt: chat?.updatedAt,
    ...(chat?.ownerId ? { ownerId: chat.ownerId } : {})
  };
}

export function ohneNachrichten(chat) {
  const { messages, ...rest } = chat || {};
  return { ...rest, nachrichtenAnzahl: Array.isArray(messages) ? messages.length : 0 };
}

/** Einen einzelnen Chat vollstaendig laden — inklusive Nachrichten. */
export async function ladeChat({ kontoId, chatId, env = process.env, fetchImpl = fetch }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", chat: null };
  if (!chatKennungGueltig(chatId)) return { ok: false, error: "chat_id_ungueltig", chat: null };
  try {
    const antwort = await signedS3Get({
      ...cfg, key: schluessel(kontoId, chatId), allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS
    });
    if (!antwort?.body) return { ok: true, chat: null };
    return { ok: true, chat: JSON.parse(antwort.body) };
  } catch (error) {
    return { ok: false, error: String(error?.message || "lesen_fehlgeschlagen").slice(0, 160), chat: null };
  }
}

/**
 * Schreibt den Konto-Index. Fehler sind bewusst still.
 *
 * Der Index ist ein Beschleuniger, keine Quelle. Geht sein Schreiben schief,
 * ist er beim naechsten Lesen aelter als eine Chat-Datei — `indexIstFrisch`
 * merkt das und baut ihn neu. Ein fehlgeschlagener Index darf niemals einen
 * Chat-Upload scheitern lassen: der Chat ist die Nutzlast, der Index nur das
 * Inhaltsverzeichnis.
 */
async function schreibeIndex({ cfg, kontoId, eintraege, fetchImpl }) {
  try {
    await signedS3Put({
      ...cfg,
      key: indexSchluessel(PRAEFIX, kontoId),
      body: `${JSON.stringify({ version: baueIndex([]).version, chats: eintraege }, null, 2)}\n`,
      contentType: "application/json; charset=utf-8",
      fetchImpl,
      timeoutMs: S3_TIMEOUT_MS
    });
    return true;
  } catch { return false; }
}

/**
 * Traegt einen Chat in den Index nach — nach jedem Upload und jedem Grabstein.
 *
 * Liest den vorhandenen Index, setzt den einen Eintrag und schreibt zurueck.
 * Ist der Index unlesbar oder fehlt er, wird hier NICHTS gebaut: der Neubau
 * gehoert in den Lesepfad, wo ohnehin alle Chats vorliegen. Hier waere er ein
 * zweiter, teurer Rundlauf im Upload.
 */
async function indexNachtragen({ cfg, kontoId, chat, fetchImpl }) {
  try {
    const antwort = await signedS3Get({
      ...cfg, key: indexSchluessel(PRAEFIX, kontoId), allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS
    });
    const vorhanden = antwort?.body ? leseIndex(antwort.body) : null;
    if (!vorhanden) return false;
    return await schreibeIndex({ cfg, kontoId, eintraege: indexEintragSetzen(vorhanden, chat), fetchImpl });
  } catch { return false; }
}

export async function ladeChats({ kontoId, env = process.env, fetchImpl = fetch, limit = MAX_CHATS_PRO_KONTO, nurListe = false, nurAbgleich = false }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", chats: [] };
  const prefix = `${PRAEFIX}/${kontoId}/`;
  const indexKey = indexSchluessel(PRAEFIX, kontoId);
  let schluesselListe = [];
  let objekte = [];
  try {
    const { body } = await signedS3List({ ...cfg, prefix, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    // Schluessel wie bisher aus den <Key>-Elementen. Bewusst NICHT aus
    // `eintraegeMitZeit` abgeleitet: das braucht vollstaendige <Contents>-
    // Bloecke, und wo die fehlen, waere plotzlich die ganze Liste leer statt
    // nur der schnelle Weg nicht verfuegbar. Die Nutzlast haengt nie an einer
    // Beschleunigung.
    // Der Index liegt im selben Ordner und darf NIE als Chat gelesen werden —
    // "_index" waere eine gueltige Chat-Kennung. Aussortiert am Schluessel,
    // und zwar fuer JEDEN Lesepfad, auch den alten Vertrag.
    schluesselListe = [...String(body || "").matchAll(/<Key>([^<]+)<\/Key>/g)]
      .map((treffer) => treffer[1])
      .filter((key) => key && !istIndexSchluessel(key));
    // Zeiten nur fuer die Frische-Pruefung des Index.
    objekte = eintraegeMitZeit(body);
  } catch (error) {
    return { ok: false, error: String(error?.message || "liste_fehlgeschlagen").slice(0, 160), chats: [] };
  }

  // DER SCHNELLE WEG (2026-08-20): Wenn nur der Abgleich gefragt ist und der
  // Index nachweislich juenger ist als jede Chat-Datei, genuegt EIN Abruf statt
  // einem je Chat. Live gemessen waren das 92 Abrufe und rund 2,5 MB aus dem
  // Objektspeicher, um 15 KB auszuliefern.
  // Faellt irgendetwas daran aus — Index fehlt, ist kaputt, ist aelter, oder der
  // Abruf schlaegt fehl — wird unten regulaer alles gelesen. Der Index ist ein
  // Beschleuniger, nie eine zweite Wahrheit.
  if (nurAbgleich && indexIstFrisch(objekte, indexKey)) {
    try {
      const antwort = await signedS3Get({ ...cfg, key: indexKey, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
      const eintraege = antwort?.body ? leseIndex(antwort.body) : null;
      // VOLLSTAENDIGKEIT (2026-08-23): Der Index wurde einst aus den damals 100
      // gekappten Chats gebaut und wuchs danach nur durch Nachtragen — fuenf
      // gueltige Chats fehlten dauerhaft, obwohl er nach Zeit "frisch" war.
      // Zaehlt er weniger Eintraege als die Liste Dateien, ist er unvollstaendig
      // und wird unten aus allen Chats neu gebaut. Beide Zahlen stammen aus
      // derselben Objektliste, kostet also keinen weiteren Abruf.
      const erwartet = Math.min(schluesselListe.length, limit);
      if (eintraege && eintraege.length >= erwartet) {
        eintraege.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return { ok: true, chats: eintraege.slice(0, limit), ausIndex: true };
      }
    } catch { /* faellt auf den regulaeren Weg zurueck */ }
  }
  // NEBENLAEUFIG statt nacheinander (Betreiber-Auftrag 2026-08-20,
  // Startseiten-Gewicht). Die Schleife holte jede Chat-Datei EINZELN und
  // wartete jedes Mal auf die Rundreise zum Objektspeicher: live gemessen
  // 88 Chats = 10,9 s, in denen die Startseite auf ihre Liste wartete.
  // Die Rundreisen ueberlappen jetzt (derselbe Helfer wie Audit-Log und
  // Freigaben, Grenze 8 — der Control-Server hat 2 vCPU).
  //
  // Verhalten bleibt gleich: mapMitGrenze haelt die Reihenfolge der Eingaben
  // ein und liefert bei einem Fehler `null` an dieser Stelle, statt den
  // ganzen Lauf zu kippen — genau das tat das leere catch vorher auch.
  const rohe = await mapMitGrenze(schluesselListe.slice(0, limit), async (key) => {
    const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl, timeoutMs: S3_TIMEOUT_MS });
    return antwort?.body ? JSON.parse(antwort.body) : null;
  });
  const chats = rohe.filter(Boolean);
  chats.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  // `nurListe` ist bewusst opt-in: ein alter Client, der noch im Browser-Cache
  // liegt, bekommt weiterhin die vollen Chats. Wuerde die Liste einfach duenner,
  // importierte er Chats OHNE Nachrichten und ueberschriebe damit seinen eigenen
  // Verlauf — ein Datenverlust, ausgeloest von einem Performance-Fix.
  // Drei Stufen, jede strikt opt-in — ein alter Client aus dem Browser-Cache
  // darf NIE weniger bekommen, als seine Fassung erwartet (sonst importiert er
  // Chats ohne Nachrichten ueber seinen eigenen Verlauf: Datenverlust,
  // ausgeloest von einem Performance-Fix).
  //   ohne Parameter  -> volle Chats            (aeltester Vertrag)
  //   nurListe=1      -> Liste ohne Nachrichten (~42 KB bei 88 Chats)
  //   nurAbgleich=1   -> nur id/updatedAt/ownerId
  if (nurAbgleich) {
    // Alles gelesen — dann kostet der Index nur noch das Schreiben, und der
    // naechste Aufruf kommt mit einem Abruf aus. Genau HIER gehoert der Neubau
    // hin: die Chats liegen ohnehin vor.
    await schreibeIndex({ cfg, kontoId, eintraege: baueIndex(chats).chats, fetchImpl });
    return { ok: true, chats: chats.map(nurAbgleichsfelder) };
  }
  return { ok: true, chats: nurListe ? chats.map(ohneNachrichten) : chats };
}

/**
 * "Loescht" einen Chat serverseitig — als GRABSTEIN, nicht als S3-Delete.
 *
 * Zwei Gruende, live gemessen 2026-08-13:
 * 1. Der e2-Schluessel des Control-Servers darf nicht loeschen (DELETE → 403).
 * 2. Wichtiger: Ein hartes Loeschen wuerde die Loeschung NICHT verbreiten.
 *    Geraet B haelt den Chat noch lokal und wuerde ihn beim naechsten Push
 *    wieder hochladen — der geloeschte Chat kaeme als Untoter zurueck.
 *    Der Grabstein gewinnt stattdessen ueber updatedAt gegen jeden aelteren
 *    Push (konfliktSieger) und traegt die Loeschung per Pull auf alle Geraete.
 * Inhalt wird dabei WIRKLICH entfernt: der Grabstein hat keine Nachrichten.
 */
export async function loescheChat({ kontoId, chatId, env = process.env, fetchImpl = fetch, jetztMs = Date.now() }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  const grabstein = {
    id: chatId,
    ownerId: kontoId,
    geloescht: true,
    updatedAt: new Date(jetztMs).toISOString(),
    messages: []
  };
  await signedS3Put({
    ...cfg,
    key: schluessel(kontoId, chatId),
    body: `${JSON.stringify(grabstein, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
    fetchImpl,
    timeoutMs: S3_TIMEOUT_MS
  });
  // Auch der Grabstein gehoert in den Index — sonst traegt er weiter den alten
  // Zeitstempel, und die Loeschung erreicht das zweite Geraet nie.
  await indexNachtragen({ cfg, kontoId, chat: grabstein, fetchImpl });
  return { ok: true, grabstein: true };
}
