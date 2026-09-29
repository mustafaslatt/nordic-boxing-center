// Test-only imitations of the Vipps agreement flow and a card checkout. With real keys the
// user goes to Vipps / Stripe instead. The card page accepts only Stripe's published test
// cards and never sends card data to the server – only the approve/reject decision.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const kr = (ore) => `${(Number(ore) / 100).toLocaleString("nb-NO")} kr`;

const head = (title, extraCss) => `<!doctype html><html lang="no"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} (test)</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}
body{font-family:Inter,system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
.banner{background:#d9b77f;color:#0a1628;text-align:center;font-weight:600;font-size:13px;padding:9px 16px}
.error{font-size:13px;color:#c62828;margin-top:8px;font-weight:500}
.hint{font-size:13px;color:#6b6b76;margin-top:8px}
${extraCss}
</style></head><body>`;

// ---------------------------------------------------------------- Vipps
export function vippsPage({ id, amount, productName, phone, merchant }) {
  return head("Vipps", `
body{background:#f7f5f3;color:#262626}
main{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:40px 16px}
.card{width:100%;max-width:440px;background:#fff;border-radius:16px;box-shadow:0 12px 40px -16px rgba(0,0,0,.2);overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid #eee}
.wordmark{font-weight:700;font-size:24px;letter-spacing:-.03em;color:#ff5b24}
.merchant{font-size:13px;color:#6b6b76;text-align:right}
.merchant b{display:block;color:#262626}
.body{padding:28px 24px}
h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin-bottom:8px}
.sub{font-size:14px;color:#6b6b76;line-height:1.5;margin-bottom:20px}
.sum{border-radius:12px;background:#f7f5f3;padding:16px;margin-bottom:22px;display:grid;gap:8px;font-size:14px}
.sum div{display:flex;justify-content:space-between;gap:12px}
.sum span{color:#6b6b76}
.sum b{font-weight:600;text-align:right}
label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}
.phone{display:flex;border:1.5px solid #9a9aa3;border-radius:10px;overflow:hidden}
.phone:focus-within{border-color:#ff5b24;box-shadow:0 0 0 3px rgba(255,91,36,.15)}
.phone.bad{border-color:#c62828}
.phone span{padding:14px;background:#f7f5f3;font-weight:600;border-right:1px solid #e3e3e8}
.phone input{flex:1;border:0;font:inherit;font-size:19px;letter-spacing:.06em;padding:13px 14px;outline:none;min-width:0}
.btn{display:block;width:100%;font:inherit;font-weight:600;font-size:16px;padding:15px;border-radius:999px;border:0;cursor:pointer;margin-top:20px;background:#ff5b24;color:#fff}
.btn:hover{background:#e84e1b}
.btn.ghost{background:transparent;color:#262626;margin-top:8px}
.btn.ghost:hover{background:#f7f5f3}
.wait{display:flex;align-items:center;gap:12px;font-size:14px;color:#6b6b76;margin-bottom:18px}
.spinner{width:22px;height:22px;border-radius:50%;border:3px solid #ffd9cc;border-top-color:#ff5b24;animation:spin 1s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.timer{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600;color:#262626}
.phone-mock{margin:6px auto 0;width:260px;border-radius:34px;background:#1d1d1f;padding:12px;box-shadow:0 20px 40px -20px rgba(0,0,0,.5)}
.screen{border-radius:24px;background:#fff;padding:22px 16px 16px;min-height:360px;display:flex;flex-direction:column}
.screen .app{font-weight:700;color:#ff5b24;font-size:15px;text-align:center;margin-bottom:14px}
.screen .who{text-align:center;font-weight:600;font-size:15px}
.screen .what{text-align:center;font-size:12px;color:#6b6b76;margin:4px 0 14px}
.screen .amt{text-align:center;font-size:30px;font-weight:700;letter-spacing:-.02em}
.screen .per{text-align:center;font-size:12px;color:#6b6b76;margin-bottom:14px}
.screen .row{display:flex;justify-content:space-between;font-size:12px;padding:8px 0;border-top:1px solid #f0f0f2}
.screen .row span{color:#6b6b76}
.screen .acts{margin-top:auto;display:grid;gap:6px;padding-top:12px}
.screen button{font:inherit;font-weight:600;font-size:14px;padding:12px;border-radius:999px;border:0;cursor:pointer}
.screen .ok{background:#ff5b24;color:#fff}
.screen .no{background:#f2f2f4;color:#262626}
.done{text-align:center;padding:24px 0}
.done .c{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:#ffe9e1;color:#ff5b24;display:grid;place-items:center}
.done .c svg{width:28px;height:28px}
.foot{padding:14px 24px;border-top:1px solid #eee;font-size:13px;color:#9a9aa3;display:flex;justify-content:space-between}
@media (max-width:480px){main{padding:0}.card{border-radius:0;box-shadow:none;min-height:calc(100vh - 36px)}}
`) + `
<div class="banner">TESTMODUS – ikke ekte Vipps. Ingen penger trekkes.</div>
<main><div class="card">
  <div class="top"><span class="wordmark">vipps</span><span class="merchant">Fast betaling til<b>${esc(merchant)}</b></span></div>

  <form class="body" id="f" method="post" action="/mock/vipps">
    <input type="hidden" name="id" value="${esc(id)}">
    <input type="hidden" name="decision" value="approve">

    <section data-step="phone">
      <h1>Betal med Vipps</h1>
      <p class="sub">Skriv inn mobilnummeret ditt, så sender vi en forespørsel til Vipps-appen.</p>
      <div class="sum">
        <div><span>Produkt</span><b>${esc(productName)}</b></div>
        <div><span>Pris</span><b>${kr(amount)} / mnd</b></div>
        <div><span>Første trekk</span><b>${kr(amount)} i dag</b></div>
      </div>
      <label for="phone">Mobilnummer</label>
      <div class="phone" id="phone-box"><span>+47</span><input id="phone" inputmode="numeric" autocomplete="tel-national" maxlength="8" value="${esc(phone || "")}" placeholder="912 34 567"></div>
      <div class="hint" id="phone-msg">Testmodus: alle norske mobilnumre (8 siffer) godtas.</div>
      <button type="button" class="btn" id="next">Neste</button>
      <button type="submit" class="btn ghost" data-decision="reject">Avbryt</button>
    </section>

    <section data-step="app" hidden>
      <h1>Åpne Vipps-appen</h1>
      <p class="sub">Vi har sendt en forespørsel til <b id="phone-shown"></b>. Godkjenn den faste betalingen i appen.</p>
      <div class="wait"><span class="spinner" aria-hidden="true"></span>Venter på svar fra appen<span class="timer" id="timer">5:00</span></div>
      <div class="phone-mock" aria-label="Slik ser det ut i Vipps-appen (test)">
        <div class="screen">
          <div class="app">vipps</div>
          <div class="who">${esc(merchant)}</div>
          <div class="what">ønsker å opprette en fast betaling</div>
          <div class="amt">${kr(amount)}</div>
          <div class="per">hver måned</div>
          <div class="row"><span>Første betaling</span><b>${kr(amount)} i dag</b></div>
          <div class="row"><span>Produkt</span><b>${esc(productName.replace(/^.*– /, ""))}</b></div>
          <div class="acts">
            <button type="submit" class="ok" data-decision="approve">Godta og betal</button>
            <button type="submit" class="no" data-decision="reject">Avvis</button>
          </div>
        </div>
      </div>
      <button type="button" class="btn ghost" data-back>Endre mobilnummer</button>
    </section>

    <section data-step="done" hidden>
      <div class="done">
        <div class="c"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
        <h1>Fast betaling opprettet</h1>
        <p class="sub">Sender deg tilbake til ${esc(merchant)}…</p>
      </div>
    </section>
  </form>
  <div class="foot"><span>Vipps Faste betalinger</span><span>Test</span></div>
</div></main>
<script>
(function () {
  const f = document.getElementById("f");
  const phone = document.getElementById("phone");
  const box = document.getElementById("phone-box");
  const msg = document.getElementById("phone-msg");
  let timerId;
  const go = (step) => f.querySelectorAll("[data-step]").forEach((s) => (s.hidden = s.dataset.step !== step));
  const fmt = (v) => v.slice(0, 3) + " " + v.slice(3, 5) + " " + v.slice(5);

  phone.addEventListener("input", () => { phone.value = phone.value.replace(/\\D/g, "").slice(0, 8); box.classList.remove("bad"); });
  phone.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("next").click(); } });
  document.getElementById("next").addEventListener("click", () => {
    if (!/^[49]\\d{7}$/.test(phone.value)) {
      box.classList.add("bad");
      msg.className = "error";
      msg.textContent = "Skriv inn et norsk mobilnummer med 8 siffer (starter på 4 eller 9).";
      return phone.focus();
    }
    document.getElementById("phone-shown").textContent = "+47 " + fmt(phone.value);
    go("app");
    let left = 300;
    clearInterval(timerId);
    timerId = setInterval(() => {
      left--;
      document.getElementById("timer").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
      if (left <= 0) { clearInterval(timerId); f.elements.decision.value = "reject"; f.submit(); }
    }, 1000);
  });
  document.querySelector("[data-back]").addEventListener("click", () => { clearInterval(timerId); go("phone"); phone.focus(); });
  // The phone number stays in the browser; only the decision is posted.
  phone.removeAttribute("name");
  f.addEventListener("submit", (e) => {
    const d = e.submitter && e.submitter.dataset.decision;
    if (d) f.elements.decision.value = d;
    clearInterval(timerId);
    if (f.elements.decision.value === "approve") {
      e.preventDefault();
      go("done");
      setTimeout(() => f.submit(), 900);
    }
  });
  if (!phone.value) phone.focus();
})();
</script></body></html>`;
}

// ---------------------------------------------------------------- Card
// Stripe's published test cards: https://docs.stripe.com/testing
export const TEST_CARDS = [
  { number: "4242424242424242", label: "Visa – godkjennes", result: "ok" },
  { number: "5555555555554444", label: "Mastercard – godkjennes", result: "ok" },
  { number: "4000002500003155", label: "Visa – krever 3D Secure", result: "3ds" },
  { number: "4000000000000002", label: "Visa – avvises", result: "decline" },
];

export function cardPage({ id, amount, productName, email, merchant, cancelUrl }) {
  const cards = TEST_CARDS.map((c) => `<button type="button" class="tc" data-card="${c.number}"><b>${c.number.replace(/(\d{4})(?=\d)/g, "$1 ")}</b><span>${esc(c.label)}</span></button>`).join("");
  return head("Kortbetaling", `
body{background:#fff;color:#1a1f36}
.wrap{flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0}
.left{background:#0a1628;color:#e6e8ec;padding:56px clamp(24px,5vw,72px);display:flex;flex-direction:column;align-items:flex-end}
.left > div{width:100%;max-width:400px}
.back{display:inline-flex;gap:8px;align-items:center;color:#a9bdd6;text-decoration:none;font-size:14px;margin-bottom:36px}
.back:hover{color:#fff}
.m{font-size:15px;font-weight:600;color:#fff;display:flex;align-items:center;gap:10px}
.m i{width:28px;height:28px;border-radius:7px;background:#f3f4f6;display:inline-block}
.what{margin-top:28px;font-size:15px;color:#9aa2ae}
.price{font-size:40px;font-weight:700;color:#fff;letter-spacing:-.02em;margin-top:6px}
.price small{font-size:15px;font-weight:500;color:#9aa2ae;margin-left:4px}
.lines{margin-top:32px;font-size:14px;display:grid;gap:12px}
.lines div{display:flex;justify-content:space-between;gap:12px}
.lines span{color:#9aa2ae}
.lines .tot{padding-top:12px;border-top:1px solid rgba(169,189,214,.2);font-weight:600;color:#fff}
.right{padding:56px clamp(24px,5vw,72px)}
.right form{max-width:400px}
h1{font-size:20px;font-weight:600;margin-bottom:22px}
label{display:block;font-size:13px;font-weight:500;color:#4f566b;margin:16px 0 6px}
input,select{width:100%;font:inherit;font-size:15px;padding:11px 12px;border:1px solid #d5dbe1;border-radius:6px;background:#fff;color:#1a1f36;outline:none}
input:focus,select:focus{border-color:#23426b;box-shadow:0 0 0 3px rgba(35,66,107,.15)}
.group{border:1px solid #d5dbe1;border-radius:6px;overflow:hidden}
.group:focus-within{border-color:#23426b;box-shadow:0 0 0 3px rgba(35,66,107,.15)}
.group input{border:0;border-radius:0;box-shadow:none!important}
.group .num{position:relative;border-bottom:1px solid #d5dbe1}
.group .num input{padding-right:70px;letter-spacing:.04em}
.brand{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 6px;border-radius:4px;background:#f0f2f5;color:#4f566b}
.group .row{display:grid;grid-template-columns:1fr 1fr}
.group .row input:first-child{border-right:1px solid #d5dbe1}
.bad{border-color:#c62828!important}
.pay{width:100%;margin-top:24px;font:inherit;font-weight:600;font-size:16px;padding:14px;border-radius:6px;border:0;background:#0a1628;color:#fff;cursor:pointer}
.pay:hover{background:#183153}
.pay[disabled]{opacity:.6;cursor:default}
.fine{font-size:12px;color:#697386;margin-top:14px;line-height:1.5}
.tests{margin-top:28px;padding-top:18px;border-top:1px dashed #d5dbe1}
.tests p{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b6a1f;margin-bottom:10px}
.tests div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tc{font:inherit;text-align:left;padding:9px 11px;border:1px solid #e3e8ee;border-radius:6px;background:#f7f9fc;cursor:pointer}
.tc:hover{border-color:#23426b}
.tc b{display:block;font-size:12px;font-variant-numeric:tabular-nums}
.tc span{font-size:11px;color:#697386}
.overlay{position:fixed;inset:0;background:rgba(10,22,40,.55);display:grid;place-items:center;padding:16px;z-index:10}
.tds{width:100%;max-width:380px;background:#fff;border-radius:12px;padding:28px;text-align:center;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)}
.tds h2{font-size:18px;margin:10px 0 6px}
.tds p{font-size:14px;color:#697386;line-height:1.5}
.tds .amt{font-size:22px;font-weight:700;margin:14px 0}
.tds .pay{margin-top:10px}
.tds .alt{background:#f0f2f5;color:#1a1f36}
.tds .alt:hover{background:#e3e8ee}
.bank{font-size:12px;font-weight:700;letter-spacing:.1em;color:#697386}
@media (max-width:820px){.wrap{grid-template-columns:1fr}.left{align-items:stretch;padding:28px 20px}.right{padding:28px 20px}.lines{display:none}.back{margin-bottom:20px}.tests div{grid-template-columns:1fr}}
`) + `
<div class="banner">TESTMODUS – ikke ekte kortbetaling. Bruk et testkort, ikke ditt eget kort.</div>
<div class="wrap">
  <aside class="left"><div>
    <a class="back" href="${esc(cancelUrl)}">← Tilbake</a>
    <div class="m"><i aria-hidden="true"></i>${esc(merchant)}</div>
    <div class="what">Abonner på ${esc(productName.replace(/^.*– /, ""))}</div>
    <div class="price">${kr(amount)}<small>per måned</small></div>
    <div class="lines">
      <div><span>${esc(productName)}</span><b>${kr(amount)}</b></div>
      <div><span>Faktureres månedlig</span><b></b></div>
      <div class="tot"><span>Å betale i dag</span><b>${kr(amount)}</b></div>
    </div>
  </div></aside>

  <main class="right">
    <form id="f" method="post" action="/mock/kort" novalidate autocomplete="off">
      <input type="hidden" name="id" value="${esc(id)}">
      <input type="hidden" name="decision" value="approve">
      <h1>Betal med kort</h1>

      <label for="email">E-post</label>
      <input id="email" type="email" value="${esc(email || "")}" readonly>

      <label for="cc">Kortinformasjon</label>
      <div class="group" id="cc-group">
        <div class="num"><input id="cc" inputmode="numeric" autocomplete="off" placeholder="1234 1234 1234 1234" maxlength="19" aria-describedby="cc-msg"><span class="brand" id="brand" hidden></span></div>
        <div class="row">
          <input id="exp" inputmode="numeric" autocomplete="off" placeholder="MM / ÅÅ" maxlength="7" aria-label="Utløpsdato">
          <input id="cvc" inputmode="numeric" autocomplete="off" placeholder="CVC" maxlength="4" aria-label="CVC">
        </div>
      </div>
      <div class="hint" id="cc-msg">Testmodus: bare testkort godtas. Velg et nedenfor.</div>

      <label for="holder">Navn på kortet</label>
      <input id="holder" autocomplete="off" placeholder="Fullt navn">

      <label for="country">Land</label>
      <select id="country"><option>Norge</option><option>Sverige</option><option>Danmark</option><option>Finland</option></select>

      <button type="submit" class="pay" id="pay">Abonner – ${kr(amount)}/mnd</button>
      <p class="fine">Ved å bekrefte gir du ${esc(merchant)} tillatelse til å belaste kortet ditt månedlig i henhold til vilkårene, til du sier opp.</p>

      <div class="tests"><p>Testkort (Stripe)</p><div>${cards}</div>
        <p class="hint" style="text-transform:none;letter-spacing:0;font-weight:400;color:#697386;margin:10px 0 0">Bruk en fremtidig utløpsdato (f.eks. 12 / 34) og en hvilken som helst CVC (f.eks. 123).</p>
      </div>
    </form>
  </main>
</div>

<div class="overlay" id="tds" hidden role="dialog" aria-modal="true" aria-labelledby="tds-h">
  <div class="tds">
    <div class="bank">3D SECURE · TESTBANK</div>
    <h2 id="tds-h">Bekreft betalingen</h2>
    <p>Banken din ber deg bekrefte denne betalingen til ${esc(merchant)}.</p>
    <div class="amt">${kr(amount)}</div>
    <button type="button" class="pay" id="tds-ok">Bekreft</button>
    <button type="button" class="pay alt" id="tds-no">Avbryt</button>
  </div>
</div>

<script>
(function () {
  const TEST = ${JSON.stringify(Object.fromEntries(TEST_CARDS.map((c) => [c.number, c.result])))};
  const f = document.getElementById("f");
  const cc = document.getElementById("cc"), exp = document.getElementById("exp"), cvc = document.getElementById("cvc");
  const holder = document.getElementById("holder");
  const msg = document.getElementById("cc-msg"), group = document.getElementById("cc-group");
  const brand = document.getElementById("brand"), pay = document.getElementById("pay");
  const digits = (v) => v.replace(/\\D/g, "");
  const luhn = (n) => { let s = 0; for (let i = 0; i < n.length; i++) { let d = +n[n.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; };
  const err = (text, el) => { msg.className = "error"; msg.textContent = text; (el === holder ? holder : group).classList.add("bad"); el.focus(); };
  const clear = () => { msg.className = "hint"; msg.textContent = "Testmodus: bare testkort godtas. Velg et nedenfor."; group.classList.remove("bad"); holder.classList.remove("bad"); };

  cc.addEventListener("input", () => {
    const d = digits(cc.value).slice(0, 16);
    cc.value = d.replace(/(\\d{4})(?=\\d)/g, "$1 ");
    const b = /^4/.test(d) ? "VISA" : /^(5[1-5]|2[2-7])/.test(d) ? "MASTERCARD" : "";
    brand.hidden = !b; brand.textContent = b;
    clear();
    if (d.length === 16) exp.focus();
  });
  exp.addEventListener("input", () => {
    const d = digits(exp.value).slice(0, 4);
    exp.value = d.length > 2 ? d.slice(0, 2) + " / " + d.slice(2) : d;
    clear();
    if (d.length === 4) cvc.focus();
  });
  cvc.addEventListener("input", () => { cvc.value = digits(cvc.value).slice(0, 4); clear(); });
  holder.addEventListener("input", clear);

  document.querySelectorAll(".tc").forEach((b) => b.addEventListener("click", () => {
    cc.value = b.dataset.card.replace(/(\\d{4})(?=\\d)/g, "$1 ");
    cc.dispatchEvent(new Event("input"));
    if (!exp.value) exp.value = "12 / 34";
    if (!cvc.value) cvc.value = "123";
    if (!holder.value) holder.value = "Test Testesen";
    clear();
  }));

  function submit(decision) {
    // Only the decision leaves the browser – never the card details.
    f.elements.decision.value = decision;
    [cc, exp, cvc, holder].forEach((i) => i.removeAttribute("name"));
    f.submit();
  }

  f.addEventListener("submit", (e) => {
    e.preventDefault();
    clear();
    const n = digits(cc.value), ed = digits(exp.value);
    if (n.length < 15 || !luhn(n)) return err("Kortnummeret er ugyldig.", cc);
    if (!(n in TEST)) return err("I testmodus godtas bare testkort, f.eks. 4242 4242 4242 4242.", cc);
    const mm = +ed.slice(0, 2), yy = +ed.slice(2);
    const now = new Date(), cur = (now.getFullYear() % 100) * 100 + now.getMonth() + 1;
    if (ed.length !== 4 || mm < 1 || mm > 12) return err("Utløpsdatoen er ugyldig.", exp);
    if (yy * 100 + mm < cur) return err("Kortet er utløpt.", exp);
    if (!/^\\d{3,4}$/.test(cvc.value)) return err("CVC er ugyldig.", cvc);
    if (holder.value.trim().length < 2) return err("Skriv inn navnet på kortet.", holder);

    pay.disabled = true;
    pay.textContent = "Behandler…";
    setTimeout(() => {
      const result = TEST[n];
      if (result === "decline") {
        pay.disabled = false;
        pay.textContent = ${JSON.stringify(`Abonner – ${kr(amount)}/mnd`)};
        return err("Kortet ble avvist. Prøv et annet kort.", cc);
      }
      if (result === "3ds") {
        document.getElementById("tds").hidden = false;
        document.getElementById("tds-ok").focus();
        return;
      }
      submit("approve");
    }, 1200);
  });
  document.getElementById("tds-ok").addEventListener("click", () => submit("approve"));
  document.getElementById("tds-no").addEventListener("click", () => {
    document.getElementById("tds").hidden = true;
    pay.disabled = false;
    pay.textContent = ${JSON.stringify(`Abonner – ${kr(amount)}/mnd`)};
    err("Betalingen ble ikke bekreftet av banken.", cc);
  });
  cc.focus();
})();
</script></body></html>`;
}
