const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./data.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      user_key TEXT PRIMARY KEY,
      chat_id TEXT,
      weekly_cap_cents INTEGER,
      alert_pct INTEGER DEFAULT 80,
      last_alert_week TEXT
    )
  `);
});

module.exports = db;