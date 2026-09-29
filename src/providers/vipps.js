// Vipps MobilePay Recurring API v3: a monthly agreement with an initial charge,
// then one charge per month created by the billing job.
// https://developer.vippsmobilepay.com/docs/APIs/recurring-api/
import { randomUUID } from "node:crypto";
import { config, mock } from "../config.js";

const cfg = config.vipps;
const mockAgreements = new Map();
const mockCharges = new Map();

let token = { value: null, expires: 0 };
async function accessToken() {
  if (token.value && Date.now() < token.expires - 60_000) return token.value;
  const r = await fetch(`${cfg.baseUrl}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      "Ocp-Apim-Subscription-Key": cfg.subscriptionKey,
      "Merchant-Serial-Number": cfg.msn,
    },
  });
  if (!r.ok) throw new Error(`Vipps autentisering feilet (${r.status})`);
  const j = await r.json();
  token = { value: j.access_token, expires: Date.now() + Number(j.expires_in) * 1000 };
  return token.value;
}

async function api(method, path, body, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${await accessToken()}`,
    "Ocp-Apim-Subscription-Key": cfg.subscriptionKey,
    "Merchant-Serial-Number": cfg.msn,
    "Content-Type": "application/json",
    "Vipps-System-Name": "nordic-boxing-center",
    "Vipps-System-Version": "1.0.0",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const r = await fetch(`${cfg.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`Vipps ${method} ${path} feilet (${r.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export async function createAgreement({ contract, productName, phone, returnUrl, agreementUrl }) {
  if (mock.vipps) {
    const agreementId = `mock-agr-${randomUUID().slice(0, 8)}`;
    mockAgreements.set(agreementId, { status: "PENDING", returnUrl, amount: contract.price_ore, productName, phone: String(phone || "").replace(/\D/g, "").slice(-8) });
    return { agreementId, confirmationUrl: `/mock/vipps?id=${agreementId}` };
  }
  const digits = String(phone || "").replace(/\D/g, "");
  const res = await api("POST", "/recurring/v3/agreements", {
    pricing: { type: "LEGACY", amount: contract.price_ore, currency: "NOK" },
    interval: { unit: "MONTH", count: 1 },
    merchantRedirectUrl: returnUrl,
    merchantAgreementUrl: agreementUrl,
    phoneNumber: digits.length === 8 ? `47${digits}` : digits || undefined,
    productName,
    externalId: contract.number,
    initialCharge: {
      amount: contract.price_ore,
      description: `${productName} – første måned`,
      transactionType: "DIRECT_CAPTURE",
      orderId: `${contract.number}-1`,
    },
  }, `agreement-${contract.number}-${Date.now()}`);
  return { agreementId: res.agreementId, confirmationUrl: res.vippsConfirmationUrl };
}

// Mock-only: what the simulated Vipps page shows.
export function mockInfo(agreementId) {
  const a = mockAgreements.get(agreementId);
  return a && a.status === "PENDING" ? { amount: a.amount, productName: a.productName, phone: a.phone } : null;
}

// Mock-only: the simulated Vipps page approves or rejects the agreement.
export function mockDecide(agreementId, approve) {
  const a = mockAgreements.get(agreementId);
  if (!a) return null;
  if (a.status === "PENDING") a.status = approve ? "ACTIVE" : "STOPPED";
  return a.returnUrl;
}

export async function getAgreement(agreementId) {
  if (mock.vipps) return mockAgreements.get(agreementId) || { status: "EXPIRED" };
  return api("GET", `/recurring/v3/agreements/${encodeURIComponent(agreementId)}`);
}

export async function stopAgreement(agreementId) {
  if (mock.vipps) {
    const a = mockAgreements.get(agreementId);
    if (a) a.status = "STOPPED";
    return;
  }
  await api("PATCH", `/recurring/v3/agreements/${encodeURIComponent(agreementId)}`, { status: "STOPPED" }, `stop-${agreementId}`);
}

export async function createCharge(agreementId, { amount, description, due, orderId }) {
  if (mock.vipps) {
    const chargeId = `mock-chg-${randomUUID().slice(0, 8)}`;
    mockCharges.set(chargeId, { status: "CHARGED" });
    return { chargeId };
  }
  const res = await api("POST", `/recurring/v3/agreements/${encodeURIComponent(agreementId)}/charges`, {
    amount,
    transactionType: "DIRECT_CAPTURE",
    description,
    due,
    retryDays: 5,
    orderId,
  }, `charge-${orderId}`);
  return { chargeId: res.chargeId };
}

export async function getCharge(agreementId, chargeId) {
  if (mock.vipps) return mockCharges.get(chargeId) || { status: "CHARGED" };
  return api("GET", `/recurring/v3/agreements/${encodeURIComponent(agreementId)}/charges/${encodeURIComponent(chargeId)}`);
}
