// Simulated BankID / Vipps / card pages, mounted only for providers without credentials.
import { Router, urlencoded } from "express";
import { mock, config } from "../config.js";
import { vippsPage, cardPage } from "./mock-pay.js";
import { bankidPage, analyzeFnr, subFromFnr, TEST_PERSONS } from "./mock-bankid.js";
import * as vipps from "../providers/vipps.js";
import * as stripe from "../providers/stripe.js";

export const mockRoutes = Router();
const form = urlencoded({ extended: false });

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
    const info = vipps.mockInfo(String(req.query.id || ""));
    if (!info) return res.redirect("/bli-medlem.html?steg=betaling&feil=avbrutt");
    res.type("html").send(vippsPage({ id: req.query.id, merchant: config.club.name, ...info }));
  });
  mockRoutes.post("/mock/vipps", form, (req, res) => {
    const back = vipps.mockDecide(req.body.id, req.body.decision === "approve");
    res.redirect(back || "/bli-medlem.html");
  });
}

if (mock.stripe) {
  mockRoutes.get("/mock/kort", (req, res) => {
    const info = stripe.mockInfo(String(req.query.id || ""));
    if (!info) return res.redirect("/bli-medlem.html?steg=betaling&feil=avbrutt");
    res.type("html").send(cardPage({ id: req.query.id, merchant: config.club.name, ...info }));
  });
  mockRoutes.post("/mock/kort", form, (req, res) => {
    res.redirect(stripe.mockDecide(req.body.id, req.body.decision === "approve") || "/bli-medlem.html");
  });
}
