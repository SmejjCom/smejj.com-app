// smejj.com — Code-Sicherung nach IDrive e2 (Nr. 85).
//
// WARUM ES SIE GIBT (2026-09-08): Die Sicherung des CODE hing an genau einem
// Faden, und der ist gerissen. Die GitHub Action "Code-Sicherung nach
// Codeberg" lief seit dem 05.09. jeden Tag rot — Secret CODEBERG_TOKEN fehlt,
// "es wurde NICHTS gesichert" — und niemand sah es, weil ein
// fehlgeschlagener Cron-Lauf still bleibt. Der Ersatz, ein Termin auf dem Mac
// des Betreibers, sichert wieder; er laeuft aber nur, wenn dieser Mac laeuft.
//
// Nr. 46 sichert die BETRIEBSDATEN nach e2 und schreibt dort im Kopf: "Der
// Codeberg-Spiegel (Nr. 02) sichert jede Nacht den CODE". Genau dieser Satz
// stimmte wochenlang nicht mehr. Dieser Lauf macht ihn wieder wahr — an dem
// Ort, den die Architektur ohnehin dafuer vorsieht (IDrive e2 als
// Hauptspeicher fuer Backups, Releases, Rollbacks).
//
// WARUM AUSGERECHNET HIER und nicht wieder als GitHub Action: Jeder Weg von
// GitHub nach draussen braucht ein Geheimnis in den GitHub-Secrets, und das
// darf nur der Betreiber hinterlegen. Der Control-Server hat die
// e2-Zugangsdaten laengst — er ist der einzige Ort, der ohne ein einziges
// neues Geheimnis sichern kann. Und er laeuft rund um die Uhr.
//
// GRENZEN, ehrlich benannt:
//   * Gesichert wird der Deploy-Zweig als Archiv, nicht die Historie. Wer
//     einen alten Stand sucht, findet ihn bei GitHub und Codeberg; hier liegt
//     der Rettungsanker fuer den Fall, dass beide Git-Anbieter ausfallen.
//   * Es wird NICHTS geloescht. Der Daten-Lock verlangt fuer jede Loeschung
//     eine schriftliche Freigabe, und fuer diesen Praefix gibt es keine. Ein
//     Schnappschuss kostet rund 9 MB, ein Jahr also gut 3 GB — tragbar, aber
//     es waechst. Eine Aufbewahrungsfrist ist eine Betreiber-Entscheidung.
//   * Der Schnappschuss liegt im Haupt-Eimer unter eigenem Praefix. Gegen den
//     Verlust des ganzen Eimers schuetzt er nicht — dieselbe Grenze wie bei
//     Nr. 46, und aus demselben Grund (ein zweiter Eimer braucht einen
//     zweiten Schluessel).
import crypto from "node:crypto";
import { signedS3Put, signedS3List, parseS3Keys } from "../storage/s3Signer.js";

/** Der Zweig, aus dem Zeabur baut — der Stand, der live ist. */
export const DEPLOY_ZWEIG = "feature/auth-redesign-github-magiclink";
export const QUELL_REPO = "SmejjCom/smejj.com-app";
export const PRAEFIX = "sicherung/code";

// Der Download lag am 08.09. bei 8,6 MB in 22 s. Die Frist ist bewusst
// grosszuegig: sie soll einen haengenden Abruf beenden, nicht einen langsamen
// bestrafen. (Lehre "Frist am GUTEN Fall bemessen" — eine zu knappe Frist
// kostet den ganzen Lauf, eine grosszuegige kostet nichts.)
const ABRUF_FRIST_MS = 180_000;

// EIGENE FRIST FUER DEN UPLOAD (zweimal gemessen am 2026-09-08):
//   1. signedS3Put arbeitet standardmaessig mit 2,5 Sekunden — richtig fuer die
//      kleinen JSON-Datensaetze, fuer die es gebaut wurde, und viel zu knapp
//      fuer 9 MB. Der erste echte Lauf scheiterte genau daran ("aborted due to
//      timeout"); auf dem Server waere er jeden Tag still an derselben Stelle
//      gescheitert.
//   2. Die naechste Fassung mit 180 s scheiterte WIEDER — von einem
//      Wohnanschluss aus brauchte allein 1 MB 29,5 Sekunden, die vollen 9 MB
//      also ueber vier Minuten. Im Rechenzentrum ist derselbe Upload
//      Sekundensache.
// Zehn Minuten sind darum bewusst grosszuegig: die Frist soll einen HAENGENDEN
// Upload beenden, nicht einen langsamen bestrafen. Sie kostet nichts, solange
// nichts haengt — eine zu knappe Frist kostet die ganze Sicherung.
const UPLOAD_FRIST_MS = 600_000;

// Ein Archiv, das viel zu klein ist, ist kein Archiv, sondern eine
// Fehlerseite. Ein viel zu grosses ist ein Zeichen, dass hier etwas anderes
// liegt als erwartet — beides soll auffallen, statt still gesichert zu werden.
const MIN_BYTES = 1_000_000;
const MAX_BYTES = 200_000_000;

/** Der Schluessel EINES Tages. Ein Schnappschuss je Tag, mehr nicht. */
export function tagesSchluessel(jetztIso) {
  return `${PRAEFIX}/smejj.com-app_${String(jetztIso).slice(0, 10)}.tar.gz`;
}

/**
 * Urteilt ueber ein geladenes Archiv, bevor es gespeichert wird.
 * Rein und ohne Netz — damit der TUEV kranke UND gesunde Proben durchspielen
 * kann, ohne GitHub zu fragen.
 * @returns {{brauchbar: boolean, grund: string}}
 */
export function bewerteArchiv(bytes, laenge) {
  if (!Number.isFinite(laenge) || laenge <= 0) {
    return { brauchbar: false, grund: "leere Antwort" };
  }
  if (laenge < MIN_BYTES) {
    return { brauchbar: false, grund: `nur ${laenge} Bytes — das ist kein Archiv, eher eine Fehlerseite` };
  }
  if (laenge > MAX_BYTES) {
    return { brauchbar: false, grund: `${laenge} Bytes — unerwartet gross, lieber nachsehen als blind sichern` };
  }
  // gzip beginnt immer mit 1f 8b. Ein HTML-Fehlertext von GitHub taete das
  // nie, koennte aber zufaellig gross genug sein.
  if (!bytes || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return { brauchbar: false, grund: "kein gzip-Archiv (falscher Dateikopf)" };
  }
  return { brauchbar: true, grund: `${laenge} Bytes, gueltiges gzip` };
}

/**
 * Vergleicht die eigene Pruefsumme mit dem, was der Speicher zurueckmeldet.
 * Ein einfaches PUT beantwortet IDrive e2 mit dem MD5 des Inhalts als ETag —
 * das ist die Gegenprobe der ANDEREN Seite und damit mehr wert als jede
 * Zusicherung des Absenders.
 *
 * Fehlt das ETag, gilt das NICHT als Beweis, aber auch nicht als Fehler:
 * gemeldet wird "unbestaetigt". Ein Backup, das nie zurueckgelesen wurde, ist
 * eine Hoffnung — eines, das faelschlich als geprueft gilt, ist schlimmer.
 * @returns {"bestaetigt"|"abweichung"|"unbestaetigt"}
 */
export function vergleicheEtag(eigenesMd5, etagVomSpeicher) {
  const fremd = String(etagVomSpeicher || "").replace(/"/g, "").trim().toLowerCase();
  if (!fremd) return "unbestaetigt";
  // Mehrteilige Uploads tragen ein Suffix wie "-3" und sind kein MD5.
  if (fremd.includes("-")) return "unbestaetigt";
  return fremd === String(eigenesMd5).toLowerCase() ? "bestaetigt" : "abweichung";
}

function eimerKonfig(env = process.env) {
  const { IDRIVE_E2_ENDPOINT: endpoint, IDRIVE_E2_ACCESS_KEY: accessKey, IDRIVE_E2_SECRET_KEY: secretKey, IDRIVE_E2_BUCKET: bucket } = env;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

/** Liegt der heutige Schnappschuss schon? Spart 9 MB Abruf je Takt. */
async function schonGesichert(cfg, schluessel, listImpl) {
  const { response, body } = await listImpl({ ...cfg, prefix: `${PRAEFIX}/` });
  if (!response?.ok) return { bekannt: false, anzahl: 0 };
  const keys = parseS3Keys(body);
  return { bekannt: keys.includes(schluessel), anzahl: keys.length };
}

async function ladeArchiv(url, fetchImpl) {
  const antwort = await fetchImpl(url, {
    signal: AbortSignal.timeout(ABRUF_FRIST_MS),
    headers: { "User-Agent": "smejj.com-code-sicherung" },
    redirect: "follow"
  });
  if (!antwort.ok) throw new Error(`GitHub antwortete ${antwort.status}`);
  return Buffer.from(await antwort.arrayBuffer());
}

/**
 * Nr. 85, der Lauf im Takt: hoechstens einmal am Tag ein Archiv des
 * Deploy-Zweiges nach e2 legen, und die Ablage die Pruefsumme bestaetigen
 * lassen. In allen uebrigen Takten meldet er nur den Stand — der Abruf
 * unterbleibt dann ganz.
 *
 * Der Lauf wirft nie: ein Sicherungs-Autopilot, der den Taktgeber mitreisst,
 * waere schlimmer als der Ausfall, den er verhindern soll.
 */
export async function laufCodeSicherung({
  env = process.env,
  jetztMs = Date.now(),
  fetchImpl = fetch,
  putImpl = signedS3Put,
  listImpl = signedS3List
} = {}) {
  const cfg = eimerKonfig(env);
  if (!cfg) {
    // Lokal ohne Zugangsdaten ist das der Normalfall, kein Fehler.
    return { ok: true, meldung: "Code-Sicherung: kein e2-Zugang gesetzt (lokal) — nichts zu tun." };
  }

  const jetztIso = new Date(jetztMs).toISOString();
  const schluessel = tagesSchluessel(jetztIso);

  try {
    const stand = await schonGesichert(cfg, schluessel, listImpl);
    if (stand.bekannt) {
      return { ok: true, meldung: `Code-Sicherung: heutiger Stand liegt bereits in e2 (${stand.anzahl} Schnappschuesse insgesamt).` };
    }

    const url = `https://codeload.github.com/${QUELL_REPO}/tar.gz/refs/heads/${DEPLOY_ZWEIG}`;
    const bytes = await ladeArchiv(url, fetchImpl);
    const urteil = bewerteArchiv(bytes, bytes.length);
    if (!urteil.brauchbar) {
      return { ok: false, meldung: `Code-Sicherung: Archiv verworfen — ${urteil.grund}. Es wurde NICHTS gespeichert.` };
    }

    const md5 = crypto.createHash("md5").update(bytes).digest("hex");
    // ifNoneMatch "*": zwei gleichzeitige Takte koennen sich nicht ueberholen,
    // und ein bestehender Schnappschuss wird nie ueberschrieben.
    const ergebnis = await putImpl({
      ...cfg,
      key: schluessel,
      body: bytes,
      contentType: "application/gzip",
      ifNoneMatch: "*",
      timeoutMs: UPLOAD_FRIST_MS
    });

    if (!ergebnis?.created) {
      return { ok: true, meldung: `Code-Sicherung: heutiger Stand war schon da (Wettlauf sauber abgefangen).` };
    }

    const beweis = vergleicheEtag(md5, ergebnis.etag);
    if (beweis === "abweichung") {
      return { ok: false, meldung: `Code-Sicherung: e2 meldet eine ANDERE Pruefsumme als gesendet (${schluessel}) — der Schnappschuss ist nicht vertrauenswuerdig.` };
    }
    const zusatz = beweis === "bestaetigt" ? "Pruefsumme von e2 bestaetigt" : "Pruefsumme unbestaetigt (kein ETag)";
    return {
      ok: true,
      meldung: `Code-Sicherung: ${(bytes.length / 1048576).toFixed(1)} MB nach e2 gelegt (${schluessel}, ${zusatz}).`
    };
  } catch (fehler) {
    return { ok: false, meldung: `Code-Sicherung fehlgeschlagen: ${String(fehler?.message || fehler).slice(0, 160)}` };
  }
}
