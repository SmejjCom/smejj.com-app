// smejj.com — "Mit Apple anmelden": die vier Werte bei Zeabur setzen (21.09.2026).
//
// ANLASS: Der Betreiber ("ich bin kein Programmierer, ich habe keine Zeit,
// mach du 100 % fertig") hat ausdruecklich alle Rechte gegeben. Bis heute
// endete Richtlinie 4.8 immer bei "der Betreiber muss vier Werte im Portal
// einfuegen" — und blieb liegen. Der Zugang liegt seit dem 14.08. in
// ~/.config/zeabur/cli.yaml, genau fuer diesen Fall.
//
// Der private Schluessel geht von der Datei in Downloads direkt in die eigene
// Infrastruktur. Er wird NIE ausgegeben — auch nicht gekuerzt, auch nicht im
// Fehlerfall. Als Base64 hinterlegt: eine einzige Zeile, damit kein
// Zeilenumbruch auf dem Weg durch die API verlorengeht. Der Server nimmt das
// ausdruecklich an (normalizeApplePrivateKey in src/auth/appleAuth.js).
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setzeUmgebungswerte, starteDienstNeu, findeDienst } from "../deploy/zeabur-umgebung-setzen.mjs";

const DIENST = "smejj-control";
const SERVICES_ID = "com.smejj.web";
const TEAM_ID = "443R27FNHX";

function schluesselDatei() {
  const ordner = join(homedir(), "Downloads");
  // Bewusst nach der Kennung, NICHT nach dem Datum: neben dem Login-Schluessel
  // liegt der App-Store-Connect-Schluessel, und "der neueste" waere Zufall.
  const treffer = readdirSync(ordner).filter((n) => /^AuthKey_[A-Z0-9]{10}\.p8$/.test(n));
  const gewuenscht = process.env.APPLE_KEY_ID || "5833LBVT26";
  const name = treffer.find((n) => n.includes(gewuenscht));
  if (!name) throw new Error(`AuthKey_${gewuenscht}.p8 liegt nicht in Downloads (gefunden: ${treffer.join(", ") || "keine"})`);
  return { pfad: join(ordner, name), keyId: name.slice("AuthKey_".length, -".p8".length) };
}

const { pfad, keyId } = schluesselDatei();
const pem = readFileSync(pfad, "utf8").trim();
if (!pem.includes("BEGIN PRIVATE KEY")) throw new Error("Die Datei ist kein PEM-Schluessel.");
const base64 = Buffer.from(pem, "utf8").toString("base64");

const dienst = await findeDienst(DIENST);
console.log(`Dienst: ${DIENST} (${dienst.projektName} / ${dienst.umgebungName})`);
console.log(`Schluessel: ${keyId} — Inhalt wird nicht ausgegeben.`);

await setzeUmgebungswerte(DIENST, {
  SMEJJ_APPLE_LOGIN_SERVICES_ID: SERVICES_ID,
  SMEJJ_APPLE_LOGIN_TEAM_ID: TEAM_ID,
  SMEJJ_APPLE_LOGIN_KEY_ID: keyId,
  SMEJJ_APPLE_LOGIN_PRIVATE_KEY: base64
});
console.log("Vier Werte gesetzt.");

const neu = await starteDienstNeu(DIENST).catch((fehler) => ({ ok: false, grund: String(fehler.message || fehler) }));
console.log(`Neustart: ${neu.ok ? neu.mutation : "nicht angestossen (" + neu.grund + ") — Zeabur startet nach einer Variablenaenderung meist selbst neu"}`);

// Nachmessen am LIVE-Server, nicht an der Antwort der API. Das Muster mit
// Leerzeichen: die Antwort ist eingerueckt formatiert ("apple": false).
for (let i = 1; i <= 40; i += 1) {
  await new Promise((r) => setTimeout(r, 15000));
  const antwort = await fetch(`https://api.smejj.com/api/auth/config?n=${Math.random()}`).then((r) => r.json()).catch(() => null);
  const wert = antwort?.methods?.apple;
  if (wert === true) {
    const weiter = await fetch("https://api.smejj.com/api/auth/apple", { redirect: "manual" }).catch(() => null);
    console.log(`GESCHAFFT nach ${i * 15} s: apple: true — /api/auth/apple antwortet ${weiter ? weiter.status : "?"} (302/303 = leitet zu Apple weiter).`);
    process.exit(0);
  }
  if (i % 4 === 0) console.log(`  warte ... (${i * 15} s, apple: ${wert})`);
}
console.log("Noch nicht aktiv — der Dienst hat den Neustart offenbar nicht abgeschlossen.");
process.exit(1);
