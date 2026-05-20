const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const http    = require('http');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// ── HTTPS redirect ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https')
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Database (optional) ───────────────────────────────────────────────────────
let pool = null;
const memVisitors = new Set();

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  pool.query(`
    CREATE TABLE IF NOT EXISTS lottogenx_visitors (
      ip_hash TEXT PRIMARY KEY,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen  TIMESTAMPTZ DEFAULT NOW(),
      visits     INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS lottogenx_draws (
      draw_date DATE PRIMARY KEY,
      n1 INT, n2 INT, n3 INT, n4 INT, n5 INT, n6 INT,
      bonus INT,
      source TEXT DEFAULT 'merseyworld'
    );
  `).catch(e => console.error('DB init:', e.message));
}

// ── Visitor tracking ──────────────────────────────────────────────────────────
function hashIP(ip) {
  return crypto.createHash('sha256').update(ip + 'lottogenx-v1').digest('hex');
}
async function trackVisitor(ip) {
  const h = hashIP(ip);
  if (pool) {
    await pool.query(`
      INSERT INTO lottogenx_visitors (ip_hash) VALUES ($1)
      ON CONFLICT (ip_hash) DO UPDATE SET last_seen=NOW(), visits=lottogenx_visitors.visits+1
    `, [h]).catch(() => {});
  } else { memVisitors.add(h); }
}
async function getUniqueCount() {
  if (pool) {
    const r = await pool.query('SELECT COUNT(*) FROM lottogenx_visitors').catch(() => null);
    return r ? parseInt(r.rows[0].count) : memVisitors.size;
  }
  return memVisitors.size;
}

// ── Base dataset (embedded — Oct 2015 → May 2026, 1,057 draws) ───────────────
const BASE_FREQ = {1:98,2:102,3:109,4:107,5:102,6:100,7:107,8:112,9:113,10:111,11:118,12:110,13:105,14:109,15:104,16:115,17:106,18:101,19:101,20:114,21:87,22:107,23:101,24:100,25:100,26:101,27:119,28:102,29:106,30:98,31:116,32:99,33:107,34:120,35:107,36:122,37:126,38:115,39:120,40:110,41:108,42:120,43:91,44:94,45:110,46:107,47:112,48:93,49:108,50:101,51:105,52:120,53:102,54:122,55:103,56:105,57:107,58:116,59:111};
const BASE_DRAWS = 1057;
const BASE_LAST  = '2026-05-17'; // approximate end of embedded dataset

// ── Results fetcher & parser ──────────────────────────────────────────────────
let resultsCache     = null;
let resultsCacheTime = 0;
const RESULTS_TTL    = 3 * 60 * 60 * 1000; // 3 hours

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 10000 }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(httpGet(res.headers.location));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Parses a date string from common UK lottery CSV formats
function parseDate(str) {
  if (!str) return null;
  // YYYY-MM-DD
  let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD-Mon-YYYY or DD/Mon/YYYY
  const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  m = str.match(/(\d{1,2})[\-\/]([a-z]{3})[\-\/](\d{2,4})/i);
  if (m) {
    const yr = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yr}-${months[m[2].toLowerCase()]||'01'}-${m[1].padStart(2,'0')}`;
  }
  // DD/MM/YYYY
  m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

function parseCSV(text) {
  const draws = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    // Find a date
    const dateStr = parseDate(line.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[\-\/][a-zA-Z]{3}[\-\/]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{4})/)?.[0]);
    if (!dateStr || dateStr < '2015-10-10') continue; // 1-59 era only

    // Extract all numbers 1-59
    const allNums = (line.match(/\b([1-9]|[1-5][0-9])\b/g) || []).map(Number).filter(n => n >= 1 && n <= 59);
    if (allNums.length < 6) continue;

    // Deduplicate, take first 6 as main balls
    const unique = [...new Set(allNums)];
    if (unique.length < 6) continue;

    draws.push({
      date:  dateStr,
      nums:  unique.slice(0, 6).sort((a, b) => a - b),
      bonus: unique[6] || null
    });
  }
  // Sort newest first, dedupe dates
  const seen = new Set();
  return draws.filter(d => { if (seen.has(d.date)) return false; seen.add(d.date); return true; })
              .sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchAndParse() {
  const url = 'http://lottery.merseyworld.com/cgi-bin/lottery?days=2&Machine=Z&Ballset=0&order=0&show=1&year=0&display=CSV';
  const csv = await httpGet(url);
  return parseCSV(csv);
}

async function getLiveData() {
  const now = Date.now();
  if (resultsCache && (now - resultsCacheTime) < RESULTS_TTL) return resultsCache;

  let allDraws = [];
  let source   = 'cache';

  try {
    allDraws = await fetchAndParse();
    source   = 'merseyworld';
    console.log(`Fetched ${allDraws.length} draws from Merseyworld`);

    // Persist any new draws (after our base dataset) to DB
    if (pool) {
      const newDraws = allDraws.filter(d => d.date > BASE_LAST);
      for (const d of newDraws) {
        await pool.query(`
          INSERT INTO lottogenx_draws (draw_date,n1,n2,n3,n4,n5,n6,bonus,source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'merseyworld')
          ON CONFLICT (draw_date) DO NOTHING
        `, [d.date, ...d.nums, d.bonus]).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('Merseyworld fetch failed:', e.message);

    // Fall back to DB-stored draws
    if (pool) {
      const r = await pool.query('SELECT * FROM lottogenx_draws ORDER BY draw_date DESC').catch(() => null);
      if (r?.rows.length) {
        allDraws = r.rows.map(row => ({
          date:  row.draw_date.toISOString().slice(0, 10),
          nums:  [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6].sort((a, b) => a - b),
          bonus: row.bonus
        }));
        source = 'db';
      }
    }
  }

  // Build merged frequency
  const newDraws = allDraws.filter(d => d.date > BASE_LAST);
  const freq = { ...BASE_FREQ };
  newDraws.forEach(d => d.nums.forEach(n => { freq[n] = (freq[n] || 0) + 1; }));

  const totalDraws = BASE_DRAWS + newDraws.length;
  const lastDate   = allDraws.length ? allDraws[0].date : BASE_LAST;

  resultsCache     = { draws: allDraws.slice(0, 30), freq, totalDraws, newCount: newDraws.length, lastDate, source };
  resultsCacheTime = now;
  return resultsCache;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  trackVisitor(ip);
  res.sendFile(path.join(__dirname, 'LottoGENX.html'));
});

app.get('/api/visitors', async (req, res) => {
  res.json({ unique: await getUniqueCount(), mode: pool ? 'db' : 'memory' });
});

app.get('/api/latest', async (req, res) => {
  try {
    const data = await getLiveData();
    res.json(data);
  } catch (e) {
    res.json({ draws: [], freq: BASE_FREQ, totalDraws: BASE_DRAWS, newCount: 0, lastDate: BASE_LAST, source: 'base' });
  }
});

// Manual draw entry — admin only
app.post('/api/results/add', async (req, res) => {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== (process.env.ADMIN_KEY || 'lottogenx-admin')) return res.status(401).json({ error: 'Unauthorised' });

  const { date, nums, bonus } = req.body;
  if (!date || !Array.isArray(nums) || nums.length !== 6) return res.status(400).json({ error: 'Need date (YYYY-MM-DD) and nums (array of 6)' });

  if (pool) {
    await pool.query(`
      INSERT INTO lottogenx_draws (draw_date,n1,n2,n3,n4,n5,n6,bonus,source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual')
      ON CONFLICT (draw_date) DO UPDATE SET n1=$2,n2=$3,n3=$4,n4=$5,n5=$6,n6=$7,bonus=$8
    `, [date, ...nums, bonus || null]);
  }

  resultsCache = null; // bust cache
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3434;
app.listen(PORT, () => {
  console.log(`LottoGENX on port ${PORT} | DB: ${pool ? 'Neon' : 'none'}`);
});
