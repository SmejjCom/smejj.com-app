#!/usr/bin/env node
// smejj.com — beantwortet die eine Frage, an der die Abo-Anzeige haengt:
// GEHOERT das bezahlte Abo zu einem Konto, mit dem sich jemand anmelden kann?
//
// WARUM ES DAS GIBT (2026-08-14): Das Live-Abo cus_V4GGvjGpI1hmUh liegt im
// Speicher (Plan plus, aktiv, echt) — aber die Betreiber-Uebersicht zeigt
// `konto: null`. Die Zuordnung laeuft ueber `ref` = sha256(E-Mail); passt kein
// Konto dazu, sieht der Zahlende in der App weiter "Free". Genau darueber hat
// sich der Betreiber beschwert. Wer das nicht misst, haelt eine kaputte
// Zuordnung fuer ein kaputtes Frontend.
//
// Rein lesend. Gibt E-Mail-Adressen nur aus, wenn sie zum gesuchten Abo
// passen — nicht den ganzen Nutzerbestand.
//
// Aufruf:  node scripts/diagnose/abo-konto-zuordnung.mjs [ref]
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { emailKey } from "../../control-server/src/auth/emailUserStore.js";
import { readUserIndex } from "../../control-server/src/admin/userIndex.js";
import { getRefRecord } from "../../control-server/src/billing/subscriptionStore.js";

loadSecureLocalEnv();

const REF = process.argv[2] || "669f5b540255b1de44389f3f60760b9d9e8b84eda37d693860b76cb2094d4774";

const refDatensatz = await getRefRecord(REF).catch(() => null);
console.log(`Abo-Verweis ${REF.slice(0, 12)}… -> Kunde ${refDatensatz?.customerId || "(kein Datensatz)"}`);

const index = await readUserIndex({ env: process.env });
if (!index?.ok) {
  console.log(`Nutzer-Index nicht lesbar (${index?.error || "unbekannt"}) — Zuordnung unbeweisbar.`);
  process.exit(1);
}

console.log(`Nutzer-Index: ${index.count} Konten, gebaut ${index.builtAt || "?"}.`);

const treffer = [];
for (const eintrag of index.entries || []) {
  const email = String(eintrag.email || "");
  if (email && emailKey(email) === REF) treffer.push(email);
}

if (treffer.length) {
  console.log(`TREFFER — das Abo gehoert zu: ${treffer.join(", ")}`);
  console.log("Wer sich mit dieser Adresse anmeldet, sieht das Abo in der App.");
  process.exit(0);
}

console.log("KEIN TREFFER — die zahlende Adresse hat KEIN Konto im Index.");
console.log("Folge: Der Zahlende sieht in der App weiterhin 'Free'.");
console.log("Naechster Schritt: zahlende Adresse bei Stripe nachsehen (Kunde oben)");
console.log("und den Verweis auf die Konto-Adresse umhaengen — siehe abo-konto-verknuepfen.mjs.");
process.exit(2);
