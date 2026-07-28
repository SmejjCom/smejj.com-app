#!/usr/bin/env node
// smejj.com — eine einzelne Task Capsule ins Object Brain (IDrive e2) legen.
//
// Warum ein eigenes Skript: upload_project_artifact_to_idrive.mjs packt das
// GESAMTE Repository in ein Artefakt. Fuer den Abschluss eines Auftrags braucht
// es genau die Capsule und ihre Belege — und in einem Arbeitsverzeichnis, in dem
// parallel gearbeitet wird, darf ein Abschluss ohnehin nicht fremde, unfertige
// Dateien mitschicken.
//
// Rein additiv: es wird ausschliesslich unter capsules/app/<jobId>/ geschrieben.
// Bestehende Objekte werden nie ueberschrieben — existiert der Schluessel
// bereits, bricht der Lauf ab (Daten-Lock: keine Ueberschreibung ohne
// schriftliche Freigabe).
//
// Aufruf:
//   node scripts/agent/upload_capsule_to_idrive.mjs <jobId> <datei> [weitere ...]
//
// Zugaenge kommen aus der sicheren lokalen Env-Datei und werden nie ausgegeben.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { secureLocalEnvPath } from "../../src/shared/env.js";

const BUCKET_DEFAULT = "smejj-model-files";
const PREFIX = "capsules/app";

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} fehlt in der sicheren lokalen Env-Datei.`);
  return value;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const hmac = (key, data, encoding) => crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
const encodeS3Path = (key) => key.split("/").map((part) => encodeURIComponent(part)).join("/");

async function signedS3Request({ method, endpoint, region, accessKey, secretKey, bucket, key, body = Buffer.alloc(0), contentType }) {
  const host = new URL(endpoint).host;
  const canonicalUri = `/${bucket}/${encodeS3Path(key)}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest, "utf8").digest("hex")].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), "s3"), "aws4_request");
  const headers = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${hmac(kSigning, stringToSign, "hex")}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (contentType) headers["Content-Type"] = contentType;
  return fetch(`${endpoint.replace(/\/$/, "")}${canonicalUri}`, { method, headers, body: method === "PUT" ? body : undefined });
}

function contentTypeFor(file) {
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

async function main() {
  loadLocalEnv(secureLocalEnvPath());
  const [jobId, ...files] = process.argv.slice(2);
  if (!jobId || !files.length) {
    console.error("Aufruf: node scripts/agent/upload_capsule_to_idrive.mjs <jobId> <datei> [weitere ...]");
    process.exit(1);
  }
  const config = {
    endpoint: requiredEnv("IDRIVE_E2_ENDPOINT"),
    region: process.env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: requiredEnv("IDRIVE_E2_ACCESS_KEY"),
    secretKey: requiredEnv("IDRIVE_E2_SECRET_KEY"),
    bucket: process.env.IDRIVE_E2_BUCKET || BUCKET_DEFAULT
  };

  const hochgeladen = [];
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Datei fehlt: ${file}`);
    const body = fs.readFileSync(file);
    const key = `${PREFIX}/${jobId}/${path.basename(file)}`;

    // Daten-Lock: nie ueberschreiben.
    const vorhanden = await signedS3Request({ ...config, method: "HEAD", key });
    if (vorhanden.ok) throw new Error(`Schluessel existiert bereits, kein Ueberschreiben: ${key}`);

    const antwort = await signedS3Request({ ...config, method: "PUT", key, body, contentType: contentTypeFor(file) });
    if (!antwort.ok) throw new Error(`Upload fehlgeschlagen (${antwort.status}) fuer ${key}`);
    hochgeladen.push({ key, bytes: body.length, sha256: sha256(body) });
  }

  console.log(`Capsule im Object Brain: s3://${config.bucket}/${PREFIX}/${jobId}/`);
  for (const eintrag of hochgeladen) {
    console.log(`  ${eintrag.key} — ${eintrag.bytes} B, sha256 ${eintrag.sha256.slice(0, 16)}…`);
  }
}

main().catch((error) => {
  console.error(`Abbruch: ${error.message}`);
  process.exit(1);
});
