const fs   = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', '..', 'docs', 'Dados_Horarios.csv');

let headers = null;
let rows    = null;

function load() {
  if (rows) return;

  const text  = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = text.trim().split(/\r?\n/);

  headers = lines[0].split(',').map(h => h.trim());

  rows = lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

function getRow(index) {
  if (!rows) load();
  return rows[index % rows.length] ?? null;
}

function count() {
  if (!rows) load();
  return rows.length;
}

module.exports = { load, getRow, count };
