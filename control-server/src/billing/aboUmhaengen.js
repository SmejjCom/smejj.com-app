// smejj.com — ein bezahltes Abo auf ein Konto umhaengen (Adminaktion, 2026-08-23).
//
// DER FALL: Der Kunde hat bezahlt — unter einer anderen Adresse als der, mit
// der er angemeldet ist (erstes echtes Abo, 14.08.2026: bezahlt als
// 7shahnazaryan@gmail.com, angemeldet als smejjcom@gmail.com). Die App zeigt
// ihm "Frei", die Betreiber-Konsole "nicht zugeordnet". Bisher blieb nur:
// mit der zahlenden Adresse anmelden.
//
// WAS DIESE AKTION TUT: Sie legt fuer die Konto-Adresse einen zweiten
// Ref-Datensatz an (billing/refs/<sha256(konto)>.json -> Kunde) und setzt im
// Kundendatensatz `ref` auf die Konto-Adresse. Der alte Ref-Datensatz der
// zahlenden Adresse bleibt bestehen — nichts wird geloescht, der Weg zurueck
// ist ein zweiter Aufruf. `paidEmail` (die bestaetigte Kaufadresse) wird NIE
// veraendert: sie ist der Beleg, nicht die Zuordnung.
//
// WAS SIE NICHT TUT: Sie aendert nichts bei Stripe, und sie haengt kein Abo
// auf ein Konto, das es nicht gibt (Index-Pruefung), oder ein Abo, das nicht
// laeuft. Fremde Abos: die Aktion braucht das Adminrecht und einen Grund,
// und sie steht mit Vorher/Nachher im Audit-Log.
import { emailKey, normalizeEmail } from "../auth/emailUserStore.js";
import { getCustomerRecord, putCustomerRecord, putRefRecord, isStripeCustomerId } from "./subscriptionStore.js";
import { readUserIndex } from "../admin/userIndex.js";

const LAUFEND = new Set(["active", "trialing", "past_due"]);

export async function aboAufKontoUmhaengen(kontoEmail, kundenId, { env = process.env, leseIndex = readUserIndex, leseKunde = getCustomerRecord, schreibeKunde = putCustomerRecord, schreibeRef = putRefRecord } = {}) {
  const email = normalizeEmail(kontoEmail);
  if (!email) return { ok: false, error: "admin_user_not_found" };
  if (!isStripeCustomerId(kundenId)) return { ok: false, error: "billing_customer_id_invalid" };

  const index = await leseIndex({ env });
  if (!index?.ok) return { ok: false, error: "admin_directory_unavailable" };
  const konto = (index.entries || []).find((n) => normalizeEmail(n.email) === email);
  if (!konto) return { ok: false, error: "admin_user_not_found" };

  const kunde = await leseKunde(kundenId, env);
  if (!kunde) return { ok: false, error: "billing_customer_not_found" };
  if (!LAUFEND.has(String(kunde.status || ""))) return { ok: false, error: "billing_subscription_not_active", status: kunde.status || null };

  const neuerRef = emailKey(email);
  if (kunde.ref === neuerRef) return { ok: false, error: "admin_no_change", before: { ref: kunde.ref } };

  const before = { ref: kunde.ref || null, paidEmail: kunde.paidEmail || null, plan: kunde.plan || null, status: kunde.status || null };
  await schreibeRef(neuerRef, { customerId: kundenId, subscriptionId: kunde.subscriptionId || null, livemode: Boolean(kunde.livemode) }, env);
  await schreibeKunde(kundenId, { ...kunde, ref: neuerRef, refVorher: kunde.ref || null }, env);
  return {
    ok: true,
    before,
    after: { ref: neuerRef, konto: email, paidEmail: kunde.paidEmail || null, plan: kunde.plan || null, status: kunde.status || null, refVorher: kunde.ref || null }
  };
}
