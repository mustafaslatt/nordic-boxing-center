// Simulated BankID / Vipps / card pages, mounted only for providers without credentials.
import { Router, urlencoded } from "express";
import { mock, config } from "../config.js";
import { bankidPage, analyzeFnr, subFromFnr, TEST_PERSONS } from "./mock-bankid.js";
import * as vipps from "../providers/vipps.js";
import * as stripe from "../providers/stripe.js";

export const mockRoutes = Router();
const form = urlencoded({ extended: false });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const page = (title, body) => `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} (test)</title><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/base.css"></head>
<body class="mock"><div class="mock-banner">TESTMODUS – ingen ekte BankID eller betaling</div>
<main class="mock-card">${body}</main></body></html>`;

if (mock.bankid) {
  mockRoutes.get("/mock/bankid", (req, res) => {
    res.type("html").send(bankidPage({ state: req.query.state, merchant: config.club.name }));
  });
  mockRoutes.post("/mock/bankid", form, (req, res) => {
    const { state, fnr } = req.body;
    // Test mode accepts any number with a real birth date; the page warns about bad control digits.
    const { date } = analyzeFnr(String(fnr || ""));
    if (!date) {
      return res.type("html").send(bankidPage({ state, merchant: config.club.name, error: "Ugyldig fødselsnummer." }));
    }
    // The number itself is dropped here; only name, birth date and a hash travel on.
    const identity = { sub: subFromFnr(fnr), name: TEST_PERSONS[fnr] || "Test Person", birthdate: date };
    const code = "mock." + Buffer.from(JSON.stringify(identity)).toString("base64url");
    res.redirect(`/auth/bankid/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`);
  });
}

if (mock.vipps) {
  mockRoutes.get("/mock/vipps", (req, res) => {
    const id = esc(req.query.id);
    res.type("html").send(page("Vipps", `
      <div class="mock-brand">Vipps</div>
      <h1>Godkjenn fast betaling</h1>
      <p class="muted">Månedlig trekk til Nordic Boxing Center. Første måned trekkes nå.</p>
      <form method="post" action="/mock/vipps" class="stack">
        <input type="hidden" name="id" value="${id}">
        <button class="btn btn-primary" name="decision" value="approve">Godkjenn</button>
        <button class="btn btn-ghost" name="decision" value="reject">Avvis</button>
      </form>`));
  });
  mockRoutes.post("/mock/vipps", form, (req, res) => {
    const back = vipps.mockDecide(req.body.id, req.body.decision === "approve");
    res.redirect(back || "/bli-medlem.html");
  });
}

if (mock.stripe) {
  mockRoutes.get("/mock/kort", (req, res) => {
    const id = esc(req.query.id);
    res.type("html").send(page("Kortbetaling", `
      <div class="mock-brand">Kort</div>
      <h1>Betal med kort</h1>
      <p class="muted">Med ekte nøkler åpnes Stripe Checkout her. Kortet belastes deretter automatisk hver måned.</p>
      <form method="post" action="/mock/kort" class="stack">
        <input type="hidden" name="id" value="${id}">
        <button class="btn btn-primary" name="decision" value="approve">Betal (test)</button>
        <button class="btn btn-ghost" name="decision" value="reject">Avbryt</button>
      </form>`));
  });
  mockRoutes.post("/mock/kort", form, (req, res) => {
    res.redirect(stripe.mockDecide(req.body.id, req.body.decision === "approve") || "/bli-medlem.html");
  });
}
