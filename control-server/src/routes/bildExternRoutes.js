// smejj.com — Bild-Erzeugung ueber den EIGENEN Zhipu-Zugang (CogView).
//
// WARUM ES DIESE ROUTE GIBT (2026-08-14, Betreiber: "muss Nano-Banana-/
// Midjourney-Niveau sein"): Der eigene Bild-Maler ist hardware-gedeckelt —
// SD-Turbo auf 2 CPU-Kernen, 512 px, ~46 s, und die Motivtreue schwankt
// (Memory smejj-bildqualitaet-hardware-gedeckelt: "der Engpass ist das MODELL,
// nicht der Server"; SDXL-Turbo passt nachweislich nicht in 8 GB). Gemessen
// 2026-08-14 mit demselben Auftrag: CogView-4 liefert in ~8 s ein 1024er
// Foto, das der Betreiber-Vorgabe entspricht.
//
// WARUM DIE ROUTE HIER LIEGT UND NICHT IN DER BRUECKE — das ist der Kern:
// Der Zhipu-Schluessel steht NUR am Control-Dienst (per Zeabur-API geprueft:
// SMEJJ_LLM_ZHIPU_API_KEY ist dort gesetzt, an der Bruecke nicht). Ihn zur
// Bruecke zu kopieren waere das Eintragen eines API-Schluessels — das darf
// eine Agenten-Sitzung nicht. Also wandert nicht der Schluessel zum Bild,
// sondern der Bildauftrag zum Schluessel: die Bruecke ruft diese Route auf.
// Ergebnis: kein Geheimnis bewegt sich, und es bleibt nichts fuer den
// Betreiber zu tun.
//
// Fail-closed: ohne Schluessel antwortet die Route 503 und die Bruecke faellt
// auf den eigenen Maler zurueck — der Nutzer bekommt immer ein Bild.

// Nur beim Anbieter selbst laden (SSRF-Schutz): die Antwort kam per TLS von
// Zhipu, aber eine fremde Adresse DARIN laden wir trotzdem nicht. Beobachtet
// 2026-08-14: die Bilder liegen auf mfile.z.ai.
export function istAnbieterAdresse(url) {
  try {
    const ziel = new URL(String(url || ""));
    return ziel.protocol === "https:" && /(^|\.)(z\.ai|bigmodel\.cn)$/i.test(ziel.hostname);
  } catch {
    return false;
  }
}

// Erkennt das Bildformat an den Magic Bytes. "" = kein bekanntes Bild.
// NOETIG, nicht hoeflich: gemessen 2026-08-14 liefert der Anbieter eine
// .png-Adresse mit Content-Type image/png — und darin ein JPEG. Wer dem
// Etikett glaubt, schreibt ein falsch deklariertes Bild in den Chat.
export function formatAusBytes(bytes) {
  if (!bytes || bytes.length < 12) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const kopf = String.fromCharCode(...bytes.slice(0, 4));
  const art = String.fromCharCode(...bytes.slice(8, 12));
  if (kopf === "RIFF" && art === "WEBP") return "webp";
  return "";
}

export function createBildExternRoutes({
  env,
  readSession,
  sessionStillValid,
  json,
  readJson,
  fetchImpl = fetch
}) {
  const schluessel = env.SMEJJ_LLM_ZHIPU_API_KEY || "";
  const basis = String(env.SMEJJ_BILD_EXTERN_BASIS || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");
  // Modellname mit Datumsstempel ist Absicht: "cogview-4" allein antwortet mit
  // HTTP 400 "Modell existiert nicht" (gemessen 2026-08-14), die gestempelte
  // Fassung laeuft. Ueber die Umgebung umstellbar, ohne Deploy.
  const modell = env.SMEJJ_BILD_EXTERN_MODELL || "cogview-4-250304";
  const groesse = env.SMEJJ_BILD_EXTERN_GROESSE || "1024x1024";
  const timeoutMs = Number(env.SMEJJ_BILD_EXTERN_TIMEOUT_MS || 60_000);
  const maxProTag = Number(env.SMEJJ_BILD_EXTERN_MAX_PRO_TAG || 200);
  const MAX_PROMPT = 1200;
  // 1024er-JPEG liegt bei 70-250 KB, base64 +33 %. Der Deckel schuetzt den
  // Chat-Verlauf: ein Chat darf 512 KB gross werden (MAX_CHAT_BYTES), sonst
  // verwirft der Sync ihn STILL.
  const MAX_B64 = 1_400_000;

  const zaehler = { tag: "", anzahl: 0 };
  function budgetFrei() {
    const heute = new Date().toISOString().slice(0, 10);
    if (zaehler.tag !== heute) {
      zaehler.tag = heute;
      zaehler.anzahl = 0;
    }
    return zaehler.anzahl < maxProTag;
  }

  /**
   * Malt ein Bild. Liefert { ok: true, format, b64, dauerSek } oder
   * { ok: false, fehler } — nie eine Ausnahme, damit der Aufrufer immer
   * geordnet zurueckfallen kann.
   */
  async function male(prompt) {
    if (!schluessel) return { ok: false, fehler: "extern_nicht_eingerichtet" };
    if (!budgetFrei()) return { ok: false, fehler: `tagesdeckel_${maxProTag}_erreicht` };
    zaehler.anzahl += 1;
    const beginn = Date.now();
    try {
      const antwort = await fetchImpl(`${basis}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modell, prompt: String(prompt).slice(0, MAX_PROMPT), size: groesse }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!antwort.ok) return { ok: false, fehler: `extern_http_${antwort.status}` };
      let daten;
      try {
        daten = await antwort.json();
      } catch {
        return { ok: false, fehler: "extern_antwort_kein_json" };
      }
      const bildUrl = String(daten?.data?.[0]?.url || "");
      if (!bildUrl) return { ok: false, fehler: "extern_ohne_bildadresse" };
      if (!istAnbieterAdresse(bildUrl)) return { ok: false, fehler: "extern_fremde_bildadresse" };
      const laden = await fetchImpl(bildUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!laden.ok) return { ok: false, fehler: `extern_bild_http_${laden.status}` };
      const bytes = new Uint8Array(await laden.arrayBuffer());
      const format = formatAusBytes(bytes);
      if (!format) return { ok: false, fehler: "extern_keine_bilddaten" };
      const b64 = Buffer.from(bytes).toString("base64");
      if (b64.length > MAX_B64) return { ok: false, fehler: `extern_bild_zu_gross_${b64.length}` };
      return { ok: true, format, b64, dauerSek: Math.round((Date.now() - beginn) / 10) / 100 };
    } catch (fehler) {
      return { ok: false, fehler: `extern_netzfehler:${String(fehler?.message || fehler).slice(0, 60)}` };
    }
  }

  /**
   * HTTP-Anschluss. true = beantwortet, false = keine Zustaendigkeit.
   *
   * Anmeldung ist Pflicht: der Weg kostet Guthaben. Geprueft wird mit
   * derselben Sitzung wie bei /api/chat — die Bruecke reicht das Token des
   * Nutzers durch, es entsteht KEIN zusaetzliches Geheimnis zwischen den
   * Diensten.
   */
  async function handle(req, res, url) {
    if (req.method !== "POST" || url?.pathname !== "/api/bild/erzeuge") return false;
    const nutzer = readSession(req);
    if (!nutzer || !(await sessionStillValid(nutzer, env))) {
      json(res, 401, { ok: false, fehler: "anmeldung_noetig" });
      return true;
    }
    let rumpf;
    try {
      rumpf = await readJson(req);
    } catch {
      json(res, 400, { ok: false, fehler: "kein_json" });
      return true;
    }
    const prompt = String(rumpf?.prompt || "").trim();
    if (!prompt) {
      json(res, 400, { ok: false, fehler: "prompt_fehlt" });
      return true;
    }
    const ergebnis = await male(prompt);
    json(res, ergebnis.ok ? 200 : (schluessel ? 502 : 503), ergebnis);
    return true;
  }

  return { handle, male, eingerichtet: () => Boolean(schluessel) };
}
