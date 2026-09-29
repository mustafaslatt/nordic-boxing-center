// Test-only imitation of the Norwegian BankID login steps (fødselsnummer → BankID-app or
// kodebrikke → confirm). With Criipto keys configured the user sees the real BankID instead.
import { createHash } from "node:crypto";

// Synthetic numbers (month + 80, Skatteetaten/Tenor style) – cannot belong to real people.
export const TEST_PERSONS = {
  "17859510051": "Kari Nordmann",
  "03918810047": "Ola Nordmann",
  "22880150050": "Emma Hansen",
  "09821150040": "Jonas Berg",
};

// Self-contained so the same code also runs in the page (injected via toString()).
// Returns the birth date (null if the first six digits are no real date) and whether the
// control digits are valid. K1 accepts remainders 0–3: Skatteetaten's rule for numbers issued
// from 2032, which also accepts every number valid under the old rule. K2 is unchanged.
// Handles D-numbers (day + 40) and synthetic numbers (month + 40 / + 80).
export function analyzeFnr(v) {
  if (!/^\d{11}$/.test(v)) return { date: null, checksum: false };
  const d = v.split("").map(Number);
  const mod = (w) => w.reduce((a, x, i) => a + x * d[i], 0) % 11;
  const checksum = mod([3, 7, 6, 1, 8, 9, 4, 5, 2, 1]) <= 3 && mod([5, 4, 3, 2, 7, 6, 5, 4, 3, 2, 1]) === 0;
  let day = Number(v.slice(0, 2)), month = Number(v.slice(2, 4));
  const yy = Number(v.slice(4, 6)), ind = Number(v.slice(6, 9));
  if (day > 40) day -= 40;
  if (month > 80) month -= 80; else if (month > 40) month -= 40;
  const year = ind <= 499 ? 1900 + yy : ind <= 749 && yy >= 54 ? 1800 + yy : yy <= 39 ? 2000 + yy : 1900 + yy;
  const dt = new Date(Date.UTC(year, month - 1, day));
  const real = dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day && dt <= new Date();
  const date = real ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
  return { date, checksum };
}

// Only a hash of the number is kept, as a stable test identity.
export const subFromFnr = (fnr) => "mock-" + createHash("sha256").update(fnr).digest("hex").slice(0, 24);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export function bankidPage({ state, merchant, error }) {
  const persons = Object.entries(TEST_PERSONS).map(([fnr, name]) => {
    const b = analyzeFnr(fnr).date.split("-").reverse().join(".");
    return `<button type="button" class="person" data-fnr="${fnr}"><b>${esc(name)}</b><span>${b}${Number(b.slice(-4)) > new Date().getFullYear() - 18 ? " · under 18" : ""}</span></button>`;
  }).join("");

  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BankID (test)</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#eef0f3;color:#1b1b1f;min-height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
.banner{background:#d9b77f;color:#0a1628;text-align:center;font-weight:600;font-size:13px;padding:9px 16px}
main{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px}
.card{width:100%;max-width:440px;background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px -12px rgba(0,0,0,.18);overflow:hidden}
.top{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid #e6e6ea}
.wordmark{font-weight:700;font-size:20px;letter-spacing:-.02em;color:#39134c}
.merchant{font-size:13px;color:#5f5f6b;text-align:right}
.merchant b{display:block;color:#1b1b1f;font-weight:600}
.body{padding:28px 24px 24px}
h1{font-size:22px;font-weight:600;letter-spacing:-.01em;margin-bottom:6px}
.sub{font-size:14px;color:#5f5f6b;margin-bottom:22px;line-height:1.5}
label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}
input{width:100%;font:inherit;font-size:20px;letter-spacing:.12em;padding:13px 14px;border:1.5px solid #8b8b96;border-radius:8px;color:#1b1b1f;background:#fff;font-variant-numeric:tabular-nums}
input:focus{outline:none;border-color:#39134c;box-shadow:0 0 0 3px rgba(57,19,76,.15)}
input.bad{border-color:#c62828}
.hint{font-size:13px;color:#5f5f6b;margin-top:8px}
.error{font-size:13px;color:#c62828;margin-top:8px;font-weight:500}
.btn{display:block;width:100%;font:inherit;font-weight:600;font-size:16px;padding:14px;border-radius:8px;border:0;cursor:pointer;margin-top:20px;background:#39134c;color:#fff;transition:background .15s}
.btn:hover{background:#4d1d66}
.btn.secondary{background:transparent;color:#39134c;margin-top:10px}
.btn.secondary:hover{background:#f4eef7}
.option{display:flex;align-items:center;gap:14px;width:100%;text-align:left;font:inherit;padding:16px;border:1.5px solid #d4d4db;border-radius:10px;background:#fff;cursor:pointer;margin-bottom:10px;transition:border-color .15s,background .15s}
.option:hover{border-color:#39134c;background:#faf7fc}
.option .ico{width:40px;height:40px;border-radius:10px;background:#f1ecf4;color:#39134c;display:grid;place-items:center;flex-shrink:0}
.option .ico svg{width:22px;height:22px}
.option b{display:block;font-size:15px;color:#1b1b1f}
.option span{font-size:13px;color:#5f5f6b}
.option .arrow{margin-left:auto;color:#8b8b96}
.ref{margin:6px 0 22px;padding:18px;border-radius:10px;background:#f4eef7;text-align:center}
.ref small{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5f5f6b;margin-bottom:6px}
.ref strong{font-size:22px;letter-spacing:.06em;color:#39134c}
.wait{display:flex;align-items:center;gap:12px;font-size:14px;color:#5f5f6b}
.spinner{width:22px;height:22px;border-radius:50%;border:3px solid #e2d6ea;border-top-color:#39134c;animation:spin 1s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.done{text-align:center;padding:12px 0}
.done .check{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:#e7f4ec;color:#1f7a45;display:grid;place-items:center}
.done .check svg{width:28px;height:28px}
.persons{margin-top:26px;padding-top:18px;border-top:1px dashed #d4d4db}
.persons p{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b6a1f;margin-bottom:10px}
.persons div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.person{font:inherit;text-align:left;padding:10px 12px;border:1px solid #e6e6ea;border-radius:8px;background:#fafafb;cursor:pointer}
.person:hover{border-color:#39134c}
.person b{display:block;font-size:13px}
.person span{font-size:12px;color:#5f5f6b}
.foot{padding:14px 24px;border-top:1px solid #e6e6ea;display:flex;justify-content:space-between;font-size:13px}
.foot a{color:#5f5f6b}
@media (max-width:480px){main{padding:0}.card{border-radius:0;box-shadow:none;min-height:calc(100vh - 36px)}.persons div{grid-template-columns:1fr}}
</style></head>
<body>
<div class="banner">TESTMODUS – ikke ekte BankID. Bruk et testnummer, ikke ditt eget fødselsnummer.</div>
<main>
<div class="card">
  <div class="top">
    <span class="wordmark">BankID</span>
    <span class="merchant">Logg inn hos<b>${esc(merchant)}</b></span>
  </div>

  <form class="body" id="f" method="post" action="/mock/bankid" novalidate>
    <input type="hidden" name="state" value="${esc(state)}">
    <input type="hidden" name="via" value="app">

    <section data-step="fnr">
      <h1>Logg inn med BankID</h1>
      <p class="sub">Skriv inn fødselsnummeret ditt (11 siffer).</p>
      <label for="fnr">Fødselsnummer</label>
      <input id="fnr" name="fnr" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="DDMMÅÅXXXXX" aria-describedby="fnr-msg">
      <div id="fnr-msg" class="${error ? "error" : "hint"}" role="alert">${error ? esc(error) : "Testmodus: velg en testperson nedenfor."}</div>
      <button type="button" class="btn" id="to-method">Neste</button>
      <div class="persons"><p>Testpersoner (syntetiske)</p><div>${persons}</div></div>
    </section>

    <section data-step="method" hidden>
      <h1>Velg BankID</h1>
      <p class="sub">Hvordan vil du bekrefte at det er deg?</p>
      <button type="button" class="option" data-method="app">
        <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg></span>
        <span><b>BankID-app</b><span>Bekreft i appen på mobilen</span></span><span class="arrow">›</span>
      </button>
      <button type="button" class="option" data-method="kodebrikke">
        <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 10h8M8 14h5"/></svg></span>
        <span><b>BankID med kodebrikke</b><span>Engangskode fra kodebrikken</span></span><span class="arrow">›</span>
      </button>
      <button type="button" class="btn secondary" data-back="fnr">Tilbake</button>
    </section>

    <section data-step="app" hidden>
      <h1>Åpne BankID-appen</h1>
      <p class="sub">Sjekk at referansen i appen er den samme som her, og bekreft med PIN eller biometri.</p>
      <div class="ref"><small>Referanse</small><strong id="ref"></strong></div>
      <div class="wait"><span class="spinner" aria-hidden="true"></span>Venter på bekreftelse i appen…</div>
      <button type="button" class="btn" id="app-ok">Bekreft i appen (test)</button>
      <button type="button" class="btn secondary" data-back="method">Avbryt</button>
    </section>

    <section data-step="kodebrikke" hidden>
      <h1>Engangskode</h1>
      <p class="sub">Trykk på knappen på kodebrikken og skriv inn koden (6 siffer).</p>
      <label for="otp">Engangskode</label>
      <input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
      <div class="hint" id="otp-msg">Testmodus: alle 6 siffer godtas.</div>
      <button type="button" class="btn" id="otp-ok">Neste</button>
      <button type="button" class="btn secondary" data-back="method">Tilbake</button>
    </section>

    <section data-step="done" hidden>
      <div class="done">
        <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
        <h1>Du er logget inn</h1>
        <p class="sub">Sender deg tilbake til ${esc(merchant)}…</p>
      </div>
    </section>
  </form>

  <div class="foot"><a href="/auth/bankid/callback?error=cancelled">Avbryt</a><span style="color:#8b8b96">Test</span></div>
</div>
</main>
<script>
(function () {
  const f = document.getElementById("f");
  const fnr = document.getElementById("fnr");
  const msg = document.getElementById("fnr-msg");
  const analyzeFnr = ${analyzeFnr.toString()};
  let warnedFor = null;
  const WORDS = ["ROLIG","MODIG","RASK","STERK","KLOK","GLAD","STILLE","SOLID"];
  const NOUNS = ["BOKSER","HANSKE","RINGEN","RUNDE","SLAG","JAB","TRENER","GONG"];

  function go(step) {
    f.querySelectorAll("[data-step]").forEach((s) => (s.hidden = s.dataset.step !== step));
    const first = f.querySelector('[data-step="' + step + '"] input:not([type=hidden]), [data-step="' + step + '"] button');
    if (first) first.focus();
  }
  function finish() {
    go("done");
    setTimeout(() => f.submit(), 900);
  }

  fnr.addEventListener("input", () => { fnr.value = fnr.value.replace(/\\D/g, "").slice(0, 11); fnr.classList.remove("bad"); warnedFor = null; });
  fnr.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("to-method").click(); } });
  document.getElementById("to-method").addEventListener("click", () => {
    const bad = (text) => { fnr.classList.add("bad"); msg.className = "error"; msg.textContent = text; fnr.focus(); };
    if (fnr.value.length !== 11) return bad("Fødselsnummeret må ha 11 siffer.");
    const r = analyzeFnr(fnr.value);
    if (!r.date) return bad("Ugyldig fødselsnummer: de seks første sifrene må være en fødselsdato (DDMMÅÅ).");
    if (!r.checksum && warnedFor !== fnr.value) {
      warnedFor = fnr.value;
      msg.className = "error";
      msg.textContent = "Kontrollsifrene stemmer ikke – ekte BankID ville avvist nummeret. Trykk «Neste» igjen for å fortsette i testmodus.";
      return;
    }
    go("method");
  });
  document.querySelectorAll(".person").forEach((b) => b.addEventListener("click", () => {
    fnr.value = b.dataset.fnr;
    fnr.classList.remove("bad");
    msg.className = "hint";
    msg.textContent = "Testperson valgt.";
  }));
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => go(b.dataset.back)));
  document.querySelectorAll("[data-method]").forEach((b) => b.addEventListener("click", () => {
    f.elements.via.value = b.dataset.method;
    if (b.dataset.method === "app") {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      document.getElementById("ref").textContent = pick(WORDS) + " " + pick(NOUNS);
    }
    go(b.dataset.method);
  }));
  document.getElementById("app-ok").addEventListener("click", finish);
  const otp = document.getElementById("otp");
  otp.addEventListener("input", () => { otp.value = otp.value.replace(/\\D/g, "").slice(0, 6); otp.classList.remove("bad"); });
  otp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("otp-ok").click(); } });
  document.getElementById("otp-ok").addEventListener("click", () => {
    if (otp.value.length !== 6) { otp.classList.add("bad"); document.getElementById("otp-msg").className = "error"; document.getElementById("otp-msg").textContent = "Koden må ha 6 siffer."; return otp.focus(); }
    finish();
  });
  fnr.focus();
})();
</script>
</body></html>`;
}
