// con-Autopilot — Job-Buendel als tar.gz/base64 (Single Responsibility: Dateien -> Umgebungsvariable).
// Salad bekommt den Code des Jobs als SMEJJ-Buendel in einer Umgebungsvariablen,
// genau wie der fruehere LoRA-Trainer. Kein Registry-Abbild, kein Docker-Bau
// auf dem Mac (dort gibt es kein Docker). Reines ustar ohne Abhaengigkeiten.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

function oktal(n, laenge) {
  return n.toString(8).padStart(laenge - 1, "0") + "\0";
}

function kopf(name, groesse, modus = 0o644, typ = "0") {
  const h = Buffer.alloc(512, 0);
  h.write(name.slice(0, 100), 0, "utf8");
  h.write(oktal(modus, 8), 100);
  h.write(oktal(0, 8), 108);
  h.write(oktal(0, 8), 116);
  h.write(oktal(groesse, 12), 124);
  h.write(oktal(Math.floor(Date.now() / 1000), 12), 136);
  h.write("        ", 148); // Pruefsummenfeld als Leerzeichen fuer die Berechnung
  h.write(typ, 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let summe = 0;
  for (const b of h) summe += b;
  h.write(summe.toString(8).padStart(6, "0") + "\0 ", 148);
  return h;
}

function sammle(wurzel, rel = "") {
  const out = [];
  for (const name of readdirSync(path.join(wurzel, rel)).sort()) {
    if (name === "__pycache__" || name.startsWith(".")) continue;
    const r = rel ? `${rel}/${name}` : name;
    const st = statSync(path.join(wurzel, r));
    if (st.isDirectory()) out.push(...sammle(wurzel, r));
    else out.push({ name: r, daten: readFileSync(path.join(wurzel, r)) });
  }
  return out;
}

/** @returns {{ b64: string, sha256: string, dateien: string[], bytes: number }} */
export function baueBuendel(verzeichnis, { wurzelname = "con-job" } = {}) {
  const dateien = sammle(verzeichnis);
  const teile = [];
  for (const d of dateien) {
    teile.push(kopf(`${wurzelname}/${d.name}`, d.daten.length, d.name.endsWith(".py") ? 0o644 : 0o644));
    teile.push(d.daten);
    const rest = d.daten.length % 512;
    if (rest) teile.push(Buffer.alloc(512 - rest, 0));
  }
  teile.push(Buffer.alloc(1024, 0));
  const tar = Buffer.concat(teile);
  const gz = gzipSync(tar, { level: 9 });
  return {
    b64: gz.toString("base64"),
    sha256: createHash("sha256").update(gz).digest("hex"),
    dateien: dateien.map((d) => d.name),
    bytes: gz.length
  };
}
