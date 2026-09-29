import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";

const COOKIE = "nbc_sid";
const TTL_MS = 1000 * 60 * 60 * 12;

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// SQLite-backed session. The session is written synchronously just before the
// response ends, so a redirect is never followed by a request that sees stale data.
export function sessions() {
  const load = db.prepare("SELECT data FROM sessions WHERE id = ? AND expires > ?");
  const save = db.prepare("INSERT INTO sessions (id, data, expires) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires = excluded.expires");
  const purge = db.prepare("DELETE FROM sessions WHERE expires <= ?");
  setInterval(() => purge.run(Date.now()), 1000 * 60 * 30).unref();

  return (req, res, next) => {
    let id = parseCookies(req.headers.cookie)[COOKIE];
    const row = id && /^[a-f0-9]{64}$/.test(id) ? load.get(id, Date.now()) : null;
    req.session = row ? JSON.parse(row.data) : {};
    if (!row) id = null;
    const initial = JSON.stringify(req.session);

    req.regenerateSession = () => {
      if (id) db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      id = null;
    };

    const end = res.end;
    res.end = function (...args) {
      const data = JSON.stringify(req.session);
      if (data !== initial || (id && data !== "{}")) {
        if (!id) id = randomBytes(32).toString("hex");
        save.run(id, data, Date.now() + TTL_MS);
        if (!res.headersSent) {
          res.setHeader("Set-Cookie", `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${config.secureCookies ? "; Secure" : ""}`);
        }
      }
      return end.apply(this, args);
    };
    next();
  };
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
