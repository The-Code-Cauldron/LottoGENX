const express = require('express');
const path = require('path');

const app = express();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'LottoGENX.html'));
});

const PORT = process.env.PORT || 3434;
app.listen(PORT, () => {
  console.log(`LottoGENX running on http://localhost:${PORT}`);
});
