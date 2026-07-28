// smejj.com — Rollenmodell des Adminbereichs (Single Responsibility: wer darf was).
// Reine Datenstruktur ohne I/O: keine Netz-, keine Speicherzugriffe. Damit ist die
// Matrix vollstaendig testbar und die Durchsetzung liegt an genau einer Stelle
// (adminAuth.js).
//
// Fail-closed: Was nicht ausdruecklich erteilt ist, gilt als verboten. Eine
// unbekannte Rolle oder eine unbekannte Berechtigung ergibt IMMER "deny".

// Rollen, die den Adminbereich ueberhaupt betreten duerfen. "user" ist bewusst
// NICHT dabei — ein gewoehnliches Konto ist kein stiller Readonly-Admin.
export const ADMIN_ROLES = Object.freeze(["owner", "admin", "support", "finance", "auditor", "readonly"]);

// Abstufungen einer Berechtigung:
//   allow   — direkt erlaubt
//   dual    — erlaubt, aber erst nach Freigabe durch eine zweite Person
//   consent — erlaubt, aber nur mit ausdruecklicher Einwilligung der betroffenen Person
//   deny    — verboten
export const GRANT = Object.freeze({ allow: "allow", dual: "dual", consent: "consent", deny: "deny" });

// Die Matrix aus Modul C des Mockups, eins zu eins.
const MATRIX = Object.freeze({
  "users.read":        { owner: "allow", admin: "allow", support: "allow",   finance: "allow", auditor: "allow", readonly: "allow" },
  "users.block":       { owner: "allow", admin: "allow", support: "deny",    finance: "deny",  auditor: "deny",  readonly: "deny" },
  // Loeschen ist unumkehrbar — deshalb Vier-Augen fuer JEDE Rolle, auch fuer den
  // Owner. Eine einzelne Person kann kein Konto vernichten.
  "users.delete":      { owner: "dual",  admin: "dual",  support: "deny",    finance: "deny",  auditor: "deny",  readonly: "deny" },
  // Rollenvergabe ist Rechteausweitung: wer sie allein kann, kann sich selbst
  // alles geben. Auch hier Vier-Augen fuer jede Rolle.
  "users.role.grant":  { owner: "dual",  admin: "dual",  support: "deny",    finance: "deny",  auditor: "deny",  readonly: "deny" },
  // Umkehrbar und im Supportalltag noetig: Sitzungen widerrufen, E-Mail
  // bestaetigen, Login-Sperre aufheben. Support darf das, ohne zweite Person.
  "users.sessions.revoke": { owner: "allow", admin: "allow", support: "allow", finance: "deny", auditor: "deny", readonly: "deny" },
  "users.verify":      { owner: "allow", admin: "allow", support: "allow",   finance: "deny",  auditor: "deny",  readonly: "deny" },
  "users.unlock":      { owner: "allow", admin: "allow", support: "allow",   finance: "deny",  auditor: "deny",  readonly: "deny" },
  "users.content.read":{ owner: "dual",  admin: "deny",  support: "consent", finance: "deny",  auditor: "deny",  readonly: "deny" },
  "impersonation.start":{ owner: "allow",admin: "allow", support: "consent", finance: "deny",  auditor: "deny",  readonly: "deny" },
  "billing.write":     { owner: "allow", admin: "deny",  support: "deny",    finance: "allow", auditor: "deny",  readonly: "deny" },
  "models.write":      { owner: "allow", admin: "allow", support: "deny",    finance: "deny",  auditor: "deny",  readonly: "deny" },
  "apikeys.revoke":    { owner: "allow", admin: "allow", support: "deny",    finance: "deny",  auditor: "deny",  readonly: "deny" },
  "audit.read":        { owner: "allow", admin: "allow", support: "deny",    finance: "allow", auditor: "allow", readonly: "deny" },
  "index.rebuild":     { owner: "allow", admin: "allow", support: "deny",    finance: "deny",  auditor: "deny",  readonly: "deny" }
});

// Das Audit-Log ist fuer JEDE Rolle unveraenderlich — auch fuer den Owner.
// Diese Berechtigung existiert absichtlich nicht in der Matrix; sie steht hier
// nur, damit ein Aufruf von can("owner", "audit.write") sichtbar "deny" ergibt
// statt still durchzufallen.
export const NEVER_GRANTED = Object.freeze(["audit.write", "audit.delete"]);

export const PERMISSIONS = Object.freeze(Object.keys(MATRIX));

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(String(role || "").trim().toLowerCase());
}

/** Liefert die Abstufung als Zeichenkette ("allow" | "dual" | "consent" | "deny"). */
export function can(role, permission) {
  const key = String(permission || "").trim();
  if (NEVER_GRANTED.includes(key)) return GRANT.deny;
  const row = MATRIX[key];
  if (!row) return GRANT.deny;
  const normalized = String(role || "").trim().toLowerCase();
  return row[normalized] || GRANT.deny;
}

/** Nur "allow" gilt als sofort erlaubt. "dual" und "consent" brauchen einen zweiten Schritt. */
export function isAllowed(role, permission) {
  return can(role, permission) === GRANT.allow;
}

/** Vollstaendige Rechteliste einer Rolle — fuer /api/admin/me und die Oberflaeche. */
export function permissionsFor(role) {
  const normalized = String(role || "").trim().toLowerCase();
  const result = {};
  for (const permission of PERMISSIONS) result[permission] = can(normalized, permission);
  return result;
}
