// Norwegian BankID through Criipto Verify (OpenID Connect, authorization code flow).
// https://docs.criipto.com/verify/e-ids/norwegian-bankid/
import { createPublicKey, verify as verifySig } from "node:crypto";
import { config, mock } from "../config.js";

const cfg = config.bankid;
export const redirectUri = () => `${config.publicUrl}/auth/bankid/callback`;

let discovery = null;
async function getDiscovery() {
  if (!discovery) {
    const r = await fetch(`https://${cfg.domain}/.well-known/openid-configuration`);
    if (!r.ok) throw new Error(`BankID discovery feilet (${r.status})`);
    discovery = await r.json();
  }
  return discovery;
}

let jwksCache = { at: 0, keys: [] };
async function getKey(kid) {
  if (Date.now() - jwksCache.at > 3600_000 || !jwksCache.keys.some((k) => k.kid === kid)) {
    const { jwks_uri } = await getDiscovery();
    const r = await fetch(jwks_uri);
    if (!r.ok) throw new Error("Kunne ikke hente BankID-nøkler");
    jwksCache = { at: Date.now(), keys: (await r.json()).keys };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("Ukjent BankID-nøkkel");
  return createPublicKey({ key: jwk, format: "jwk" });
}

const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

async function verifyIdToken(idToken, nonce) {
  const [h, p, s] = idToken.split(".");
  const header = b64json(h);
  if (header.alg !== "RS256") throw new Error("Uventet signaturalgoritme");
  const ok = verifySig("RSA-SHA256", Buffer.from(`${h}.${p}`), await getKey(header.kid), Buffer.from(s, "base64url"));
  if (!ok) throw new Error("Ugyldig BankID-signatur");
  const claims = b64json(p);
  const { issuer } = await getDiscovery();
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== issuer) throw new Error("Feil utsteder");
  if (![].concat(claims.aud).includes(cfg.clientId)) throw new Error("Feil mottaker");
  if (claims.exp < now - 60) throw new Error("BankID-svaret er utløpt");
  if (claims.nonce !== nonce) throw new Error("Ugyldig nonce");
  return claims;
}

export async function authUrl({ state, nonce }) {
  if (mock.bankid) return `/mock/bankid?state=${encodeURIComponent(state)}`;
  const { authorization_endpoint } = await getDiscovery();
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: "openid",
    acr_values: cfg.acr,
    state,
    nonce,
    ui_locales: "nb",
  });
  return `${authorization_endpoint}?${q}`;
}

// Returns the identity we keep. The national identity number (fødselsnummer) is never stored.
export async function exchangeCode(code, nonce) {
  if (mock.bankid) {
    if (!code.startsWith("mock.")) throw new Error("Ugyldig testkode");
    const id = b64json(code.slice(5));
    return { sub: id.sub, name: id.name, birthdate: id.birthdate };
  }
  const { token_endpoint } = await getDiscovery();
  const basic = Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
  const r = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: cfg.clientId }),
  });
  if (!r.ok) throw new Error(`BankID token-feil (${r.status})`);
  const { id_token } = await r.json();
  const c = await verifyIdToken(id_token, nonce);
  const name = c.name || [c.given_name, c.family_name].filter(Boolean).join(" ");
  return { sub: c.sub, name, birthdate: c.birthdate || c.dateofbirth || null };
}
