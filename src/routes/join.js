import { Router } from "express";
import { randomBytes } from "node:crypto";
import { config, mock } from "../config.js";
import { db, getSetting, audit, transaction } from "../db.js";
import { PLAN_LABEL, LEVELS, ageFrom, priceFor, buildContractText, sha256, noDate } from "../contract.js";
import { activateContract, getContract } from "../billing.js";
import * as bankid from "../providers/bankid.js";
import * as vipps from "../providers/vipps.js";
import * as stripe from "../providers/stripe.js";

export const join = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (res, status, message) => res.status(status).json({ error: message });
const productName = (c) => `Nordic Boxing Center – ${PLAN_LABEL[c.plan]}${c.binding_months ? " (12 mnd binding)" : ""}`;

function sessionContract(req) {
  const id = req.session.join?.contractId;
  return id ? getContract(id) : null;
}

join.get("/api/config", (req, res) => {
  res.json({ prices: getSetting("prices"), club: config.club, testMode: mock });
});

join.post("/api/join/start", async (req, res) => {
  const { plan, binding, level } = req.body || {};
  if (!PLAN_LABEL[plan]) return fail(res, 400, "Velg medlemskap");
  if (![0, 12].includes(Number(binding))) return fail(res, 400, "Velg bindingstid");
  if (!LEVELS.includes(level)) return fail(res, 400, "Velg nivå");
  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  req.session.join = { plan, binding: Number(binding), level, state, nonce };
  try {
    res.json({ redirect: await bankid.authUrl({ state, nonce }) });
  } catch (err) {
    console.error("[bankid]", err);
    fail(res, 502, "BankID er ikke tilgjengelig akkurat nå. Prøv igjen om litt.");
  }
});

join.post("/api/join/reset", (req, res) => {
  delete req.session.join;
  res.json({ ok: true });
});

join.get("/auth/bankid/callback", async (req, res) => {
  const j = req.session.join;
  const { code, state, error } = req.query;
  if (error || !j || !code || state !== j.state) return res.redirect("/bli-medlem.html?feil=bankid");
  try {
    j.identity = await bankid.exchangeCode(String(code), j.nonce);
    delete j.state;
    delete j.contractId;
    res.redirect("/bli-medlem.html?steg=kontrakt");
  } catch (err) {
    console.error("[bankid]", err);
    res.redirect("/bli-medlem.html?feil=bankid");
  }
});

join.get("/api/join/state", (req, res) => {
  const j = req.session.join;
  if (!j) return res.json({ step: "velg" });
  const prices = getSetting("prices");
  const priceOre = priceFor(prices, j.plan, j.binding);
  const out = { plan: j.plan, planLabel: PLAN_LABEL[j.plan], binding: j.binding, level: j.level, priceOre };
  if (!j.identity) return res.json({ step: "velg", ...out });

  const age = ageFrom(j.identity.birthdate);
  out.identity = { name: j.identity.name, birthdate: noDate(j.identity.birthdate), age };
  const c = sessionContract(req);
  if (c) {
    out.contract = { id: c.id, number: c.number, status: c.status, method: c.payment_method, priceOre: c.price_ore };
    out.step = c.status === "active" ? "ferdig" : "betaling";
  } else {
    out.step = "kontrakt";
    out.contractPreview = buildContractText({
      club: config.club, member: j.identity, plan: j.plan, level: j.level,
      bindingMonths: j.binding, priceOre, terms: getSetting("terms"),
    });
  }
  res.json(out);
});

join.post("/api/join/sign", (req, res) => {
  const j = req.session.join;
  if (!j?.identity) return fail(res, 401, "Logg inn med BankID først");
  const existing = sessionContract(req);
  if (existing) return res.json({ id: existing.id, number: existing.number });

  const { email, phone, studentConfirm, accept } = req.body || {};
  const age = ageFrom(j.identity.birthdate);
  if (age !== null && age < 18) return fail(res, 403, "Medlemmer under 18 år må meldes inn av foresatte. Ta kontakt med oss.");
  if (!EMAIL_RE.test(email || "")) return fail(res, 400, "Skriv inn en gyldig e-postadresse");
  const phoneDigits = String(phone || "").replace(/[^\d+]/g, "");
  if (phoneDigits.replace(/\D/g, "").length < 8) return fail(res, 400, "Skriv inn et gyldig telefonnummer");
  if (j.plan === "student" && !studentConfirm) return fail(res, 400, "Bekreft at du er student");
  if (accept !== true) return fail(res, 400, "Du må godta vilkårene");
  const alreadyActive = db.prepare(`
    SELECT c.number FROM contracts c JOIN members m ON m.id = c.member_id
    WHERE m.bankid_sub = ? AND c.status = 'active'`).get(j.identity.sub);
  if (alreadyActive) return fail(res, 409, `Du har allerede et aktivt medlemskap (${alreadyActive.number}). Ta kontakt med oss for å endre det.`);

  const priceOre = priceFor(getSetting("prices"), j.plan, j.binding);
  const signedAt = new Date().toISOString();
  const member = { ...j.identity, email: email.trim(), phone: phoneDigits };
  const text = buildContractText({
    club: config.club, member, plan: j.plan, level: j.level,
    bindingMonths: j.binding, priceOre, terms: getSetting("terms"), signedAt,
  });

  const contract = transaction(() => {
    db.prepare(`
      INSERT INTO members (bankid_sub, name, birthdate, email, phone) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(bankid_sub) DO UPDATE SET name = excluded.name, birthdate = excluded.birthdate, email = excluded.email, phone = excluded.phone
    `).run(member.sub, member.name, member.birthdate, member.email, member.phone);
    const memberId = db.prepare("SELECT id FROM members WHERE bankid_sub = ?").get(member.sub).id;
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO contracts (member_id, plan, level, binding_months, price_ore, status, contract_text, contract_hash,
        signed_at, sign_ip, sign_user_agent, bankid_name, bankid_birthdate, bankid_sub)
      VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(memberId, j.plan, j.level, j.binding, priceOre, text, sha256(text), signedAt,
      req.ip, String(req.headers["user-agent"] || "").slice(0, 300), member.name, member.birthdate, member.sub);
    const id = Number(lastInsertRowid);
    const number = `NBC-${signedAt.slice(0, 4)}-${String(id).padStart(4, "0")}`;
    db.prepare("UPDATE contracts SET number = ? WHERE id = ?").run(number, id);
    audit(`medlem:${member.name}`, "contract.signed", id, { number });
    return { id, number };
  });

  j.contractId = contract.id;
  res.json(contract);
});

join.post("/api/join/pay", async (req, res) => {
  const c = sessionContract(req);
  if (!c) return fail(res, 400, "Ingen kontrakt å betale");
  if (c.status === "active") return res.json({ redirect: "/bli-medlem.html?steg=ferdig" });
  const method = req.body?.method;
  if (!["vipps", "card"].includes(method)) return fail(res, 400, "Velg betalingsmåte");
  const member = db.prepare("SELECT * FROM members WHERE id = ?").get(c.member_id);

  try {
    let redirect;
    if (method === "vipps") {
      const { agreementId, confirmationUrl } = await vipps.createAgreement({
        contract: c,
        productName: productName(c),
        phone: member.phone,
        returnUrl: `${config.publicUrl}/betaling/vipps/retur`,
        agreementUrl: `${config.publicUrl}/min-kontrakt`,
      });
      db.prepare("UPDATE contracts SET payment_method = 'vipps', provider_ref = ? WHERE id = ?").run(agreementId, c.id);
      redirect = confirmationUrl;
    } else {
      const session = await stripe.createCheckout({
        contract: c,
        productName: productName(c),
        email: member.email,
        successUrl: `${config.publicUrl}/betaling/kort/retur`,
        cancelUrl: `${config.publicUrl}/bli-medlem.html?steg=betaling&feil=avbrutt`,
      });
      db.prepare("UPDATE contracts SET payment_method = 'card', provider_ref = ? WHERE id = ?").run(session.id, c.id);
      redirect = session.url;
    }
    audit("system", "payment.started", c.id, { method });
    res.json({ redirect });
  } catch (err) {
    console.error("[pay]", err);
    fail(res, 502, "Betalingen kunne ikke startes. Prøv igjen, eller velg en annen betalingsmåte.");
  }
});

join.get("/betaling/vipps/retur", async (req, res) => {
  const c = sessionContract(req);
  if (!c || c.payment_method !== "vipps") return res.redirect("/bli-medlem.html");
  if (c.status === "active") return res.redirect("/bli-medlem.html?steg=ferdig");
  try {
    const agreement = await vipps.getAgreement(c.provider_ref);
    if (agreement.status === "ACTIVE") {
      activateContract(c.id, { providerRef: c.provider_ref, paymentRef: `${c.provider_ref}:initial` });
      return res.redirect("/bli-medlem.html?steg=ferdig");
    }
    if (agreement.status === "PENDING") return res.redirect("/bli-medlem.html?steg=betaling&venter=vipps");
    res.redirect("/bli-medlem.html?steg=betaling&feil=avbrutt");
  } catch (err) {
    console.error("[vipps]", err);
    res.redirect("/bli-medlem.html?steg=betaling&feil=ukjent");
  }
});

join.get("/betaling/kort/retur", async (req, res) => {
  const c = sessionContract(req);
  if (!c || c.payment_method !== "card") return res.redirect("/bli-medlem.html");
  if (c.status === "active") return res.redirect("/bli-medlem.html?steg=ferdig");
  try {
    const s = await stripe.getCheckout(String(req.query.session_id || ""));
    if (!s || s.id !== c.provider_ref) return res.redirect("/bli-medlem.html?steg=betaling&feil=ukjent");
    if (s.status === "complete" && s.payment_status === "paid") {
      activateContract(c.id, { providerRef: s.subscription, paymentRef: s.invoice });
      return res.redirect("/bli-medlem.html?steg=ferdig");
    }
    res.redirect("/bli-medlem.html?steg=betaling&feil=avbrutt");
  } catch (err) {
    console.error("[stripe]", err);
    res.redirect("/bli-medlem.html?steg=betaling&feil=ukjent");
  }
});

join.get("/min-kontrakt", (req, res) => {
  const c = sessionContract(req);
  if (!c) return res.redirect("/bli-medlem.html");
  res.type("html").send(renderContractPage(c));
});

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export function renderContractPage(c) {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kontrakt ${esc(c.number)}</title>
<style>
body{font-family:Inter,system-ui,sans-serif;background:#f3f4f6;color:#0a1628;margin:0;padding:32px 16px}
main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d3d7de;border-radius:16px;padding:40px}
pre{white-space:pre-wrap;font:15px/1.65 Inter,system-ui,sans-serif;margin:0}
.meta{margin-top:32px;padding-top:20px;border-top:1px solid #d3d7de;font-size:13px;color:#4a525e;word-break:break-all}
.bar{max-width:760px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center}
button{font:inherit;font-weight:600;padding:10px 18px;border-radius:10px;border:0;background:#0a1628;color:#fff;cursor:pointer}
a{color:#23426b}
@media print{body{background:#fff;padding:0}.bar{display:none}main{border:0;padding:0}}
</style></head><body>
<div class="bar"><a href="/">← Nordic Boxing Center</a><button onclick="print()">Skriv ut / lagre PDF</button></div>
<main><pre>${esc(c.contract_text)}</pre>
<div class="meta">Kontraktnr.: ${esc(c.number)}<br>Status: ${esc(c.status)}<br>Signert: ${esc(c.signed_at)}<br>SHA-256: ${esc(c.contract_hash)}</div></main>
</body></html>`;
}
