// Card payments: Stripe Checkout in subscription mode. Stripe charges the card every month
// and reports each invoice through the webhook.
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { config, mock } from "../config.js";

const stripe = mock.stripe ? null : new Stripe(config.stripe.secretKey);
const mockSessions = new Map();

export async function createCheckout({ contract, productName, email, successUrl, cancelUrl }) {
  if (mock.stripe) {
    const id = `mock_cs_${randomUUID().slice(0, 8)}`;
    mockSessions.set(id, { id, status: "open", payment_status: "unpaid", metadata: { contractId: String(contract.id) }, successUrl, cancelUrl });
    return { id, url: `/mock/kort?id=${id}` };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    locale: "nb",
    customer_email: email,
    client_reference_id: String(contract.id),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "nok",
        unit_amount: contract.price_ore,
        recurring: { interval: "month" },
        product_data: { name: productName },
      },
    }],
    metadata: { contractId: String(contract.id), contractNumber: contract.number },
    subscription_data: { metadata: { contractId: String(contract.id), contractNumber: contract.number } },
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  }, { idempotencyKey: `checkout-${contract.number}-${Date.now()}` });
  return { id: session.id, url: session.url };
}

export function mockDecide(id, approve) {
  const s = mockSessions.get(id);
  if (!s || s.status !== "open") return null;
  if (approve) Object.assign(s, { status: "complete", payment_status: "paid", subscription: `mock_sub_${id.slice(8)}`, invoice: `mock_in_${id.slice(8)}` });
  else s.status = "expired";
  return approve ? `${s.successUrl}?session_id=${id}` : s.cancelUrl;
}

export async function getCheckout(id) {
  if (mock.stripe) return mockSessions.get(id) || null;
  return stripe.checkout.sessions.retrieve(id);
}

export async function cancelSubscription(subscriptionId) {
  if (mock.stripe) return;
  await stripe.subscriptions.cancel(subscriptionId);
}

export function parseWebhook(rawBody, signature) {
  if (mock.stripe) throw new Error("Stripe er i testmodus");
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}
