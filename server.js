const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1); // Railway sits behind a proxy — needed for real IP

// Force HTTPS on Railway
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Hash IP — GDPR: never store raw IPs
function hashIP(ip) {
  return crypto.createHash('sha256').update(ip + 'lottogenx-v1').digest('hex');
}

// ── VISITOR TRACKING ─────────────────────────────────────────────────────────
let pool = null;
const memoryVisitors = new Set(); // fallback when no DATABASE_URL

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  pool.query(`
    CREATE TABLE IF NOT EXISTS lottogenx_visitors (
      ip_hash TEXT PRIMARY KEY,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen  TIMESTAMPTZ DEFAULT NOW(),
      visits     INTEGER DEFAULT 1
    )
  `).catch(e => console.error('DB init:', e.message));
}

async function trackVisitor(ip) {
  const hash = hashIP(ip);
  if (pool) {
    await pool.query(`
      INSERT INTO lottogenx_visitors (ip_hash) VALUES ($1)
      ON CONFLICT (ip_hash) DO UPDATE
        SET last_seen = NOW(),
            visits = lottogenx_visitors.visits + 1
    `, [hash]).catch(e => console.error('Track error:', e.message));
  } else {
    memoryVisitors.add(hash);
  }
}

async function getUniqueCount() {
  if (pool) {
    const r = await pool.query('SELECT COUNT(*) FROM lottogenx_visitors').catch(() => null);
    return r ? parseInt(r.rows[0].count) : memoryVisitors.size;
  }
  return memoryVisitors.size;
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  trackVisitor(ip); // fire-and-forget
  res.sendFile(path.join(__dirname, 'LottoGENX.html'));
});

app.get('/api/visitors', async (req, res) => {
  const count = await getUniqueCount();
  res.json({ unique: count, mode: pool ? 'db' : 'memory' });
});

const PORT = process.env.PORT || 3434;
app.listen(PORT, () => {
  console.log(`LottoGENX on port ${PORT} | tracking: ${pool ? 'Neon DB' : 'in-memory'}`);
});
