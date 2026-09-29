(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const kr = (ore) => "kr " + (Number(ore || 0) / 100).toLocaleString("nb-NO");
  const date = (iso) => (iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso.replace(" ", "T") + (iso.includes("T") ? "" : "Z")).toLocaleDateString("nb-NO") : "–");
  const dateTime = (iso) => (iso ? new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }) : "–");
  const PLAN = { ordinar: "Ordinær", student: "Student" };
  const STATUS = { active: "Aktiv", pending_payment: "Venter betaling", cancelled: "Avsluttet", paid: "Betalt", pending: "Venter", failed: "Feilet", refunded: "Refundert" };
  const METHOD = { vipps: "Vipps", card: "Kort" };
  const badge = (s) => `<span class="badge b-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const plan = (c) => `${PLAN[c.plan] || c.plan}${c.binding_months ? " · 12 mnd" : ""}`;

  let toastT;
  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("bad", !!bad);
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  async function api(path, opts = {}) {
    const init = { method: opts.method || (opts.body ? "POST" : "GET"), headers: {} };
    if (opts.body) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    const r = await fetch(path, init);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== "/api/admin/login") { showLogin(); throw new Error("Ikke innlogget"); }
    if (!r.ok) throw new Error(j.error || "Noe gikk galt");
    return j;
  }

  // ---------- auth ----------
  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#login-form").email.focus();
  }
  async function boot() {
    try {
      const me = await api("/api/admin/me");
      $("#me").textContent = me.email;
      $("#ribbon").hidden = !Object.values(me.testMode).some(Boolean);
      $("#login").hidden = true;
      $("#app").hidden = false;
      route();
    } catch { /* showLogin already called */ }
  }
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    $("#login-err").innerHTML = "";
    try {
      await api("/api/admin/login", { body: { email: f.email.value, password: f.password.value } });
      f.password.value = "";
      boot();
    } catch (err) {
      $("#login-err").innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
    }
  });
  $("#logout").addEventListener("click", async () => {
    await api("/api/admin/logout", { body: {} }).catch(() => {});
    showLogin();
  });

  // ---------- router ----------
  const routes = {
    "": dashboard,
    medlemmer: members,
    medlem: memberDetail,
    betalinger: payments,
    innstillinger: settings,
    logg: auditLog,
  };
  async function route() {
    const [name = "", arg] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
    const fn = routes[name] || dashboard;
    const nav = name === "medlem" ? "medlemmer" : name || "oversikt";
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
    view.innerHTML = `<div class="empty">Laster…</div>`;
    try { await fn(arg); } catch (err) { if (err.message !== "Ikke innlogget") view.innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`; }
    view.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);
  view.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && !e.target.closest("a,button")) location.hash = tr.dataset.href;
  });

  function contractRows(rows) {
    if (!rows.length) return `<div class="empty">Ingen medlemmer ennå.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Kontrakt</th><th>Navn</th><th>Medlemskap</th><th class="hide-sm">Pris</th><th class="hide-sm">Betaling</th><th>Status</th><th class="hide-sm">Signert</th></tr></thead><tbody>
      ${rows.map((c) => `<tr class="link" data-href="#/medlem/${c.id}" tabindex="0">
        <td class="num">${esc(c.number)}</td>
        <td><b>${esc(c.name)}</b>${c.email ? `<br><span class="muted">${esc(c.email)}</span>` : ""}</td>
        <td>${esc(plan(c))}${c.plan === "student" && c.status === "active" && !c.student_verified ? ` <span class="badge b-pending">Ikke verifisert</span>` : ""}</td>
        <td class="num hide-sm">${kr(c.price_ore)}</td>
        <td class="hide-sm">${esc(METHOD[c.payment_method] || "–")}${c.failed_payments ? ` <span class="badge b-failed">${c.failed_payments} feilet</span>` : ""}</td>
        <td>${badge(c.status)}</td>
        <td class="num hide-sm">${date(c.signed_at)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }
  view.addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && e.key === "Enter") location.hash = tr.dataset.href;
  });

  // ---------- dashboard ----------
  async function dashboard() {
    const s = await api("/api/admin/stats");
    view.innerHTML = `
      <div class="page-head"><div><h1>Oversikt</h1><div class="sub">${new Date().toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div></div>
        <button class="btn btn-ghost btn-sm" id="run-billing">Kjør Vipps-trekk nå</button></div>
      <div class="tiles">
        <a class="tile" href="#/medlemmer?status=active"><div class="k">Aktive medlemmer</div><div class="v">${s.active}</div><div class="h">+${s.newThisMonth} denne måneden</div></a>
        <div class="tile"><div class="k">Månedlig inntekt</div><div class="v">${kr(s.mrrOre)}</div><div class="h">Sum aktive medlemskap</div></div>
        <div class="tile"><div class="k">Innbetalt denne mnd</div><div class="v">${kr(s.paidThisMonthOre)}</div><div class="h">Vipps og kort</div></div>
        <a class="tile ${s.pending ? "warn" : ""}" href="#/medlemmer?status=pending_payment"><div class="k">Venter betaling</div><div class="v">${s.pending}</div><div class="h">Signert, ikke betalt</div></a>
        <a class="tile ${s.failedPayments ? "bad" : ""}" href="#/betalinger?status=failed"><div class="k">Feilede trekk</div><div class="v">${s.failedPayments}</div><div class="h">Må følges opp</div></a>
        <a class="tile ${s.unverifiedStudents ? "warn" : ""}" href="#/medlemmer?status=active"><div class="k">Studentbevis</div><div class="v">${s.unverifiedStudents}</div><div class="h">Ikke verifisert ennå</div></a>
      </div>
      <section class="panel"><div class="panel-head"><h2>Siste innmeldinger</h2><a class="btn btn-ghost btn-sm" href="#/medlemmer">Alle medlemmer</a></div>
        ${s.recent.length ? `<div class="table-wrap"><table><thead><tr><th>Kontrakt</th><th>Navn</th><th>Medlemskap</th><th class="hide-sm">Pris</th><th>Status</th><th class="hide-sm">Signert</th></tr></thead><tbody>
          ${s.recent.map((c) => `<tr class="link" data-href="#/medlem/${c.id}" tabindex="0"><td class="num">${esc(c.number)}</td><td><b>${esc(c.name)}</b></td><td>${esc(plan(c))}</td><td class="num hide-sm">${kr(c.price_ore)}</td><td>${badge(c.status)}</td><td class="num hide-sm">${date(c.signed_at)}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">Ingen innmeldinger ennå. Test flyten på <a href="/bli-medlem.html" target="_blank">/bli-medlem</a>.</div>`}
      </section>`;
    $("#run-billing").addEventListener("click", async (e) => {
      e.currentTarget.classList.add("loading");
      try {
        const r = await api("/api/admin/billing/run", { body: {} });
        toast(`Trekk opprettet: ${r.created}, oppdatert: ${r.updated}${r.errors.length ? `, feil: ${r.errors.length}` : ""}`, r.errors.length > 0);
        dashboard();
      } catch (err) { toast(err.message, true); e.currentTarget.classList.remove("loading"); }
    });
  }

  // ---------- members ----------
  async function members() {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    view.innerHTML = `
      <div class="page-head"><div><h1>Medlemmer</h1><div class="sub">Kontrakter signert med BankID</div></div>
        <a class="btn btn-ghost btn-sm" id="csv" href="#">Eksporter CSV</a></div>
      <div class="filters">
        <input type="search" id="q" placeholder="Søk navn, e-post, telefon, kontraktnr." aria-label="Søk" value="${esc(q.get("q") || "")}">
        <select id="status" aria-label="Status">
          <option value="">Alle statuser</option>
          <option value="active">Aktive</option>
          <option value="pending_payment">Venter betaling</option>
          <option value="cancelled">Avsluttet</option>
        </select>
      </div>
      <section class="panel" id="list"></section>`;
    $("#status").value = q.get("status") || "";
    let timer;
    async function load() {
      const p = new URLSearchParams({ q: $("#q").value, status: $("#status").value });
      $("#csv").href = "/api/admin/contracts.csv?" + p;
      $("#list").innerHTML = contractRows(await api("/api/admin/contracts?" + p));
    }
    $("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    $("#status").addEventListener("change", load);
    await load();
  }

  async function memberDetail(id) {
    const { contract: c, member: m, payments: pays, log } = await api(`/api/admin/contracts/${encodeURIComponent(id)}`);
    const inBinding = c.binding_end && c.status === "active" && c.binding_end > new Date().toISOString().slice(0, 10);
    view.innerHTML = `
      <div class="page-head"><div><a href="#/medlemmer" class="muted" style="text-decoration:none;font-size:14px">← Medlemmer</a>
        <h1 style="margin-top:8px">${esc(m.name)}</h1><div class="sub">${esc(c.number)} · ${badge(c.status)}</div></div>
        <div class="row">
          <a class="btn btn-ghost btn-sm" href="/api/admin/contracts/${c.id}/print" target="_blank" rel="noopener">Vis kontrakt</a>
          ${c.status !== "cancelled" ? `<button class="btn btn-danger btn-sm" id="cancel">Avslutt medlemskap</button>` : ""}
        </div></div>
      ${c.status === "cancelled" ? `<div class="alert alert-info" style="margin-bottom:20px">Avsluttet ${dateTime(c.cancelled_at)}${c.cancel_reason ? ` – ${esc(c.cancel_reason)}` : ""}</div>` : ""}
      <div class="detail">
        <section class="panel"><div class="panel-head"><h2>Medlem</h2></div><div class="panel-body"><dl class="kv">
          <dt>E-post</dt><dd>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : "–"}</dd>
          <dt>Telefon</dt><dd>${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : "–"}</dd>
          <dt>Fødselsdato</dt><dd>${date(m.birthdate)}</dd>
          <dt>Registrert</dt><dd>${dateTime(m.created_at)}</dd>
        </dl></div></section>
        <section class="panel"><div class="panel-head"><h2>Avtale</h2></div><div class="panel-body"><dl class="kv">
          <dt>Medlemskap</dt><dd>${esc(PLAN[c.plan])} · ${esc(c.level || "")}</dd>
          <dt>Pris</dt><dd>${kr(c.price_ore)} / mnd</dd>
          <dt>Binding</dt><dd>${c.binding_months ? `12 mnd${c.binding_end ? ` – til ${date(c.binding_end)}` : ""}` : "Uten binding"}</dd>
          <dt>Start</dt><dd>${date(c.start_date)}</dd>
          <dt>Betaling</dt><dd>${esc(METHOD[c.payment_method] || "–")}</dd>
          ${c.next_charge_date ? `<dt>Neste trekk</dt><dd>${date(c.next_charge_date)}</dd>` : ""}
          <dt>Ref.</dt><dd class="hash">${esc(c.provider_ref || "–")}</dd>
          ${c.plan === "student" ? `<dt>Studentbevis</dt><dd><label class="check" style="font-size:14px"><input type="checkbox" id="student" ${c.student_verified ? "checked" : ""}> Verifisert</label></dd>` : ""}
        </dl></div></section>
        <section class="panel"><div class="panel-head"><h2>Signatur</h2></div><div class="panel-body"><dl class="kv">
          <dt>BankID-navn</dt><dd>${esc(c.bankid_name)}</dd>
          <dt>Fødselsdato</dt><dd>${date(c.bankid_birthdate)}</dd>
          <dt>Signert</dt><dd>${dateTime(c.signed_at)}</dd>
          <dt>IP</dt><dd>${esc(c.sign_ip || "–")}</dd>
          <dt>SHA-256</dt><dd class="hash">${esc(c.contract_hash)}</dd>
        </dl></div></section>
      </div>
      <section class="panel"><div class="panel-head"><h2>Betalinger</h2></div>
        ${pays.length ? `<div class="table-wrap"><table><thead><tr><th>Dato</th><th>Beskrivelse</th><th>Beløp</th><th>Status</th><th class="hide-sm">Ref.</th></tr></thead><tbody>
          ${pays.map((p) => `<tr><td class="num">${date(p.paid_at || p.due_date || p.created_at)}</td><td>${esc(p.description || "")}</td><td class="num">${kr(p.amount_ore)}</td><td>${badge(p.status)}</td><td class="hash hide-sm">${esc(p.provider_ref || "")}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">Ingen betalinger.</div>`}
      </section>
      <section class="panel"><div class="panel-head"><h2>Notater</h2></div><div class="panel-body">
        <textarea id="notes" rows="4" placeholder="Interne notater om medlemmet">${esc(c.notes || "")}</textarea>
        <div class="form-actions"><button class="btn btn-ghost btn-sm" id="save-notes">Lagre notat</button></div>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Historikk</h2></div>
        ${log.length ? `<div class="table-wrap"><table><tbody>${log.map((l) => `<tr><td class="num">${dateTime(l.created_at)}</td><td>${esc(l.action)}</td><td class="muted">${esc(l.actor)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Ingen hendelser.</div>`}
      </section>`;

    $("#cancel")?.addEventListener("click", async () => {
      const warn = inBinding ? `Medlemmet har binding til ${date(c.binding_end)}.\n\n` : "";
      const reason = prompt(`${warn}Avslutte medlemskapet til ${m.name}? Det faste trekket i ${METHOD[c.payment_method] || "betalingsløsningen"} stoppes.\n\nÅrsak:`);
      if (reason === null) return;
      try { await api(`/api/admin/contracts/${c.id}/cancel`, { body: { reason } }); toast("Medlemskapet er avsluttet"); memberDetail(id); }
      catch (err) { toast(err.message, true); }
    });
    $("#student")?.addEventListener("change", async (e) => {
      try { await api(`/api/admin/contracts/${c.id}/student`, { body: { verified: e.target.checked } }); toast(e.target.checked ? "Studentbevis verifisert" : "Verifisering fjernet"); }
      catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
    });
    $("#save-notes").addEventListener("click", async () => {
      try { await api(`/api/admin/contracts/${c.id}/notes`, { body: { notes: $("#notes").value } }); toast("Notat lagret"); }
      catch (err) { toast(err.message, true); }
    });
  }

  // ---------- payments ----------
  async function payments() {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    view.innerHTML = `
      <div class="page-head"><div><h1>Betalinger</h1><div class="sub">Alle trekk via Vipps og kort</div></div></div>
      <div class="filters"><select id="pstatus" aria-label="Status">
        <option value="">Alle</option><option value="paid">Betalt</option><option value="pending">Venter</option><option value="failed">Feilet</option>
      </select></div>
      <section class="panel" id="plist"></section>`;
    $("#pstatus").value = q.get("status") || "";
    async function load() {
      const s = $("#pstatus").value;
      const rows = await api("/api/admin/payments" + (s ? "?status=" + s : ""));
      $("#plist").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Dato</th><th>Medlem</th><th class="hide-sm">Beskrivelse</th><th>Beløp</th><th class="hide-sm">Via</th><th>Status</th></tr></thead><tbody>
        ${rows.map((p) => `<tr class="link" data-href="#/medlem/${p.contract_id}" tabindex="0"><td class="num">${date(p.paid_at || p.due_date || p.created_at)}</td><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.number)}</span></td><td class="hide-sm">${esc(p.description || "")}</td><td class="num">${kr(p.amount_ore)}</td><td class="hide-sm">${esc(METHOD[p.provider] || p.provider)}</td><td>${badge(p.status)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Ingen betalinger.</div>`;
    }
    $("#pstatus").addEventListener("change", load);
    await load();
  }

  // ---------- settings ----------
  async function settings() {
    const s = await api("/api/admin/settings");
    const field = (plan, key, label) => `<label>${label}<input type="number" min="0" step="1" data-plan="${plan}" data-key="${key}" value="${s.prices[plan][key] / 100}"></label>`;
    view.innerHTML = `
      <div class="page-head"><div><h1>Innstillinger</h1><div class="sub">Endringer gjelder nye kontrakter. Signerte kontrakter beholder sine vilkår og priser.</div></div></div>
      <section class="panel"><div class="panel-head"><h2>Priser (kr per måned)</h2></div><div class="panel-body">
        <div class="prices-grid">
          ${field("student", "free", "Student – uten binding")}
          ${field("student", "bound", "Student – 12 mnd binding")}
          ${field("ordinar", "free", "Ordinær – uten binding")}
          ${field("ordinar", "bound", "Ordinær – 12 mnd binding")}
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="save-prices">Lagre priser</button></div>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Kontraktsvilkår</h2></div><div class="panel-body">
        <div class="alert alert-warn" style="margin-bottom:14px">Vilkårene er et utkast. La klubben (gjerne med juridisk hjelp) kvalitetssikre teksten før dere tar imot ekte innmeldinger.</div>
        <textarea id="terms" aria-label="Kontraktsvilkår">${esc(s.terms)}</textarea>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="save-terms">Lagre vilkår</button></div>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Bytt passord</h2></div><div class="panel-body">
        <form id="pw" class="prices-grid">
          <label>Nåværende passord<input name="current" type="password" autocomplete="current-password" required></label>
          <label>Nytt passord (min. 10 tegn)<input name="next" type="password" autocomplete="new-password" minlength="10" required></label>
        </form>
        <div class="form-actions"><button class="btn btn-ghost btn-sm" form="pw" type="submit">Bytt passord</button></div>
      </div></section>`;

    $("#save-prices").addEventListener("click", async () => {
      const prices = { student: {}, ordinar: {} };
      view.querySelectorAll("input[data-plan]").forEach((i) => { prices[i.dataset.plan][i.dataset.key] = Math.round(Number(i.value) * 100); });
      try { await api("/api/admin/settings", { method: "PUT", body: { prices } }); toast("Priser lagret"); }
      catch (err) { toast(err.message, true); }
    });
    $("#save-terms").addEventListener("click", async () => {
      try { await api("/api/admin/settings", { method: "PUT", body: { terms: $("#terms").value } }); toast("Vilkår lagret"); }
      catch (err) { toast(err.message, true); }
    });
    $("#pw").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      try { await api("/api/admin/password", { body: { current: f.current.value, next: f.next.value } }); f.reset(); toast("Passordet er byttet"); }
      catch (err) { toast(err.message, true); }
    });
  }

  // ---------- audit log ----------
  async function auditLog() {
    const rows = await api("/api/admin/audit");
    view.innerHTML = `
      <div class="page-head"><div><h1>Logg</h1><div class="sub">Siste 300 hendelser</div></div></div>
      <section class="panel">${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Tid</th><th>Hendelse</th><th>Av</th><th class="hide-sm">Kontrakt</th><th class="hide-sm">Detaljer</th></tr></thead><tbody>
        ${rows.map((l) => `<tr${l.contract_id ? ` class="link" data-href="#/medlem/${l.contract_id}" tabindex="0"` : ""}><td class="num">${dateTime(l.created_at)}</td><td>${esc(l.action)}</td><td class="muted">${esc(l.actor)}</td><td class="num hide-sm">${esc(l.number || "")}</td><td class="hash hide-sm">${esc((l.details || "").slice(0, 120))}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Ingen hendelser.</div>`}</section>`;
  }

  boot();
})();
