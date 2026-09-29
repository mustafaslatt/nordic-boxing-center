import { db, audit, transaction } from "./db.js";
import { addMonths, today, PLAN_LABEL } from "./contract.js";
import * as vipps from "./providers/vipps.js";
import * as stripe from "./providers/stripe.js";

export const getContract = (id) => db.prepare("SELECT * FROM contracts WHERE id = ?").get(id);

// Idempotent: a provider event that arrives twice (return URL + webhook) is recorded once.
export function recordPayment({ contractId, provider, providerRef, amountOre, status, dueDate = null, description = null }) {
  const paidAt = status === "paid" ? new Date().toISOString() : null;
  db.prepare(`
    INSERT INTO payments (contract_id, provider, provider_ref, amount_ore, status, due_date, paid_at, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_ref) DO UPDATE SET
      status = excluded.status,
      paid_at = COALESCE(payments.paid_at, excluded.paid_at)
  `).run(contractId, provider, providerRef, amountOre, status, dueDate, paidAt, description);
}

export function activateContract(contractId, { providerRef, paymentRef }) {
  return transaction(() => {
    const c = getContract(contractId);
    if (!c) throw new Error("Kontrakt finnes ikke");
    if (c.status === "active") return c;
    const start = today();
    db.prepare(`
      UPDATE contracts SET status = 'active', provider_ref = ?, start_date = ?, binding_end = ?, next_charge_date = ?
      WHERE id = ?
    `).run(
      providerRef,
      start,
      c.binding_months ? addMonths(start, c.binding_months) : null,
      c.payment_method === "vipps" ? addMonths(start, 1) : null,
      contractId,
    );
    recordPayment({
      contractId,
      provider: c.payment_method,
      providerRef: paymentRef,
      amountOre: c.price_ore,
      status: "paid",
      dueDate: start,
      description: `${PLAN_LABEL[c.plan]} – første måned`,
    });
    audit("system", "contract.activated", contractId, { method: c.payment_method, providerRef });
    return getContract(contractId);
  });
}

export async function cancelContract(contractId, { actor, reason }) {
  const c = getContract(contractId);
  if (!c) throw new Error("Kontrakt finnes ikke");
  if (c.status === "cancelled") return c;
  if (c.provider_ref) {
    if (c.payment_method === "vipps") await vipps.stopAgreement(c.provider_ref);
    if (c.payment_method === "card") await stripe.cancelSubscription(c.provider_ref);
  }
  db.prepare("UPDATE contracts SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = ?, next_charge_date = NULL WHERE id = ?")
    .run(reason || null, contractId);
  audit(actor, "contract.cancelled", contractId, { reason });
  return getContract(contractId);
}

// Vipps does not charge on its own: we create each monthly charge a few days before it is due,
// then poll pending charges until Vipps reports a final status. Stripe needs no job (webhooks).
const CHARGE_AHEAD_DAYS = 3;
const VIPPS_FINAL = { CHARGED: "paid", FAILED: "failed", CANCELLED: "cancelled", REFUNDED: "refunded", PARTIALLY_REFUNDED: "paid" };

export async function runBilling() {
  const horizon = addDays(today(), CHARGE_AHEAD_DAYS);
  const result = { created: 0, updated: 0, errors: [] };

  const due = db.prepare("SELECT * FROM contracts WHERE status = 'active' AND payment_method = 'vipps' AND next_charge_date <= ?").all(horizon);
  for (const c of due) {
    try {
      const orderId = `${c.number}-${c.next_charge_date}`;
      const { chargeId } = await vipps.createCharge(c.provider_ref, {
        amount: c.price_ore,
        description: `${PLAN_LABEL[c.plan]} – medlemskap`,
        due: c.next_charge_date,
        orderId,
      });
      transaction(() => {
        recordPayment({ contractId: c.id, provider: "vipps", providerRef: chargeId, amountOre: c.price_ore, status: "pending", dueDate: c.next_charge_date, description: `Månedstrekk ${c.next_charge_date}` });
        db.prepare("UPDATE contracts SET next_charge_date = ? WHERE id = ?").run(addMonths(c.next_charge_date, 1), c.id);
      });
      result.created++;
    } catch (err) {
      result.errors.push(`${c.number}: ${err.message}`);
    }
  }

  const pending = db.prepare(`
    SELECT p.*, c.provider_ref AS agreement_id FROM payments p JOIN contracts c ON c.id = p.contract_id
    WHERE p.provider = 'vipps' AND p.status = 'pending'
  `).all();
  for (const p of pending) {
    try {
      const charge = await vipps.getCharge(p.agreement_id, p.provider_ref);
      const status = VIPPS_FINAL[charge.status];
      if (status) {
        recordPayment({ contractId: p.contract_id, provider: "vipps", providerRef: p.provider_ref, amountOre: p.amount_ore, status });
        if (status === "failed") audit("system", "payment.failed", p.contract_id, { chargeId: p.provider_ref });
        result.updated++;
      }
    } catch (err) {
      result.errors.push(`charge ${p.provider_ref}: ${err.message}`);
    }
  }

  if (result.created || result.updated || result.errors.length) audit("system", "billing.run", null, result);
  return result;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function startBillingJob() {
  const tick = () => runBilling().catch((err) => console.error("[billing]", err));
  setTimeout(tick, 5_000).unref();
  setInterval(tick, 1000 * 60 * 60 * 6).unref();
}
