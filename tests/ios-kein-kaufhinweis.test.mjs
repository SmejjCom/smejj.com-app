// smejj.com — Apple-Richtlinie 3.1.1: kein Kauf-Hinweis in der iOS-Huelle.
//
// BEFUND 21.09.2026 (beim Aufarbeiten der Apple-Ablehnung gefunden): Der
// Konto-Bereich "Mein Plan" zeigte drei Abos mit Preis und dem Knopf
// "Zahlungspflichtig abonnieren", der zu Stripe weiterleitet. Eine iOS-App
// darf weder Preise fuer digitale Inhalte nennen noch auf einen Bezahlweg
// ausserhalb von Apples In-App-Kauf verweisen — auch nicht ueber einen Link.
// Dazu kam ein Widerspruch zu unseren Anmerkungen fuer die App-Pruefung
// ("no in-app purchases, no subscriptions"), den ein Pruefer als Falschangabe
// werten kann. Betreiber-Freigabe am selben Tag: in der iOS-Huelle ausblenden,
// im Web unveraendert lassen.
//
// Der Waechter prueft die WIRKUNG am erzeugten Markup, nicht die Schreibweise
// der Weiche — und bekommt nach der Hausregel beide Proben: iOS (nichts darf
// nach Kauf aussehen) und Web (alles muss da sein, sonst haette der Umbau
// still den Verkauf abgeschaltet).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const QUELLE = fs.readFileSync("public/account-privacy.js", "utf8");

/** Die Weiche und den Kauf-Teil aus der Quelle holen und ausfuehrbar machen. */
function ladeKaufTeil({ ios }) {
  const weiche = QUELLE.match(/function iosHuelle\(\) \{[\s\S]*?\n\}/)[0];
  const kauf = QUELLE.match(/function planKaufTeil\(\) \{[\s\S]*?\n\}/)[0];
  // dataAction steht auf EINER Zeile — ein gieriges [\s\S] zog sonst den halben
  // Rest der Datei mit hinein (gemessen: ReferenceError KONTO_STIL_MARKE).
  const dataAction = QUELLE.match(/^function dataAction\(.*$/m)[0];
  // t() gibt den deutschen Quelltext zurueck (wie im Browser ohne Uebersetzung).
  const kopf = `const t = (s) => s;
    const window = ${ios ? '{ Capacitor: {} }' : "{}"};
    const navigator = { userAgent: ${ios ? '"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"' : '"Mozilla/5.0 (X11; Linux x86_64)"'}, platform: ${ios ? '"iPhone"' : '"Linux x86_64"'} };
    const document = {};`;
  return new Function(`${kopf}\n${weiche}\n${dataAction}\n${kauf}\nreturn planKaufTeil();`)();
}

test("iOS-Huelle: kein Preis, kein Kaufknopf, kein fremder Bezahlweg", () => {
  const markup = ladeKaufTeil({ ios: true });
  for (const verboten of ["9 €", "19 €", "39 €", "Zahlungspflichtig abonnieren", "Stripe", "planPlusOpen", "planProOpen", "planMaxOpen"]) {
    assert.ok(!markup.includes(verboten), `in der iOS-Huelle darf "${verboten}" nicht vorkommen`);
  }
  // Auch kein Ersatz-Hinweis wie "buche auf unserer Website" — das waere nach
  // 3.1.1 wieder eine Handlungsaufforderung zu einem fremden Bezahlweg. Ein
  // LINK ist der deutlichste Fall und darf hier gar nicht vorkommen.
  assert.ok(!/<a\s/i.test(markup), `kein Link im Plan-Bereich der Huelle: ${markup}`);
  assert.ok(!/buch|website|im browser|am computer|abonnier/i.test(markup),
    `kein Verweis auf einen anderen Kaufweg: ${markup}`);
  assert.match(markup, /kostenlos/, "der Plan-Status bleibt erklaert");
});

test("Web: der Verkauf bleibt vollstaendig erhalten", () => {
  // Die GESUNDE Probe. Ohne sie wuerde ein Umbau, der den Verkauf ueberall
  // abschaltet, unbemerkt durchgehen — teurer Fehler als die Ablehnung.
  const markup = ladeKaufTeil({ ios: false });
  for (const noetig of ["9 €", "19 €", "39 €", "Zahlungspflichtig abonnieren", "planPlusOpen", "planProOpen", "planMaxOpen", "Widerrufsbelehrung"]) {
    assert.ok(markup.includes(noetig), `im Web muss "${noetig}" erhalten bleiben`);
  }
});

test("die Weiche ist fail-closed", () => {
  const weiche = QUELLE.match(/function iosHuelle\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(weiche, /catch\s*\{[\s\S]*?return true/, "wirft die Pruefung, wird versteckt — nicht gezeigt");
  assert.match(weiche, /window\.Capacitor/, "die Capacitor-Bruecke ist das sichere Signal");
  assert.match(weiche, /iPad\|iPhone\|iPod/, "ein WKWebView ohne Bruecke sieht aus wie Safari — iOS zaehlt mit");
  assert.match(weiche, /ontouchend/, "iPadOS meldet sich als Macintosh");
});

test("das Plan-Panel benutzt die Weiche, statt den Kauf-Teil doppelt zu pflegen", () => {
  assert.match(QUELLE, /\$\{planKaufTeil\(\)\}/, "das Panel ruft den Kauf-Teil auf");
  assert.match(QUELLE, /\$\{iosHuelle\(\) \? "" : `<button id="planManageOpen"/,
    "auch das Abo-Portal (Stripe) darf in der Huelle nicht erscheinen");
  // Der Kuendigungsweg bleibt: Apple stoert sich am Kauf, nicht am Beenden.
  assert.match(QUELLE, /id="planCancelOpen"/, "der Kuendigungsknopf bleibt in beiden Huellen");
});
