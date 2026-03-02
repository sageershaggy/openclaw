import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

const app = express();
app.use(cors());
app.use(express.json());

// Serve built static files in production
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Try to auto-detect gateway token from ~/.openclaw/openclaw.json
function autoDetectToken() {
  try {
    const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    return cfg?.gateway?.auth?.token || '';
  } catch {
    return '';
  }
}

// Load/save settings
function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    // Auto-fill token if missing
    if (!s.gatewayToken) s.gatewayToken = autoDetectToken();
    return s;
  } catch {
    return {
      vpnEnabled: false,
      permanentPort: 3001,
      gatewayUrl: 'http://localhost:18789',
      gatewayToken: autoDetectToken(),
    };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Proxy requests to the OpenClaw gateway
async function gatewayFetch(urlPath, options = {}) {
  const settings = loadSettings();
  const base = settings.gatewayUrl || 'http://localhost:18789';
  const url = `${base}${urlPath}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (settings.gatewayToken) {
    headers['Authorization'] = `Bearer ${settings.gatewayToken}`;
  }
  return await fetch(url, { ...options, headers });
}

// --- Gateway proxy endpoints ---

// Health check - uses tools/invoke with a no-op to verify the gateway is alive and authed
app.get('/api/gateway/health', async (req, res) => {
  try {
    // Send a lightweight tools/invoke call to verify connectivity + auth
    const gw = await gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify({ tool: '__ping__', args: {} }),
    });
    const data = await gw.json();
    // Gateway is reachable if it responds (even with tool not found)
    if (gw.status === 401) {
      res.json({ ok: false, error: 'unauthorized', message: 'Invalid gateway token' });
    } else {
      res.json({ ok: true, status: gw.status, gateway: loadSettings().gatewayUrl });
    }
  } catch (e) {
    res.status(502).json({ ok: false, error: 'unreachable', message: e.message });
  }
});

// OpenAI-compatible chat completions (proxy)
app.post('/api/gateway/chat', async (req, res) => {
  try {
    const gw = await gatewayFetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      const reader = gw.body.getReader();
      const decoder = new TextDecoder();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(decoder.decode(value, { stream: true }));
        }
      };
      pump().catch(() => res.end());
    } else {
      const data = await gw.text();
      res.status(gw.status).type('application/json').send(data);
    }
  } catch (e) {
    res.status(502).json({ error: 'Chat request failed', details: e.message });
  }
});

// Tools invoke (proxy)
app.post('/api/gateway/tools/invoke', async (req, res) => {
  try {
    const gw = await gatewayFetch('/tools/invoke', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    const data = await gw.text();
    res.status(gw.status).type('application/json').send(data);
  } catch (e) {
    res.status(502).json({ error: 'Tools invoke failed', details: e.message });
  }
});

// OpenResponses API (proxy)
app.post('/api/gateway/responses', async (req, res) => {
  try {
    const gw = await gatewayFetch('/v1/responses', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    const data = await gw.text();
    res.status(gw.status).type('application/json').send(data);
  } catch (e) {
    res.status(502).json({ error: 'Responses request failed', details: e.message });
  }
});

// --- Settings endpoints ---

app.get('/api/settings', (req, res) => {
  const s = loadSettings();
  // Mask token in response for security
  res.json({ ...s, gatewayToken: s.gatewayToken ? '••••••••' : '' });
});

// Return unmasked settings for internal use
app.get('/api/settings/raw', (req, res) => {
  res.json(loadSettings());
});

app.put('/api/settings', (req, res) => {
  const { vpnEnabled, permanentPort, gatewayUrl, gatewayToken } = req.body;
  const current = loadSettings();
  const updated = { ...current };

  if (permanentPort !== undefined) {
    const port = Number(permanentPort);
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({ error: 'Port must be between 1 and 65535' });
    }
    updated.permanentPort = port;
  }
  if (vpnEnabled !== undefined) updated.vpnEnabled = vpnEnabled;
  if (gatewayUrl !== undefined) updated.gatewayUrl = gatewayUrl;
  // Only update token if a real value is sent (not the masked placeholder)
  if (gatewayToken !== undefined && gatewayToken !== '••••••••') {
    updated.gatewayToken = gatewayToken;
  }

  saveSettings(updated);
  res.json({ ...updated, gatewayToken: updated.gatewayToken ? '••••••••' : '' });
});

// Serve index.html for client-side routing in production
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const settings = loadSettings();
const PORT = process.env.PORT || settings.permanentPort || 3001;
app.listen(PORT, () => {
  console.log(`Deploy webapp backend on http://localhost:${PORT}`);
  console.log(`Gateway target: ${settings.gatewayUrl || 'http://localhost:18789'}`);
  console.log(`Gateway token: ${settings.gatewayToken ? 'configured (auto-detected)' : 'not set'}`);
});
