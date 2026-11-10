'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { validEnvelope } = require('./store.cjs');
const { atomicWrite } = require('./update-core.cjs');
const MAX_BODY = 15_000_000;
function configPath(userData) { return path.join(userData, 'sync-settings.json'); }
function loadConfig(userData) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configPath(userData), 'utf8')); } catch {}
  return { lanEnabled: saved.lanEnabled !== false, lanPort: Number.isInteger(saved.lanPort) && saved.lanPort >= 1024 && saved.lanPort <= 65535 ? saved.lanPort : 47653, lanToken: /^[a-f0-9]{64}$/.test(saved.lanToken || '') ? saved.lanToken : crypto.randomBytes(32).toString('hex'), lanUrl: '', cloudEnabled: !!saved.cloudEnabled, supabaseUrl: typeof saved.supabaseUrl === 'string' ? saved.supabaseUrl : '', supabaseKey: typeof saved.supabaseKey === 'string' ? saved.supabaseKey : '', email: typeof saved.email === 'string' ? saved.email : '' };
}
function addresses(port) {
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)).map(n => `http://${n.address}:${port}`))];
}
function createSyncServer(userData, store, onRemote) {
  let config = loadConfig(userData);
  // Keep the pairing key across restarts, including a first install where the
  // settings screen has never been saved. Otherwise paired phones lose access.
  let existingSettings = {};
  try { existingSettings = JSON.parse(fs.readFileSync(configPath(userData), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Не удалось прочитать настройки синхронизации; файл не изменён.'); }
  if (!/^[a-f0-9]{64}$/.test(existingSettings.lanToken || '')) atomicWrite(configPath(userData), JSON.stringify({ ...existingSettings, ...config }, null, 2));
  let server = null;
  let revision = 0;
  let queue = Promise.resolve();
  let error = '';
  const clients = new Set();
  const deviceId = crypto.randomUUID();
  // The wire token is 64 ASCII hex characters, not the 32 decoded bytes.
  const tokenBytes = () => Buffer.from(config.lanToken, 'utf8');
  function authorized(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(header.slice(7));
    return supplied.length === tokenBytes().length && crypto.timingSafeEqual(supplied, tokenBytes());
  }
  function send(res, status, value) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(value)); }
  function envelope() { return { data: store.load(), revision, deviceId }; }
  function broadcast() { for (const res of clients) res.write(`data: ${JSON.stringify({ revision })}\n\n`); }
  async function start() {
    if (server) await new Promise(resolve => server.close(resolve));
    server = null; error = '';
    if (!config.lanEnabled) return;
    const current = http.createServer((req, res) => {
      const origin = req.headers.origin;
      const allowed = !origin || origin === 'app://mi-kapital' || origin === 'https://appassets.androidplatform.net' || /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);
      if (!allowed) return send(res, 403, { error:'Forbidden origin' });
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (!authorized(req)) return send(res, 401, { error:'Неверный ключ сопряжения' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/sync/pull') { try { return send(res, 200, envelope()); } catch (e) { return send(res, 500, { error:e.message }); } }
      if (req.method === 'GET' && url.pathname === '/sync/events') {
        res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
        res.write(`data: ${JSON.stringify({ revision })}\n\n`); clients.add(res);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        req.on('close', () => { clearInterval(heartbeat); clients.delete(res); }); return;
      }
      if (req.method === 'POST' && url.pathname === '/sync/push') {
        let size = 0; const chunks = [];
        req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { send(res, 413, { error:'Данные больше 15 МБ' }); req.destroy(); } else chunks.push(chunk); });
        req.on('end', () => {
          if (res.writableEnded) return;
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error:'Неверный JSON' }); }
          if (!Number.isSafeInteger(body.revision) || body.revision < 0 || typeof body.deviceId !== 'string' || body.deviceId.length > 100 || !validEnvelope(body.data) || Buffer.byteLength(JSON.stringify(body.data)) > MAX_BODY) return send(res, 400, { error:'Неверные данные синхронизации' });
          queue = queue.catch(() => undefined).then(async () => {
            if (body.revision !== revision) return send(res, 409, envelope());
            if (body.data) { await store.save(body.data); revision += 1; onRemote(body.data); }
            send(res, 200, envelope()); broadcast();
          }).catch(e => send(res, 500, { error:e.message }));
        }); return;
      }
      send(res, 404, { error:'Not found' });
    });
    server = current;
    await new Promise(resolve => { current.once('error', e => { error = `Сервер ПК: ${e.message}`; resolve(); }); current.listen(config.lanPort, '0.0.0.0', resolve); });
    if (current.listening) { error = ''; current.on('error', e => { error = `Сервер ПК: ${e.message}`; }); } else server = null;
  }
  return {
    start,
    config: () => ({ ...config }),
    info: () => ({ addresses: addresses(config.lanPort), port:config.lanPort, token:config.lanToken, enabled:config.lanEnabled, error }),
    saveConfig: async next => {
      if (!next || typeof next.lanEnabled !== 'boolean' || !Number.isInteger(next.lanPort) || next.lanPort < 1024 || next.lanPort > 65535 || !/^[a-f0-9]{64}$/.test(next.lanToken)) throw new Error('Неверные настройки локальной сети');
      const restart = next.lanEnabled !== config.lanEnabled || next.lanPort !== config.lanPort || next.lanToken !== config.lanToken;
      config = { ...config, ...next, lanUrl:'' };
      atomicWrite(configPath(userData), JSON.stringify(config, null, 2));
      if (restart) await start();
    },
    changed: () => { revision += 1; broadcast(); },
    close: () => { for (const client of clients) client.end(); server?.close(); },
  };
}
module.exports = { createSyncServer, loadConfig, addresses };
