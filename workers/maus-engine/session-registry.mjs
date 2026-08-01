// smejj.com Maus-Engine — lebende Browser-Sitzungen im Worker-Prozess.
// Single Responsibility: einen offenen Playwright-Browser ueber MEHRERE
// Auftraege hinweg halten, damit die Seite stehen bleibt, statt bei jedem
// Auftrag neu zu starten. Der Interpreter bekommt den bestehenden Zustand
// gereicht (siehe interpreter.mjs, options.sessionState/keepAlive).
//
// Warum hier und nicht in workers/remote-browser/session-engine.js:
// Dieser Motor dort gehoert zum Live-Browser-Dienst (eigene Aktionssprache
// click/type/scroll mit Prozentkoordinaten, eigener Worker, eigenes Dockerfile)
// und haelt seinen Zustand rein im Serverspeicher. Die Maus arbeitet dagegen
// nach dem Plan-Schema (schemas/maus-action-plan.schema.json) durch den
// Interpreter mit Allowlist, Budget und Vault. Zwei Motoren zusammenzulegen
// haette eine der beiden Aktionssprachen gebrochen; stattdessen ist hier NUR
// die Sitzungshaltung nachgebaut — bewusst mit demselben Muster
// (Idle-Timeout + Hartlimit + Obergrenze gleichzeitiger Sitzungen) und
// zusaetzlich mit dem e2-Lease, den der andere Motor nicht hat.
import { randomBytes } from "node:crypto";
import { LEASE_DEFAULT_TTL_MS, LEASE_HARD_LIMIT_MS, isValidSessionId } from "./session-lease.mjs";

export const REGISTRY_DEFAULTS = Object.freeze({
  maxSessions: 2,
  idleTtlMs: LEASE_DEFAULT_TTL_MS,
  hardLimitMs: LEASE_HARD_LIMIT_MS
});

// Instanz-Kennung: identifiziert DIESEN Prozess im Lease auf e2. Bewusst
// zufaellig statt Hostname — auf Zeabur/Salad tragen mehrere Instanzen
// denselben Hostnamen und wuerden sich gegenseitig fuer sich selbst halten.
export function createHolderId() {
  return `maus-${randomBytes(8).toString("hex")}`;
}

function freshState() {
  return {
    browser: null,
    context: null,
    pages: new Map(),
    activeTabId: null,
    downloads: [],
    extracted: {},
    executedActions: 0
  };
}

/**
 * Registry lebender Sitzungen. browserFactory ist dieselbe Funktion, die der
 * Worker sonst pro Lauf benutzt — die Sitzung aendert nur, WIE LANGE das
 * Ergebnis lebt, nicht WIE der Browser gebaut wird.
 */
export function createSessionRegistry({
  browserFactory,
  leaseStore = null,
  // Teil 4 "angemeldet bleiben": Cookie-Krug (storageState) je Sitzung.
  // Schnittstelle wie session-store.mjs — load(name)/save(name, state).
  // Ohne Store verhaelt sich die Registry wie zuvor: jede Sitzung startet leer.
  storageStore = null,
  holder = createHolderId(),
  clock = Date,
  ...overrides
} = {}) {
  if (typeof browserFactory !== "function") throw new Error("browser_factory_fehlt");
  const cfg = { ...REGISTRY_DEFAULTS, ...overrides };
  const sessions = new Map();

  // Der Cookie-Krug wird beim Abbau der Sitzung gesichert und beim naechsten
  // Start wieder eingesetzt. Damit ueberlebt eine EINMAL im Beisein des
  // Betreibers gemachte Anmeldung auch das Ende der Sitzung — ohne dass je ein
  // Passwort in Plan, Prompt oder Log auftaucht.
  async function krugSichern(session) {
    if (!storageStore || !session.state.context) return false;
    try {
      const stand = await session.state.context.storageState();
      await storageStore.save(session.sessionId, stand);
      return true;
    } catch {
      // Fehlt der Krug, ist die naechste Sitzung eben abgemeldet — das ist
      // sichtbar und harmlos. Ein Abbruch waere hier schlimmer als der Verlust.
      return false;
    }
  }

  async function krugLaden(sessionId) {
    if (!storageStore) return null;
    try {
      return await storageStore.load(sessionId);
    } catch {
      return null;
    }
  }

  function abgelaufen(session, now) {
    if (now - session.lastUsedAt >= cfg.idleTtlMs) return "leerlauf";
    if (now - session.createdAt >= cfg.hardLimitMs) return "hartlimit";
    return null;
  }

  async function schliessen(sessionId, grund) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    sessions.delete(sessionId);
    session.geschlossenWeil = grund;
    // VOR dem Schliessen sichern — danach gibt der Kontext nichts mehr her.
    await krugSichern(session);
    try {
      if (session.state.browser) await session.state.browser.close();
    } catch {
      // Ein Browser, der sich nicht schliessen laesst, darf den Abbau nicht
      // blockieren — der Prozess raeumt beim Ende ohnehin auf.
    }
    session.state.browser = null;
    session.state.context = null;
    session.state.pages.clear();
    session.state.activeTabId = null;
    if (leaseStore) await leaseStore.release({ sessionId, holder }).catch(() => {});
    return true;
  }

  // Abgelaufene Sitzungen abbauen. Wird vor jedem Zugriff aufgerufen, damit es
  // keinen Timer braucht, der einen fertigen Prozess am Leben haelt.
  async function aufraeumen() {
    const now = clock.now();
    const abgebaut = [];
    for (const [id, session] of [...sessions.entries()]) {
      if (session.busy) continue;
      const grund = abgelaufen(session, now);
      if (grund) {
        await schliessen(id, grund);
        abgebaut.push({ sessionId: id, grund });
      }
    }
    return abgebaut;
  }

  /**
   * Sitzung uebernehmen: Lease auf e2 pruefen/erneuern, dann den lebenden
   * Zustand liefern. Fail-closed — ohne gueltigen Lease kein Browser.
   * @returns {{ok:true, session:object, neu:boolean}|{ok:false, status:number, error:string}}
   */
  async function acquire({ sessionId, capsuleRef = null, viewport = null, ttlMs = cfg.idleTtlMs } = {}) {
    if (!isValidSessionId(sessionId)) {
      return { ok: false, status: 400, error: "session_id_ungueltig (a-z, 0-9, Bindestrich, 8-64 Zeichen)" };
    }
    await aufraeumen();
    if (leaseStore) {
      const claim = await leaseStore.claim({ sessionId, holder, capsuleRef, ttlMs });
      if (!claim.ok) {
        return { ok: false, status: 409, error: `sitzung_fremd_belegt: ${claim.grund}`, holder: claim.holder ?? null };
      }
    }
    let session = sessions.get(sessionId);
    if (session?.busy) return { ok: false, status: 409, error: "sitzung_bereits_aktiv" };
    const neu = !session;
    if (!session) {
      if (sessions.size >= cfg.maxSessions) {
        return { ok: false, status: 429, error: `sitzungs_obergrenze_erreicht: ${cfg.maxSessions}` };
      }
      session = {
        sessionId,
        capsuleRef,
        viewport,
        state: freshState(),
        createdAt: clock.now(),
        lastUsedAt: clock.now(),
        laeufe: 0,
        busy: false
      };
      sessions.set(sessionId, session);
    }
    session.busy = true;
    session.lastUsedAt = clock.now();
    return { ok: true, session, neu };
  }

  /**
   * Sitzung nach einem Lauf wieder freigeben. Der Browser bleibt offen —
   * genau das ist der Sinn. Nur der Zaehler und der Lease werden aufgefrischt.
   */
  async function release({ sessionId, ttlMs = cfg.idleTtlMs } = {}) {
    const session = sessions.get(sessionId);
    if (!session) return { ok: false, error: "sitzung_unbekannt" };
    session.busy = false;
    session.lastUsedAt = clock.now();
    session.laeufe += 1;
    if (leaseStore) {
      await leaseStore.renew({ sessionId, holder, capsuleRef: session.capsuleRef, ttlMs }).catch(() => {});
    }
    return { ok: true, laeufe: session.laeufe };
  }

  function beschreibung(session) {
    const seite = session.state.pages.get(session.state.activeTabId);
    let url = null;
    try {
      url = typeof seite?.url === "function" ? seite.url() : null;
    } catch {
      url = null;
    }
    return {
      sessionId: session.sessionId,
      capsuleRef: session.capsuleRef,
      offen: Boolean(session.state.browser),
      aktiveSeite: url,
      tabs: session.state.pages.size,
      laeufe: session.laeufe,
      createdAt: new Date(session.createdAt).toISOString(),
      lastUsedAt: new Date(session.lastUsedAt).toISOString(),
      laeuftAbInMs: Math.max(0, cfg.idleTtlMs - (clock.now() - session.lastUsedAt))
    };
  }

  return {
    holder,
    browserFactory,
    /**
     * Browser-Fabrik fuer EINE Sitzung: legt den gespeicherten Cookie-Krug in
     * den neuen Kontext, bevor die erste Seite entsteht. Der Interpreter
     * bekommt sie ueber ctx.browserFactory und merkt davon nichts — die
     * Anmeldung ist damit eine Eigenschaft der Sitzung, nicht des Plans.
     */
    browserFactoryFuer(sessionId) {
      if (!storageStore) return browserFactory;
      return async (optionen = {}) => {
        const krug = await krugLaden(sessionId);
        return browserFactory({ ...optionen, ...(krug ? { storageState: krug } : {}) });
      };
    },
    acquire,
    release,
    aufraeumen,
    async close(sessionId) {
      const geschlossen = await schliessen(sessionId, "auftrag");
      return { ok: true, geschlossen };
    },
    async closeAll() {
      const ids = [...sessions.keys()];
      for (const id of ids) await schliessen(id, "prozessende");
      return { ok: true, geschlossen: ids.length };
    },
    status(sessionId) {
      const session = sessions.get(sessionId);
      return session ? beschreibung(session) : null;
    },
    list() {
      return [...sessions.values()].map(beschreibung);
    },
    // Der Worker fragt danach, BEVOR er sich nach einem Lauf beendet: solange
    // eine Sitzung lebt, waere ein exit-after-run genau der Kaltstart, den
    // diese Datei abschafft.
    hasLiveSessions() {
      return sessions.size > 0;
    },
    count: () => sessions.size
  };
}
