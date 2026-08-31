// smejj.com Hausmodell — IDrive-e2-Zugriff (S3, SigV4) ohne Fremdpakete.
//
// Warum eigener Client statt @aws-sdk: das Repo hat kein aws-sdk (gemessen
// 2026-09-01), und der Worker soll ein schlankes Abbild bleiben. Das Muster
// der Signierung stammt aus workers/glm-salad/s3.js; neu sind hier LIST,
// Streaming-GET (grosse Modelldateien laufen NIE durch den RAM) und
// Multipart-PUT.
//
// UNSIGNED-PAYLOAD: bei Datei-Streams laesst sich der Payload-Hash nicht
// vorab bilden, ohne die Datei zweimal zu lesen. Ueber HTTPS ist
// UNSIGNED-PAYLOAD der uebliche und von e2 akzeptierte Weg.
import { createHash, createHmac } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const LEERER_HASH = createHash("sha256").update("").digest("hex");

export function sha256Hex(wert) {
  return createHash("sha256").update(wert).digest("hex");
}

function hmac(schluessel, wert) {
  return createHmac("sha256", schluessel).update(wert).digest();
}

/** Schuetzt gegen Pfad-Ausbrueche in Objekt-Schluesseln. */
export function pruefeObjektSchluessel(schluessel) {
  const wert = String(schluessel || "");
  if (!wert || wert.startsWith("/") || wert.includes("..") || wert.includes("\\")) {
    throw new Error(`unsicherer_objekt_schluessel: ${wert.slice(0, 80)}`);
  }
  return wert;
}

function zeitstempel(datum = new Date()) {
  const amz = datum.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, tag: amz.slice(0, 8) };
}

/**
 * Signiert eine S3-Anfrage nach AWS SigV4.
 * `payloadHash` ist entweder ein Hex-Hash oder "UNSIGNED-PAYLOAD".
 */
export function signiere({ methode, url, region, zugangsSchluessel, geheimSchluessel, payloadHash, kopfzeilen = {} }) {
  const { amz, tag } = zeitstempel();
  const host = url.host;
  const kanonPfad = url.pathname
    .split("/")
    .map((teil, i) => (i === 0 ? teil : encodeURIComponent(decodeURIComponent(teil))))
    .join("/");

  const abfrage = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const alle = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amz, ...kopfzeilen };
  const namen = Object.keys(alle)
    .map((n) => n.toLowerCase())
    .sort();
  const kanonKopf = namen.map((n) => {
    const treffer = Object.entries(alle).find(([k]) => k.toLowerCase() === n);
    return `${n}:${String(treffer[1]).trim()}\n`;
  }).join("");
  const signierteNamen = namen.join(";");

  const kanonAnfrage = [methode, kanonPfad, abfrage, kanonKopf, signierteNamen, payloadHash].join("\n");
  const geltung = `${tag}/${region}/s3/aws4_request`;
  const zuSignieren = ["AWS4-HMAC-SHA256", amz, geltung, createHash("sha256").update(kanonAnfrage).digest("hex")].join("\n");

  let key = hmac(`AWS4${geheimSchluessel}`, tag);
  key = hmac(key, region);
  key = hmac(key, "s3");
  key = hmac(key, "aws4_request");
  const signatur = createHmac("sha256", key).update(zuSignieren).digest("hex");

  return {
    ...alle,
    Authorization: `AWS4-HMAC-SHA256 Credential=${zugangsSchluessel}/${geltung}, SignedHeaders=${signierteNamen}, Signature=${signatur}`
  };
}

export class E2Client {
  constructor({ endpoint, region, zugangsSchluessel, geheimSchluessel, eimer }) {
    if (!endpoint || !region || !zugangsSchluessel || !geheimSchluessel || !eimer) {
      throw new Error("e2_zugang_unvollstaendig");
    }
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.region = region;
    this.zugangsSchluessel = zugangsSchluessel;
    this.geheimSchluessel = geheimSchluessel;
    this.eimer = eimer;
  }

  #url(schluessel, abfrage = {}) {
    const url = new URL(`${this.endpoint}/${this.eimer}/${schluessel}`);
    for (const [k, v] of Object.entries(abfrage)) if (v !== undefined) url.searchParams.set(k, String(v));
    return url;
  }

  async #anfrage({ methode, schluessel, abfrage, koerper, kopfzeilen, payloadHash, roh = false }) {
    pruefeObjektSchluessel(schluessel);
    const url = this.#url(schluessel, abfrage);
    const hash = payloadHash || (koerper ? createHash("sha256").update(koerper).digest("hex") : LEERER_HASH);
    const signiert = signiere({
      methode,
      url,
      region: this.region,
      zugangsSchluessel: this.zugangsSchluessel,
      geheimSchluessel: this.geheimSchluessel,
      payloadHash: hash,
      kopfzeilen
    });
    const antwort = await fetch(url, {
      method: methode,
      headers: signiert,
      body: koerper,
      duplex: koerper && typeof koerper.pipe === "function" ? "half" : undefined
    });
    if (roh) return antwort;
    if (!antwort.ok) {
      const text = await antwort.text().catch(() => "");
      const fehler = new Error(`e2_${methode.toLowerCase()}_${antwort.status}: ${text.slice(0, 240)}`);
      fehler.status = antwort.status;
      throw fehler;
    }
    return antwort;
  }

  /** Objekt als Text lesen. Gibt null zurueck, wenn es nicht existiert. */
  async lies(schluessel) {
    try {
      const antwort = await this.#anfrage({ methode: "GET", schluessel });
      return await antwort.text();
    } catch (fehler) {
      if (fehler.status === 404) return null;
      throw fehler;
    }
  }

  async liesJson(schluessel) {
    const text = await this.lies(schluessel);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`e2_json_kaputt: ${schluessel}`);
    }
  }

  /** Kopf-Abfrage: {groesse, etag} oder null. */
  async kopf(schluessel) {
    const antwort = await this.#anfrage({ methode: "HEAD", schluessel, roh: true });
    if (antwort.status === 404) return null;
    if (!antwort.ok) throw new Error(`e2_head_${antwort.status}`);
    return {
      groesse: Number(antwort.headers.get("content-length") || 0),
      etag: (antwort.headers.get("etag") || "").replace(/"/g, "")
    };
  }

  /** Kleines Objekt schreiben (Text/Buffer). */
  async schreib(schluessel, inhalt, typ = "application/octet-stream") {
    const koerper = Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(String(inhalt), "utf8");
    await this.#anfrage({
      methode: "PUT",
      schluessel,
      koerper,
      kopfzeilen: { "content-type": typ, "content-length": String(koerper.length) }
    });
    return koerper.length;
  }

  async schreibJson(schluessel, wert) {
    return this.schreib(schluessel, `${JSON.stringify(wert, null, 2)}\n`, "application/json; charset=utf-8");
  }

  /** Objekt-Schluessel unter einem Praefix auflisten (folgt der Fortsetzungs-Marke). */
  async liste(praefix, { maxSeiten = 50 } = {}) {
    const treffer = [];
    let marke;
    for (let seite = 0; seite < maxSeiten; seite += 1) {
      const url = new URL(`${this.endpoint}/${this.eimer}`);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("max-keys", "1000");
      url.searchParams.set("prefix", praefix);
      if (marke) url.searchParams.set("continuation-token", marke);
      const signiert = signiere({
        methode: "GET",
        url,
        region: this.region,
        zugangsSchluessel: this.zugangsSchluessel,
        geheimSchluessel: this.geheimSchluessel,
        payloadHash: LEERER_HASH
      });
      const antwort = await fetch(url, { method: "GET", headers: signiert });
      const xml = await antwort.text();
      if (!antwort.ok) throw new Error(`e2_list_${antwort.status}: ${xml.slice(0, 200)}`);
      for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const schluessel = block[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
        const groesse = Number(block[1].match(/<Size>(\d+)<\/Size>/)?.[1] || 0);
        if (schluessel) treffer.push({ schluessel: entziffere(schluessel), groesse });
      }
      marke = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
      if (!marke || !/<IsTruncated>true<\/IsTruncated>/.test(xml)) break;
    }
    return treffer;
  }

  /**
   * Objekt in eine Datei streamen. Rechnet den SHA256 waehrend des Ladens mit,
   * damit die Pruefsumme keinen zweiten Lesedurchgang kostet.
   */
  async ladeInDatei(schluessel, zielPfad, { beiFortschritt } = {}) {
    const antwort = await this.#anfrage({ methode: "GET", schluessel, roh: true });
    if (!antwort.ok) throw new Error(`e2_get_${antwort.status}: ${schluessel}`);
    const gesamt = Number(antwort.headers.get("content-length") || 0);
    const hasher = createHash("sha256");
    let geladen = 0;
    const quelle = Readable.fromWeb(antwort.body);
    quelle.on("data", (stueck) => {
      hasher.update(stueck);
      geladen += stueck.length;
      if (beiFortschritt) beiFortschritt(geladen, gesamt);
    });
    await pipeline(quelle, createWriteStream(zielPfad));
    return { bytes: geladen, sha256: hasher.digest("hex") };
  }

  /**
   * Datei nach e2 hochladen. Unter der Multipart-Schwelle als einfaches PUT,
   * darueber als Multipart-Upload — e2 nimmt einzelne PUTs nur bis 5 GB, und
   * ein abgebrochener 40-GB-PUT muesste sonst komplett neu laufen.
   */
  async ladeDateiHoch(schluessel, quellPfad, { teilGroesse = 64 * 1024 * 1024, typ = "application/octet-stream", beiFortschritt } = {}) {
    const { size } = await stat(quellPfad);
    if (size <= teilGroesse) {
      const strom = createReadStream(quellPfad);
      await this.#anfrage({
        methode: "PUT",
        schluessel,
        koerper: strom,
        payloadHash: "UNSIGNED-PAYLOAD",
        kopfzeilen: { "content-type": typ, "content-length": String(size) }
      });
      if (beiFortschritt) beiFortschritt(size, size);
      return { bytes: size, teile: 1 };
    }

    const start = await this.#anfrage({ methode: "POST", schluessel, abfrage: { uploads: "" }, kopfzeilen: { "content-type": typ } });
    const startXml = await start.text();
    const uploadId = startXml.match(/<UploadId>([\s\S]*?)<\/UploadId>/)?.[1];
    if (!uploadId) throw new Error("e2_multipart_ohne_upload_id");

    const teile = [];
    let versetzt = 0;
    let nummer = 1;
    try {
      while (versetzt < size) {
        const ende = Math.min(versetzt + teilGroesse, size) - 1;
        const laenge = ende - versetzt + 1;
        const strom = createReadStream(quellPfad, { start: versetzt, end: ende });
        const antwort = await this.#anfrage({
          methode: "PUT",
          schluessel,
          abfrage: { partNumber: String(nummer), uploadId },
          koerper: strom,
          payloadHash: "UNSIGNED-PAYLOAD",
          kopfzeilen: { "content-length": String(laenge) },
          roh: true
        });
        if (!antwort.ok) throw new Error(`e2_part_${antwort.status}`);
        teile.push({ nummer, etag: (antwort.headers.get("etag") || "").replace(/"/g, "") });
        versetzt = ende + 1;
        nummer += 1;
        if (beiFortschritt) beiFortschritt(versetzt, size);
      }
      const abschluss = `<CompleteMultipartUpload>${teile
        .map((t) => `<Part><PartNumber>${t.nummer}</PartNumber><ETag>"${t.etag}"</ETag></Part>`)
        .join("")}</CompleteMultipartUpload>`;
      await this.#anfrage({
        methode: "POST",
        schluessel,
        abfrage: { uploadId },
        koerper: Buffer.from(abschluss, "utf8"),
        kopfzeilen: { "content-type": "application/xml" }
      });
      return { bytes: size, teile: teile.length };
    } catch (fehler) {
      // Angefangene Multipart-Uploads kosten Lager, bis sie abgeraeumt sind.
      await this.#anfrage({ methode: "DELETE", schluessel, abfrage: { uploadId }, roh: true }).catch(() => {});
      throw fehler;
    }
  }
}

function entziffere(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Baut den Client aus Umgebungsvariablen (gleiche Namen wie ueberall im Projekt). */
export function e2AusUmgebung(umgebung = process.env) {
  return new E2Client({
    endpoint: umgebung.IDRIVE_E2_ENDPOINT,
    region: umgebung.IDRIVE_E2_REGION,
    zugangsSchluessel: umgebung.IDRIVE_E2_ACCESS_KEY,
    geheimSchluessel: umgebung.IDRIVE_E2_SECRET_KEY,
    eimer: umgebung.IDRIVE_E2_BUCKET
  });
}
