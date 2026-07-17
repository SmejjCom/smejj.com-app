// smejj.com Maus-Engine — Domain-Allowlist + SSRF-Blocklist (fail-closed).
// Single Responsibility: entscheiden, ob eine URL fuer diesen Task erlaubt ist.
// Blocklist-Muster uebernommen aus dem verifizierten
// workers/remote-browser/worker.js (private Netze, localhost, Link-Local).

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.(local|internal|lan|home|corp)$/i,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i
];

// Hostname gegen Allowlist-Eintraege pruefen. Eintrag "example.com" erlaubt
// exakt example.com; "*.example.com" erlaubt jede Subdomain UND die Domain
// selbst. Vergleich ist case-insensitive, kein Modell, keine Heuristik.
export function isHostAllowed(hostname, allowlist) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  return allowlist.some((entry) => {
    const rule = String(entry || "").toLowerCase();
    if (rule.startsWith("*.")) {
      const base = rule.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === rule;
  });
}

// Vollpruefung einer URL: Protokoll, SSRF-Blocklist, Allowlist.
// Rueckgabe { ok } oder { ok:false, error } — Aufrufer bricht fail-closed ab.
export function checkUrlAllowed(rawUrl, allowlist) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    return { ok: false, error: `Ungueltige URL: ${String(rawUrl).slice(0, 200)}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Nur http(s) erlaubt: ${url.protocol}` };
  }
  const host = url.hostname;
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { ok: false, error: `Blockierter Host (SSRF-Schutz): ${host}` };
  }
  if (!isHostAllowed(host, allowlist)) {
    return { ok: false, error: `Host nicht in Domain-Allowlist: ${host}` };
  }
  return { ok: true, url };
}
