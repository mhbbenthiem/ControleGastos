// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_KEY = process.env.APP_KEY;
const PORT = process.env.PORT || 4040;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN não encontrado. Configure em variáveis de ambiente (.env local / Render env vars).");
}
if (!APP_KEY) {
  throw new Error("APP_KEY não encontrado. Configure em variáveis de ambiente (.env local / Render env vars).");
}

// ===== MIDDLEWARES =====
app.use(cors()); // depois, se quiser, dá pra restringir ao seu domínio do Vercel
app.use(express.json());

// Header auth simples (segurança mínima)
function requireKey(req, res, next) {
  if (req.header("X-APP-KEY") !== APP_KEY) {
    return res.status(401).json({ ok: false });
  }
  next();
}

// ===== HELPERS =====
async function sendTelegram(chatId, text) {
  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await tgRes.json();
  return data;
}

// Healthcheck
app.get("/", (_, res) => res.send("OK"));

// ===== ROUTES =====

// (A) Webhook do Telegram (não exige APP_KEY)
app.post("/telegram/webhook", async (req, res) => {
  try {
    const msg = req.body?.message;
    const text = msg?.text || "";
    const chatId = msg?.chat?.id;

    if (!chatId) return res.sendStatus(200);

    // Usuário manda: /link maria
    if (text.startsWith("/link ")) {
      const userKey = text.replace("/link ", "").trim();

      db.run(
        `INSERT INTO users (user_key, chat_id) VALUES (?, ?)
         ON CONFLICT(user_key) DO UPDATE SET chat_id=excluded.chat_id`,
        [userKey, String(chatId)],
        async (err) => {
          if (err) {
            console.error("DB error /link:", err);
            // tenta avisar o usuário no Telegram
            await sendTelegram(chatId, "❌ Erro ao vincular. Tente novamente.");
            return;
          }
          await sendTelegram(chatId, `✅ Vinculado! user_key = ${userKey}`);
        }
      );
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e);
    return res.sendStatus(200); // Telegram espera 200 para não reenviar em loop
  }
});

// (B) Salvar configurações (teto semanal) — protegido por APP_KEY
app.post("/api/settings", requireKey, (req, res) => {
  const { user_key, weekly_cap_cents, alert_pct } = req.body || {};

  if (!user_key || !Number.isInteger(weekly_cap_cents)) {
    return res.status(400).json({ ok: false, error: "invalid" });
  }

  const pct = Number.isInteger(alert_pct) ? alert_pct : 80;

  db.run(
    `INSERT INTO users (user_key, weekly_cap_cents, alert_pct) VALUES (?, ?, ?)
     ON CONFLICT(user_key) DO UPDATE SET weekly_cap_cents=excluded.weekly_cap_cents, alert_pct=excluded.alert_pct`,
    [user_key, weekly_cap_cents, pct],
    (err) => {
      if (err) {
        console.error("DB error /api/settings:", err);
        return res.status(500).json({ ok: false });
      }
      return res.json({ ok: true });
    }
  );
});

// (C) Enviar notificação — protegido por APP_KEY
app.post("/api/notify", requireKey, async (req, res) => {
  const { user_key, week_start, pct, total_cents, cap_cents } = req.body || {};

  if (!user_key || !week_start || !Number.isInteger(total_cents) || !Number.isInteger(cap_cents)) {
    return res.status(400).json({ ok: false, error: "invalid" });
  }

  db.get(`SELECT * FROM users WHERE user_key=?`, [user_key], async (err, u) => {
    if (err) {
      console.error("DB error /api/notify:", err);
      return res.status(500).json({ ok: false });
    }
    if (!u?.chat_id) return res.status(400).json({ ok: false, error: "no chat" });

    // evita spam: 1 alerta por semana
    if (u.last_alert_week === week_start) return res.json({ ok: true, skipped: true });

    const safePct = Number.isInteger(pct) ? pct : Math.floor((total_cents * 100) / Math.max(cap_cents, 1));
    const text = `⚠️ Você já gastou R$ ${(total_cents / 100).toFixed(2)} de R$ ${(cap_cents / 100).toFixed(2)} (${safePct}%).`;

    try {
      const data = await sendTelegram(u.chat_id, text);
      if (!data.ok) {
        console.error("Telegram error:", data);
        return res.status(500).json({ ok: false, data });
      }

      db.run(`UPDATE users SET last_alert_week=? WHERE user_key=?`, [week_start, user_key], (err2) => {
        if (err2) console.error("DB error updating last_alert_week:", err2);
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("Notify exception:", e);
      return res.status(500).json({ ok: false });
    }
  });
});

app.listen(process.env.PORT || 4040, () => console.log("server ok"));

// ===== START =====
app.listen(PORT, () => console.log(`server ok (port ${PORT})`));