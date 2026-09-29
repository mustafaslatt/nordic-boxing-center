import { Router } from "express";
import { config, mock } from "../config.js";
import { db, getSetting, setSetting, audit } from "../db.js";
import { verifyPassword, hashPassword } from "../session.js";
import { cancelContract, runBilling, getContract } from "../billing.js";
import { renderContractPage } from "./join.js";

export const admin = Router();

// ---- auth ----
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60_000);
  attempts.set(ip, list);
  return list.length >= 10;
}

admin.post("/api/admin/login", (req, res) => {
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: "For mange forsøk. Vent 15 minutter." });
  const { email, password } = req.body || {};
  const row = db.prepare("SELECT * FROM admins WHERE email = ?").get(String(email || "").trim().toLowerCase());
  if (!row || !verifyPassword(String(password || ""), row.password_hash)) {
    attempts.get(req.ip).push(Date.now());
    return res.status(401).json({ error: "Feil e-post eller passord" });
  }
  req.regenerateSession();
  req.session = { adminId: row.id, adminEmail: row.email };
  audit(row.email, "admin.login");
  res.json({ email: row.email });
});

admin.post("/api/admin/logout", (req, res) => {
  delete req.session.adminId;
  delete req.session.adminEmail;
  res.json({ ok: true });
});

admin.use("/api/admin", (req, res, next) => {
  if (!req.session.adminId) return res.status(401).json({ error: "Ikke innlogget" });
  // CSRF: state-changing admin calls must come from our own origin as JSON.
  if (req.method !== "GET") {
    const origin = req.headers.origin;
    if (origin && origin !== config.publicUrl && origin !== `${req.protocol}://${req.headers.host}`) {
      return res.status(403).json({ error: "Ugyldig opprinnelse" });
    }
    if (!req.is("application/json")) return res.status(415).json({ error: "JSON påkrevd" });
  }
  next();
});

const actor = (req) => req.session.adminEmail;

admin.get("/api/admin/me", (req, res) => res.json({ email: req.session.adminEmail, testMode: mock }));

// ---- dashboard ----
admin.get("/api/admin/stats", (req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const month = new Date().toISOString().slice(0, 7);
  res.json({
    active: one("SELECT COUNT(*) n FROM contracts WHERE status = 'active'").n,
    pending: one("SELECT COUNT(*) n FROM contracts WHERE status = 'pending_payment'").n,
    cancelled: one("SELECT COUNT(*) n FROM contracts WHERE status = 'cancelled'").n,
    mrrOre: one("SELECT COALESCE(SUM(price_ore), 0) s FROM contracts WHERE status = 'active'").s,
    newThisMonth: one("SELECT COUNT(*) n FROM contracts WHERE status = 'active' AND substr(start_date, 1, 7) = ?", month).n,
    paidThisMonthOre: one("SELECT COALESCE(SUM(amount_ore), 0) s FROM payments WHERE status = 'paid' AND substr(paid_at, 1, 7) = ?", month).s,
    failedPayments: one("SELECT COUNT(*) n FROM payments WHERE status = 'failed'").n,
    unverifiedStudents: one("SELECT COUNT(*) n FROM contracts WHERE status = 'active' AND plan = 'student' AND student_verified = 0").n,
    byPlan: db.prepare("SELECT plan, binding_months, COUNT(*) n FROM contracts WHERE status = 'active' GROUP BY plan, binding_months").all(),
    recent: db.prepare(`
      SELECT c.id, c.number, c.plan, c.binding_months, c.price_ore, c.status, c.signed_at, m.name
      FROM contracts c JOIN members m ON m.id = c.member_id ORDER BY c.id DESC LIMIT 8`).all(),
  });
});

// ---- contracts ----
function listContracts({ q = "", status = "" }) {
  const where = [];
  const params = [];
  if (status) { where.push("c.status = ?"); params.push(status); }
  if (q) {
    where.push("(m.name LIKE ? OR m.email LIKE ? OR m.phone LIKE ? OR c.number LIKE ?)");
    params.push(...Array(4).fill(`%${q}%`));
  }
  return db.prepare(`
    SELECT c.id, c.number, c.plan, c.level, c.binding_months, c.price_ore, c.status, c.payment_method,
           c.signed_at, c.start_date, c.binding_end, c.student_verified, m.name, m.email, m.phone, m.birthdate,
           (SELECT COUNT(*) FROM payments p WHERE p.contract_id = c.id AND p.status = 'failed') AS failed_payments
    FROM contracts c JOIN members m ON m.id = c.member_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY c.id DESC LIMIT 500`).all(...params);
}

admin.get("/api/admin/contracts", (req, res) => {
  res.json(listContracts({ q: String(req.query.q || ""), status: String(req.query.status || "") }));
});

admin.get("/api/admin/contracts.csv", (req, res) => {
  const rows = listContracts({ q: String(req.query.q || ""), status: String(req.query.status || "") });
  const cols = ["number", "name", "email", "phone", "birthdate", "plan", "level", "binding_months", "price_ore", "status", "payment_method", "signed_at", "start_date", "binding_end", "student_verified"];
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // prevent formula injection in Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(c === "price_ore" ? r[c] / 100 : r[c])).join(";"))].join("\r\n");
  audit(actor(req), "contracts.export", null, { count: rows.length });
  res.type("text/csv").attachment(`medlemmer-${new Date().toISOString().slice(0, 10)}.csv`).send(csv);
});

admin.get("/api/admin/contracts/:id", (req, res) => {
  const c = getContract(Number(req.params.id));
  if (!c) return res.status(404).json({ error: "Finnes ikke" });
  res.json({
    contract: c,
    member: db.prepare("SELECT * FROM members WHERE id = ?").get(c.member_id),
    payments: db.prepare("SELECT * FROM payments WHERE contract_id = ? ORDER BY id DESC").all(c.id),
    log: db.prepare("SELECT * FROM audit_log WHERE contract_id = ? ORDER BY id DESC").all(c.id),
  });
});

admin.get("/api/admin/contracts/:id/print", (req, res) => {
  const c = getContract(Number(req.params.id));
  if (!c) return res.status(404).send("Finnes ikke");
  res.type("html").send(renderContractPage(c));
});

admin.post("/api/admin/contracts/:id/cancel", async (req, res) => {
  try {
    const c = await cancelContract(Number(req.params.id), { actor: actor(req), reason: String(req.body?.reason || "").slice(0, 500) });
    res.json(c);
  } catch (err) {
    console.error("[cancel]", err);
    res.status(502).json({ error: `Kunne ikke avslutte: ${err.message}` });
  }
});

admin.post("/api/admin/contracts/:id/student", (req, res) => {
  const id = Number(req.params.id);
  const value = req.body?.verified ? 1 : 0;
  db.prepare("UPDATE contracts SET student_verified = ? WHERE id = ?").run(value, id);
  audit(actor(req), value ? "student.verified" : "student.unverified", id);
  res.json(getContract(id));
});

admin.post("/api/admin/contracts/:id/notes", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE contracts SET notes = ? WHERE id = ?").run(String(req.body?.notes || "").slice(0, 5000), id);
  audit(actor(req), "notes.updated", id);
  res.json(getContract(id));
});

// ---- payments ----
admin.get("/api/admin/payments", (req, res) => {
  const status = String(req.query.status || "");
  res.json(db.prepare(`
    SELECT p.*, c.number, m.name FROM payments p
    JOIN contracts c ON c.id = p.contract_id JOIN members m ON m.id = c.member_id
    ${status ? "WHERE p.status = ?" : ""} ORDER BY p.id DESC LIMIT 500`).all(...(status ? [status] : [])));
});

admin.post("/api/admin/billing/run", async (req, res) => {
  const result = await runBilling();
  audit(actor(req), "billing.manual", null, result);
  res.json(result);
});

// ---- settings ----
admin.get("/api/admin/settings", (req, res) => res.json({ prices: getSetting("prices"), terms: getSetting("terms") }));

admin.put("/api/admin/settings", (req, res) => {
  const { prices, terms } = req.body || {};
  const valid = (n) => Number.isInteger(n) && n >= 0 && n <= 10_000_00;
  if (prices) {
    for (const plan of ["student", "ordinar"]) {
      if (!valid(prices[plan]?.free) || !valid(prices[plan]?.bound)) return res.status(400).json({ error: "Ugyldige priser" });
    }
    setSetting("prices", { student: prices.student, ordinar: prices.ordinar });
  }
  if (typeof terms === "string") {
    if (terms.trim().length < 50) return res.status(400).json({ error: "Vilkårene er for korte" });
    setSetting("terms", terms);
  }
  audit(actor(req), "settings.updated", null, { prices: !!prices, terms: typeof terms === "string" });
  res.json({ prices: getSetting("prices"), terms: getSetting("terms") });
});

admin.post("/api/admin/password", (req, res) => {
  const { current, next } = req.body || {};
  const row = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.adminId);
  if (!verifyPassword(String(current || ""), row.password_hash)) return res.status(400).json({ error: "Nåværende passord er feil" });
  if (String(next || "").length < 10) return res.status(400).json({ error: "Nytt passord må ha minst 10 tegn" });
  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hashPassword(next), row.id);
  audit(actor(req), "admin.password_changed");
  res.json({ ok: true });
});

admin.get("/api/admin/audit", (req, res) => {
  res.json(db.prepare("SELECT a.*, c.number FROM audit_log a LEFT JOIN contracts c ON c.id = a.contract_id ORDER BY a.id DESC LIMIT 300").all());
});
