import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import { DEFAULT_TERMS } from "./contract.js";

mkdirSync(dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY,
  bankid_sub  TEXT UNIQUE,
  name        TEXT NOT NULL,
  birthdate   TEXT,
  email       TEXT,
  phone       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id               INTEGER PRIMARY KEY,
  number           TEXT UNIQUE,
  member_id        INTEGER NOT NULL REFERENCES members(id),
  plan             TEXT NOT NULL,
  level            TEXT,
  binding_months   INTEGER NOT NULL,
  price_ore        INTEGER NOT NULL,
  status           TEXT NOT NULL,
  contract_text    TEXT NOT NULL,
  contract_hash    TEXT NOT NULL,
  signed_at        TEXT NOT NULL,
  sign_ip          TEXT,
  sign_user_agent  TEXT,
  bankid_name      TEXT,
  bankid_birthdate TEXT,
  bankid_sub       TEXT,
  student_verified INTEGER NOT NULL DEFAULT 0,
  payment_method   TEXT,
  provider_ref     TEXT,
  start_date       TEXT,
  binding_end      TEXT,
  next_charge_date TEXT,
  cancelled_at     TEXT,
  cancel_reason    TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS contracts_provider_ref ON contracts(provider_ref);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY,
  contract_id  INTEGER NOT NULL REFERENCES contracts(id),
  provider     TEXT NOT NULL,
  provider_ref TEXT UNIQUE,
  amount_ore   INTEGER NOT NULL,
  status       TEXT NOT NULL,
  due_date     TEXT,
  paid_at      TEXT,
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  contract_id INTEGER,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const DEFAULT_SETTINGS = {
  // Prices in øre, from nordicboxingcenter.no/bli-medlem
  prices: { student: { free: 39900, bound: 34900 }, ordinar: { free: 49900, bound: 44900 } },
  terms: DEFAULT_TERMS,
};

const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, JSON.stringify(v));

export function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : undefined;
}

export function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export function audit(actor, action, contractId = null, details = null) {
  db.prepare("INSERT INTO audit_log (actor, action, contract_id, details) VALUES (?, ?, ?, ?)")
    .run(actor, action, contractId, details == null ? null : typeof details === "string" ? details : JSON.stringify(details));
}

export function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
