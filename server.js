import express from "express";
import { join as joinPath } from "node:path";
import { config, mock, ROOT } from "./src/config.js";
import { db, audit } from "./src/db.js";
import { sessions, hashPassword } from "./src/session.js";
import { startBillingJob } from "./src/billing.js";
import { join } from "./src/routes/join.js";
import { admin } from "./src/routes/admin.js";
import { webhooks } from "./src/routes/webhooks.js";
import { mockRoutes } from "./src/routes/mock.js";

// First admin comes from ADMIN_EMAIL / ADMIN_PASSWORD; the password can be changed in the panel.
if (!db.prepare("SELECT 1 FROM admins LIMIT 1").get()) {
  if (config.admin.email && config.admin.password) {
    db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)")
      .run(config.admin.email.toLowerCase(), hashPassword(config.admin.password));
    audit("system", "admin.created", null, { email: config.admin.email });
  } else {
    console.warn("⚠ Ingen administrator. Sett ADMIN_EMAIL og ADMIN_PASSWORD i .env og start på nytt.");
  }
}

const app = express();
app.disable("x-powered-by");
if (config.production) app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(webhooks); // needs the raw body, so it goes before express.json()
app.use(express.json({ limit: "200kb" }));
app.use(sessions());
app.use(join);
app.use(admin);
app.use(mockRoutes);
app.use(express.static(joinPath(ROOT, "public"), { extensions: ["html"] }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Noe gikk galt" });
});

app.listen(config.port, () => {
  console.log(`Nordic Boxing Center kjører på ${config.publicUrl}`);
  const m = Object.entries(mock).filter(([, v]) => v).map(([k]) => k);
  if (m.length) console.log(`Testmodus (simulert): ${m.join(", ")}`);
  startBillingJob();
});
