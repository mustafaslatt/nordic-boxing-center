import { resolve } from "node:path";

const env = process.env;
export const ROOT = resolve(import.meta.dirname, "..");
const port = Number(env.PORT) || 5178;
const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, "");

export const config = {
  port,
  publicUrl,
  production: env.NODE_ENV === "production",
  secureCookies: publicUrl.startsWith("https://"),
  dbFile: resolve(ROOT, env.DB_FILE || "data/nbc.sqlite"),

  club: {
    name: "Nordic Boxing Center",
    address: "Lumberveien 29C, 4621 Kristiansand",
    email: "nordicboxingcenter@outlook.com",
    phone: "+47 902 20 290",
    orgnr: env.CLUB_ORGNR || "",
  },

  // BankID via Criipto Verify (OpenID Connect)
  bankid: {
    domain: env.CRIIPTO_DOMAIN || "",
    clientId: env.CRIIPTO_CLIENT_ID || "",
    clientSecret: env.CRIIPTO_CLIENT_SECRET || "",
    acr: env.CRIIPTO_ACR || "urn:grn:authn:no:bankid",
  },

  // Vipps MobilePay Recurring API v3
  vipps: {
    baseUrl: env.VIPPS_ENV === "prod" ? "https://api.vipps.no" : "https://apitest.vipps.no",
    clientId: env.VIPPS_CLIENT_ID || "",
    clientSecret: env.VIPPS_CLIENT_SECRET || "",
    subscriptionKey: env.VIPPS_SUBSCRIPTION_KEY || "",
    msn: env.VIPPS_MSN || "",
  },

  // Card payments via Stripe Checkout (subscriptions)
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
  },

  admin: {
    email: env.ADMIN_EMAIL || "",
    password: env.ADMIN_PASSWORD || "",
  },
};

// Providers without credentials run in a local simulation so the whole flow can be tested.
export const mock = {
  bankid: !config.bankid.domain,
  vipps: !config.vipps.clientId,
  stripe: !config.stripe.secretKey,
};

if (config.production && (mock.bankid || mock.vipps || mock.stripe)) {
  const missing = Object.entries(mock).filter(([, m]) => m).map(([k]) => k).join(", ");
  throw new Error(`NODE_ENV=production, men nøkler mangler for: ${missing}. Testmodus er ikke tillatt i produksjon.`);
}
