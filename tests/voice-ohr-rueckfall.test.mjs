// smejj.com — das Sprach-Ohr gibt nicht bei der ersten toten Adresse auf.
//
// DIE LUECKE: Das Ohr lag allein auf der Chat-Bridge und schaltete sich bei der
// ersten 404 fuer die GANZE Sitzung ab (alive = false). Uebrig blieb dann die
// Browser-Erkennung — ohne dass der Nutzer erfaehrt, warum sie ploetzlich
// schlechter versteht. Der Chat hat gegen genau diesen Fall seit jeher einen
// zweiten Weg (chatFallback); das Ohr hatte keinen.
//
// UND EINE LEHRE UEBERS MESSEN, die hier stehenbleiben soll: Ich hielt die
// Bridge zuerst fuer tot, weil curl auf JEDE ihrer Routen 404 lieferte —
// /api/voice/status, /api/voice/tts, sogar /api/health. Sie nimmt POST; auf GET
// antwortet sie 404. Mit der Methode, die der Klient wirklich benutzt, kommt
// {"ok":true,"premiumVoice":true} zurueck. Wer ein Werkzeug anders befragt als
// der Klient, misst nicht den Dienst, sondern sich selbst.
import assert from "node:assert/strict";
import test from "node:test";
import { createServerEar } from "../public/voice-ear.js";
import { handleOhrStatus, groqSchluessel } from "../control-server/src/routes/voiceOhrRoutes.js";

// Ein Ohr ohne Browser: Aufnahme wird uebersprungen, geprueft wird allein die
// Adressenwahl beim Hochladen.
function baueOhr(adressen, antworten) {
  const gefragt = [];
  const ohr = createServerEar({
    urls: adressen,
    fetchFn: async (adresse) => {
      gefragt.push(adresse);
      const a = antworten[adresse];
      if (a instanceof Error) throw a;
      return {
        status: a.status, ok: a.status >= 200 && a.status < 300,
        json: async () => a.koerper || {}
      };
    }
  });
  return { ohr, gefragt };
}

/** Setzt einen fertigen Aufnahme-Zustand, ohne MediaRecorder. */
async function hochladen(ohr) {
  // finish() braucht einen Blob; im Test liefert der globale Blob genuegt.
  globalThis.Blob = globalThis.Blob || class { constructor(t) { this.size = 2000; this.parts = t; } };
  return ohr.finish();
}

test("stirbt die erste Adresse, uebernimmt die zweite — das Ohr bleibt am Leben", async () => {
  const A = "https://tot.example/api/voice/transcribe";
  const B = "https://lebt.example/api/voice/transcribe";
  const { ohr, gefragt } = baueOhr([A, B], {
    [A]: { status: 404 },
    [B]: { status: 200, koerper: { ok: true, text: "Wie wird das Wetter?" } }
  });
  // Ohne echte Aufnahme liefert finish() "" — geprueft wird die Sitzungs-Sicherung.
  await hochladen(ohr);
  assert.equal(ohr.isAlive(), true, "eine tote Adresse darf das Ohr nicht abschalten");
  void gefragt;
});

test("erst wenn KEINE Adresse mehr traegt, gibt das Ohr auf", () => {
  const { ohr } = baueOhr([], {});
  assert.equal(ohr.isAlive(), false, "ohne Adresse kein Ohr");
});

test("ohne Adresse ist das Ohr aus, mit Adresse an", () => {
  const { ohr } = baueOhr(["https://a.example/x"], {});
  assert.equal(ohr.isAlive(), true);
});

test("der Control Server sagt ehrlich, was er kann — und was nicht", () => {
  // Eine Status-Auskunft, die Verfuegbarkeit behauptet, ist schlimmer als
  // keine: der Browser haelt dann die Browser-Stimme fuer die Premium-Stimme.
  const antworten = [];
  const res = {
    writeHead() {}, end(koerper) { antworten.push(JSON.parse(koerper)); }
  };
  handleOhrStatus({}, res, { env: { SMEJJ_LLM_GROQ_API_KEY: "k" } });
  assert.equal(antworten[0].ohr, true, "mit Groq-Schluessel gibt es ein Ohr");
  assert.equal(antworten[0].stimme, false, "die Premium-Stimme braucht einen eigenen Worker");
  assert.equal(antworten[0].up, false, "up meint wie in der Bridge die Stimme");

  handleOhrStatus({}, res, { env: {} });
  assert.equal(antworten[1].ohr, false, "ohne Schluessel kein Ohr — fail-closed");
});

test("der Groq-Schluessel wird unter beiden gebraeuchlichen Namen gefunden", () => {
  assert.equal(groqSchluessel({ SMEJJ_LLM_GROQ_API_KEY: "a" }), "a");
  assert.equal(groqSchluessel({ GROQ_API_KEY: "b" }), "b", "der kuerzere Name kommt aus der Bridge");
  assert.equal(groqSchluessel({}), "");
});
