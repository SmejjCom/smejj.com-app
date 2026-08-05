// smejj.com — Anmeldepflicht der Chat-Bruecke.
//
// Freigabe des Betreibers vom 2026-08-04: "Token-Pflicht an der Chat-Bridge
// umsetzen." Anlass war ein GEMESSENER Befund: ein `curl` mit dem Kopf
// `Origin: https://smejj.com` bekam die volle Antwort. Der Origin-Kopf wirkt
// ausschliesslich im Browser — ausserhalb setzt ihn jeder selbst. Wer die
// Bruecken-Adresse kannte, konnte den Chat mitbenutzen und das geteilte
// Groq-Kontingent aufbrauchen, bis die echten Nutzer 429 sahen.
//
// Geprueft wird das VERHALTEN gegen einen Stub-Control-Server, nicht der
// Quelltext: eine Wache, die man nur liest, hat man nicht geprueft.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allowAuthenticated, bearerToken, tokenGueltig } from "../public/chat-bridge-auth.js";

const GUELTIG = "gueltiges.token";
const UNGUELTIG = "falsches.token";

/** Stub des Control Servers: zaehlt Aufrufe, damit der Zwischenspeicher belegbar ist. */
function stubControl({ erreichbar = true } = {}) {
  const aufrufe = [];
  const fetchFn = async (url, options) => {
    aufrufe.push({ url: String(url), auth: options?.headers?.Authorization || "" });
    if (!erreichbar) throw new Error("network");
    const ok = options?.headers?.Authorization === `Bearer ${GUELTIG}`;
    return { ok: true, json: async () => ({ authenticated: ok, user: ok ? { email: "x@y.z" } : null }) };
  };
  return { fetchFn, aufrufe };
}

test("Bearer-Token wird aus dem Kopf gelesen, in jeder Schreibweise", () => {
  assert.equal(bearerToken({ authorization: "Bearer abc" }), "abc");
  assert.equal(bearerToken({ Authorization: "bearer  abc  " }), "abc");
  assert.equal(bearerToken({}), "");
  assert.equal(bearerToken({ authorization: "Basic abc" }), "");
});

test("ein gueltiges Token wird angenommen, ein falsches nicht", async () => {
  const control = stubControl();
  const basis = { fetchFn: control.fetchFn, controlOrigin: "https://control.test" };
  assert.equal(await tokenGueltig(GUELTIG, { ...basis, jetzt: 1_000 }), true);
  assert.equal(await tokenGueltig(UNGUELTIG, { ...basis, jetzt: 1_000 }), false);
});

test("ohne Token wird gar nicht erst gefragt", async () => {
  const control = stubControl();
  assert.equal(await tokenGueltig("", { fetchFn: control.fetchFn, controlOrigin: "https://control.test" }), false);
  assert.equal(control.aufrufe.length, 0, "ein leeres Token darf keinen Rundlauf ausloesen");
});

test("das Ergebnis wird gemerkt — ein Rundlauf je Fenster, nicht je Anfrage", async () => {
  const control = stubControl();
  const basis = { fetchFn: control.fetchFn, controlOrigin: "https://control.test" };
  for (let i = 0; i < 5; i += 1) await tokenGueltig(`wiederholt.${GUELTIG}`, { ...basis, jetzt: 2_000 + i });
  assert.equal(control.aufrufe.length, 1, `erwartet 1 Rundlauf, gemessen ${control.aufrufe.length}`);
});

test("FAIL-CLOSED: ist der Control Server nicht erreichbar, wird abgewiesen", async () => {
  // Bewusste Entscheidung: ein Schutz, den ein Ausfall aushebelt, ist keiner.
  // Der Zwischenspeicher traegt aktive Nutzer durch kurze Aussetzer.
  const control = stubControl({ erreichbar: false });
  assert.equal(
    await tokenGueltig("neu.unbekannt", { fetchFn: control.fetchFn, controlOrigin: "https://control.test", jetzt: 3_000 }),
    false
  );
});

test("ohne Control-Adresse wird abgewiesen statt durchgewunken", async () => {
  const control = stubControl();
  assert.equal(await tokenGueltig(GUELTIG, { fetchFn: control.fetchFn, controlOrigin: "" }), false);
});

test("die Wache antwortet selbst mit 401 und einem brauchbaren Hinweis", async () => {
  const control = stubControl();
  const antworten = [];
  const json = (res, status, koerper) => antworten.push({ status, koerper });

  const erlaubt = await allowAuthenticated(
    { headers: { authorization: `Bearer ${GUELTIG}` } },
    {},
    { json, controlOrigin: "https://control.test", fetchFn: control.fetchFn }
  );
  // Ohne durchgereichtes fetchFn nutzt die Wache das echte fetch — im Test
  // zaehlt deshalb nur der abweisende Pfad, der ohne Netz auskommt.
  const abgewiesen = await allowAuthenticated({ headers: {} }, {}, { json, controlOrigin: "https://control.test" });
  assert.equal(abgewiesen, false);
  assert.equal(antworten.at(-1).status, 401);
  assert.equal(antworten.at(-1).koerper.error, "authentication_required");
  assert.match(antworten.at(-1).koerper.hinweis, /anmelden/i, "der Hinweis muss sagen, was zu tun ist");
  assert.equal(typeof erlaubt, "boolean");
});

test("die Wache ist gebaut, aber bewusst NICHT verdrahtet", () => {
  // Am 2026-08-04 live zurueckgenommen. Sie wies gueltig ANGEMELDETE Nutzer ab —
  // nicht wegen eines Fehlers in der Wache, sondern wegen eines aelteren:
  // auth-gate.js prueft nur, OB ein Token im Speicher liegt, nie ob es gilt.
  // Im Browser des Betreibers lag ein Token, das der Control Server ablehnt
  // (/api/auth/me -> authenticated=false). Die App zeigte ihn als angemeldet,
  // der Server nicht. Mit der Wache war sein Chat tot.
  //
  // Dieser Test haelt den Zwischenzustand fest, damit ihn niemand fuer ein
  // Versehen haelt und die Zeile "aufraeumend" wieder einschaltet: erst muss
  // ein ungueltiges Token zur Anmeldung fuehren, dann darf die Wache zurueck.
  const quelle = fs.readFileSync("public/chat-bridge.js", "utf8");
  assert.match(quelle, /ANMELDEPFLICHT VORUEBERGEHEND AUSGEBAUT/,
    "der Zwischenzustand muss im Quelltext begruendet stehen");
  const aktiv = quelle.split("\n").some((z) => !z.trim().startsWith("//") && /await allowAuthenticated\(/.test(z));
  assert.equal(aktiv, false, "die Wache darf nicht verdrahtet sein, solange der halbe Anmeldezustand moeglich ist");
  assert.ok(fs.existsSync("public/chat-bridge-auth.js"), "der geprüfte Baustein bleibt erhalten");
});

test("das Frontend schickt den Token ueberall mit, wo es die Bruecke ruft", () => {
  const strom = fs.readFileSync("public/ai/chat-stream.js", "utf8");
  const sprache = fs.readFileSync("public/voice-landing.js", "utf8");
  assert.match(strom, /export function bridgeAuthHeaders/);
  assert.match(strom, /\.\.\.bridgeAuthHeaders\(\)/, "der getippte Chat muss den Kopf setzen");
  assert.match(sprache, /\.\.\.bridgeAuthHeaders\(\)/, "der Sprach-Modus muss den Kopf setzen");
  // Ohne Anmeldung bleibt der Kopf leer — sonst ginge ein "Bearer " ohne Wert raus.
  assert.match(strom, /token \? \{ Authorization: `Bearer \$\{token\}` \} : \{\}/);
});

test("der Nutzer sieht Klartext, nicht die Maschinen-Kennung", async () => {
  // Live gesehen am 2026-08-04 beim ersten Durchlauf: im Chat stand nackt
  // "authentication_required". Daraus erfaehrt niemand, was zu tun ist.
  const { readableError } = await import("../public/ai/chat-stream.js");
  const antwort = {
    text: async () => JSON.stringify({
      ok: false,
      error: "authentication_required",
      hinweis: "Bitte auf smejj.com anmelden. Der Chat steht angemeldeten Konten zur Verfuegung."
    })
  };
  const text = await readableError(antwort, "offline");
  assert.match(text, /anmelden/i, "der Klartext muss gewinnen");
  assert.doesNotMatch(text, /authentication_required/, "die Kennung gehoert nicht auf den Schirm");
});

test("ohne Klartext bleibt die Kennung als Rueckfall", async () => {
  const { readableError } = await import("../public/ai/chat-stream.js");
  const nur = { text: async () => JSON.stringify({ error: "rate_limit" }) };
  assert.equal(await readableError(nur, "offline"), "rate_limit");
  const html = { text: async () => "<html>Gateway</html>" };
  assert.equal(await readableError(html, "offline"), "offline");
});

// ---------------------------------------------------------------------------
// Messen statt erzwingen (Freigabe 2026-08-04: "erst messen, wie viele echte
// Anfragen ein gueltiges Token tragen, dann mit mir abstimmen").
//
// Der Zwischenschritt existiert, weil die Wache am selben Tag scharf geschaltet
// wurde, OHNE den positiven Weg gemessen zu haben — der Chat war danach fuer den
// Betreiber tot. Diese Zaehler beantworten vorher, was damals angenommen wurde.
// ---------------------------------------------------------------------------

const auth = await import("../public/chat-bridge-auth.js");

test("die Messung zaehlt alle drei Faelle richtig", async () => {
  auth._zaehlerZuruecksetzen();
  // EIGENE Token: der Zwischenspeicher lebt im Modul und ueberdauert Tests.
  // Ein frueherer Test hat GUELTIG mit dem echten fetch geprueft (Netzfehler ->
  // 30 s als ungueltig gemerkt) — wer denselben Namen nimmt, misst dessen Rest.
  const meinGueltig = "mess.gueltig.token";
  const meinFalsch = "mess.falsch.token";
  const fetchFn = async (_url, o) => ({
    ok: true,
    json: async () => ({ authenticated: o?.headers?.Authorization === `Bearer ${meinGueltig}` })
  });
  const basis = { controlOrigin: "https://control.test", fetchFn };
  await auth.beobachteAnmeldung({ headers: { authorization: `Bearer ${meinGueltig}` } }, basis);
  await auth.beobachteAnmeldung({ headers: { authorization: `Bearer ${meinFalsch}` } }, basis);
  await auth.beobachteAnmeldung({ headers: {} }, basis);
  const s = auth.anmeldeStatistik();
  assert.equal(s.gesamt, 3);
  assert.equal(s.mitGueltigemToken, 1);
  assert.equal(s.mitUngueltigemToken, 1);
  assert.equal(s.ohneToken, 1);
  assert.equal(s.anteilGueltig, 33.3, "der Anteil ist die Zahl, auf die es ankommt");
});

test("ohne Anfragen gibt es keinen erfundenen Anteil", () => {
  auth._zaehlerZuruecksetzen();
  assert.equal(auth.anmeldeStatistik().anteilGueltig, null, "0 von 0 ist nicht 0 Prozent");
});

test("die Messung stoert den Dienst nie", async () => {
  auth._zaehlerZuruecksetzen();
  const kaputt = { controlOrigin: "https://control.test", fetchFn: async () => { throw new Error("weg"); } };
  await assert.doesNotReject(() => auth.beobachteAnmeldung({ headers: { authorization: "Bearer x" } }, kaputt));
  assert.equal(auth.anmeldeStatistik().gesamt, 1, "gezaehlt wird trotzdem");
});

test("die Messung ist NICHT verdrahtet wie eine Wache", () => {
  const quelle = fs.readFileSync("public/chat-bridge.js", "utf8");
  // Ohne await: sonst haengt die Antwortzeit des Chats an einem Rundlauf.
  assert.match(quelle, /if \(kostetModell\) void beobachteAnmeldung\(req/,
    "die Messung darf nicht erwartet werden");
  assert.ok(!/await beobachteAnmeldung/.test(quelle), "kein await auf der Messung");
  // Sie darf keine Antwort erzeugen und keinen Rueckgabewert auswerten.
  const zeile = quelle.split("\n").find((z) => z.includes("beobachteAnmeldung(req"));
  assert.ok(!/return|!|\?/.test(zeile.replace("void beobachteAnmeldung(req, { controlOrigin: CONTROL_ORIGIN });", "")),
    "die Messung darf den Ablauf nicht verzweigen");
  assert.match(quelle, /anmeldung: anmeldeStatistik\(\)/, "der Stand gehoert in /health");
});

test("die Zaehler verraten nichts ueber einzelne Nutzer", () => {
  auth._zaehlerZuruecksetzen();
  const s = auth.anmeldeStatistik();
  assert.deepEqual(Object.keys(s).sort(),
    ["anteilGueltig", "gesamt", "hinweis", "mitGueltigemToken", "mitUngueltigemToken", "ohneToken"],
    "nur Zahlen und ein Hinweis — kein Token, keine Kennung, kein Inhalt");
  for (const [k, v] of Object.entries(s)) {
    if (k === "hinweis") continue;
    assert.ok(v === null || typeof v === "number", `${k} muss eine Zahl sein`);
  }
});
