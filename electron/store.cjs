'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicWrite } = require('./update-core.cjs');
function validEnvelope(data) {
  return data && data.schemaVersion === 1 && ['accounts','incomes','debts','movements'].every(key => Array.isArray(data[key]) && data[key].length <= 50000) && (data.products === undefined || Array.isArray(data.products) && data.products.length <= 20000) && (data.workPlans === undefined || Array.isArray(data.workPlans) && data.workPlans.length <= 20000) && data.plan && typeof data.updatedAt === 'string';
}
function readStore(userData) {
  const file = path.join(userData, 'capital-data.json');
  if (!fs.existsSync(file)) return null;
  for (const candidate of [file, `${file}.bak`]) {
    try { if (!fs.existsSync(candidate)) continue; const raw = fs.readFileSync(candidate, 'utf8'); if (raw.length > 15000000) continue; const data = JSON.parse(raw); if (validEnvelope(data)) return data; } catch {}
  }
  throw new Error('Не удалось прочитать сохранённые данные. Файл capital-data.json не удалён; восстановите резервную копию через настройки.');
}
function createStore(userData) {
  let queue = Promise.resolve();
  return {
    load: () => readStore(userData),
    save: data => {
      const json = JSON.stringify(data);
      if (!validEnvelope(data) || Buffer.byteLength(json) > 15000000) return Promise.reject(new Error('Недопустимые данные или размер больше 15 МБ'));
      const job = queue.catch(() => undefined).then(() => {
        const file = path.join(userData, 'capital-data.json');
        if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
        atomicWrite(file, json);
      });
      queue = job;
      return job;
    },
    flush: () => queue,
  };
}
module.exports = { createStore, readStore, validEnvelope };
