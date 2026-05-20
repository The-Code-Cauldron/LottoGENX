const express = require('express');
const path = require('path');

const app = express();

// Force HTTPS on Railway (Railway sets X-Forwarded-Proto)
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'LottoGENX.html'));
});

const PORT = process.env.PORT || 3434;
app.listen(PORT, () => {
  console.log(`LottoGENX running on port ${PORT}`);
});
