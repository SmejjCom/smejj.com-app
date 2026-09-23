// muuny.com — Start des Web-Dienstes.
//
// Umgebung:
//   MUUNY_WEB_SITZUNG_SCHLUESSEL  Pflicht, >= 32 Zeichen (signiert das Sitzungs-Cookie)
//   MUUNY_WEB_PFEFFER             Pflicht, >= 32 Zeichen (pseudonyme Nutzerkennung)
//   MUUNY_WEB_RESEND_KEY          optional: ohne ihn keine Anmeldung (ehrliches 503)
//   MUUNY_WEB_ABSENDER            Standard "muuny <code@muuny.com>"
//   MUUNY_AUTOPILOT_URL           Standard http://muuny-autopilot:8080
//   MUUNY_DIENST_SCHLUESSEL       Pflicht fuer Einwilligung/Lernpaare
//   MUUNY_LAUFZEIT_URL            Standard http://muuny-laufzeit:8090
//   MUUNY_LAUFZEIT_SCHLUESSEL     Pflicht fuer den Chat
//   MUUNY_DATENSCHUTZ_SHA256      muss zur ausgelieferten datenschutz.html passen
//   PORT                          Standard 8098
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resendVersand } from "./anmeldung.js";
import { baueWeb, ladeSeiten } from "./web.js";

const env = process.env;
const log = (...a) => console.log(new Date().toISOString(), "[muuny-web]", ...a);
const ordner = path.join(path.dirname(fileURLToPath(import.meta.url)), "oeffentlich");
const { seiten, datenschutzSha256 } = await ladeSeiten(ordner);
const erwartet = String(env.MUUNY_DATENSCHUTZ_SHA256 || "").trim();
if (erwartet && erwartet !== datenschutzSha256) log("WARNUNG: MUUNY_DATENSCHUTZ_SHA256 passt nicht zur ausgelieferten Fassung — Einwilligung bleibt gesperrt");

const behandle = baueWeb({
  seiten, datenschutzSha256, erwarteteDatenschutzSha: erwartet,
  sitzungSchluessel: String(env.MUUNY_WEB_SITZUNG_SCHLUESSEL || ""), pfeffer: String(env.MUUNY_WEB_PFEFFER || ""),
  versand: resendVersand({ schluessel: String(env.MUUNY_WEB_RESEND_KEY || "").trim(), absender: env.MUUNY_WEB_ABSENDER || undefined }),
  autopilot: { url: env.MUUNY_AUTOPILOT_URL || "http://muuny-autopilot:8080", dienstSchluessel: String(env.MUUNY_DIENST_SCHLUESSEL || "") },
  laufzeit: { url: env.MUUNY_LAUFZEIT_URL || "http://muuny-laufzeit:8090", schluessel: String(env.MUUNY_LAUFZEIT_SCHLUESSEL || "") },
  protokoll: { log }
});

const server = http.createServer((req, res) => behandle(req, res).catch((f) => {
  log("Fehler", f?.message);
  if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" }); res.end('{"ok":false,"grund":"intern"}'); }
  else res.end();
}));
server.requestTimeout = 0; // Antworten auf dem Prozessor koennen Minuten dauern; der Stream haelt die Leitung.
server.headersTimeout = 30_000;
const hafen = Number(env.PORT) > 0 ? Number(env.PORT) : 8098;
server.listen(hafen, "0.0.0.0", () => log(`lauscht auf ${hafen}, Datenschutz ${datenschutzSha256?.slice(0, 12)}`));
for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => server.close(() => process.exit(0)));
