import { Router, raw } from "express";
import { db, audit } from "../db.js";
import { activateContract, recordPayment, getContract } from "../billing.js";
import * as stripe from "../providers/stripe.js";

export const webhooks = Router();

const contractBySubscription = (subId) =>
  db.prepare("SELECT * FROM contracts WHERE payment_method = 'card' AND provider_ref = ?").get(subId);

webhooks.post("/webhooks/stripe", raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = stripe.parseWebhook(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    const o = event.data.object;
    switch (event.type) {
      case "checkout.session.completed": {
        const c = getContract(Number(o.metadata?.contractId));
        if (c && c.status !== "active" && o.payment_status === "paid") {
          activateContract(c.id, { providerRef: o.subscription, paymentRef: o.invoice });
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subId = o.subscription || o.parent?.subscription_details?.subscription;
        const c = subId && contractBySubscription(subId);
        if (!c) break;
        const failed = event.type === "invoice.payment_failed";
        recordPayment({
          contractId: c.id, provider: "card", providerRef: o.id, amountOre: o.amount_due,
          status: failed ? "failed" : "paid",
          dueDate: new Date(o.created * 1000).toISOString().slice(0, 10),
          description: "Månedstrekk (kort)",
        });
        if (failed) audit("system", "payment.failed", c.id, { invoice: o.id });
        break;
      }
      case "customer.subscription.deleted": {
        const c = contractBySubscription(o.id);
        if (c && c.status !== "cancelled") {
          db.prepare("UPDATE contracts SET status = 'cancelled', cancelled_at = datetime('now'), cancel_reason = COALESCE(cancel_reason, 'Avsluttet hos Stripe') WHERE id = ?").run(c.id);
          audit("system", "contract.cancelled", c.id, { source: "stripe" });
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook]", err);
    res.status(500).send("Webhook handling failed");
  }
});
