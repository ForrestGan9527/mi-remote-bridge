'use strict';

const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocketServer, WebSocket } = require('ws');

const { ConfigStore } = require('./config-store');
const {
  LIMITS,
  cleanText
} = require('./default-config');
const { ensureHttpsCertificate } = require('./certificate');
const { buildUrl, getLanAddresses } = require('./network');
const { SystemBridge } = require('./system-bridge');

const MAX_WS_PAYLOAD = 30 * 1024 * 1024;
const MAX_VOICE_BYTES = 20 * 1024 * 1024;
const MAX_VOICE_SESSION_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30_000;

function isValidVoiceId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function normalizeMime(value) {
  if (typeof value !== 'string') return 'audio/webm';
  const mime = value.split(';')[0].trim().toLowerCase();
  if (!/^audio\/[a-z0-9.+-]+$/.test(mime)) return 'audio/webm';
  return value.trim().slice(0, LIMITS.voiceMime);
}

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // A socket can close between the state check and the write.
  }
}

function sendError(ws, message, code = 'request_error') {
  sendJson(ws, { type: 'error', code, message });
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 1500);
    timer.unref?.();
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeAllConnections?.();
  });
}

async function createBridgeServer(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const publicDir = options.publicDir || path.join(rootDir, 'public');
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const certDir = options.certDir || path.join(rootDir, 'certs');
  const logger = options.logger || console;
  const host = options.host || '0.0.0.0';

  const loadOrCreateSessionToken = () => {
    if (options.sessionToken) return options.sessionToken;
    const tokenPath = path.join(dataDir, 'pair-token');
    try {
      const stored = fs.readFileSync(tokenPath, 'utf8').trim();
      if (/^[A-Za-z0-9_-]{32,}$/.test(stored)) {
        try {
          fs.chmodSync(tokenPath, 0o600);
        } catch {
          // Permissions are best-effort.
        }
        return stored;
      }
    } catch {
      // No stored token yet.
    }
    const token = crypto.randomBytes(24).toString('base64url');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
    } catch (error) {
      logger.warn?.(`[pair] 无法保存配对码：${error.message}`);
    }
    return token;
  };

  const enableHttps = options.https !== false;
  const sessionToken = loadOrCreateSessionToken();

  const isLoopbackRequest = (req) => {
    const address = req.socket?.remoteAddress || '';
    return address === '127.0.0.1'
      || address === '::1'
      || address === '::ffff:127.0.0.1';
  };

  const requireBridgeToken = (req, res, next) => {
    if (req.get('x-bridge-token') === sessionToken) {
      next();
      return;
    }
    res.status(401).json({ error: '配对无效，请刷新电脑端页面' });
  };

  const configStore = new ConfigStore({ dataDir, logger });
  configStore.load();

  const systemBridge = options.systemBridge === false
    ? null
    : new SystemBridge({
      rootDir,
      logger,
      helperPath: options.helperPath,
      autoBuild: options.systemBridgeAutoBuild !== false
    });

  const runtime = {
    httpPort: null,
    httpsPort: null,
    httpsAvailable: false,
    started: false
  };

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '128kb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      serverTime: Date.now(),
      httpPort: runtime.httpPort,
      httpsPort: runtime.httpsPort,
      httpsAvailable: runtime.httpsAvailable,
      ...presenceSnapshot()
    });
  });

  app.get('/api/session', (req, res) => {
    if (!isLoopbackRequest(req)) {
      res.status(403).json({ error: '请在运行本服务的电脑上打开接收端' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ token: sessionToken });
  });

  app.get('/api/config', requireBridgeToken, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(configStore.get());
  });

  app.put('/api/config', requireBridgeToken, (req, res) => {
    try {
      const config = configStore.update(req.body);
      systemBridge?.setVoiceTrigger(config.voiceTrigger, config.voiceTriggerShortcut);
      systemBridge?.setPreferredDevice(config.audioDevice);
      broadcastAll({ type: 'config', config });
      res.json(config);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/system/open-accessibility', requireBridgeToken, (req, res) => {
    if (process.platform !== 'darwin') {
      res.status(400).json({ error: '仅支持 macOS' });
      return;
    }
    execFile(
      'open',
      ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'],
      (error) => {
        if (error) {
          res.status(500).json({ error: '无法打开系统设置' });
          return;
        }
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/connect-info', requireBridgeToken, async (req, res) => {
    try {
      const info = await getConnectInfo();
      res.setHeader('Cache-Control', 'no-store');
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get(['/', '/phone'], (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.get('/preview', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.get(['/pc', '/pc/'], (req, res) => {
    res.sendFile(path.join(publicDir, 'pc.html'));
  });
  app.use(express.static(publicDir, { index: false, etag: true }));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: '接口不存在' });
      return;
    }
    res.status(404).send('Not found');
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON 格式错误' });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: '请求内容过大' });
      return;
    }
    logger.warn(`[http] ${error.message}`);
    res.status(500).json({ error: '服务器内部错误' });
  });

  const httpServer = http.createServer(app);
  let httpsServer = null;
  let httpsData = null;

  if (enableHttps) {
    if (options.certFile && options.keyFile) {
      if (fs.existsSync(options.certFile) && fs.existsSync(options.keyFile)) {
        httpsData = {
          certPath: options.certFile,
          keyPath: options.keyFile,
          created: false
        };
      } else {
        logger.warn('[https] 指定的证书文件不存在，已跳过 HTTPS');
      }
    } else {
      httpsData = ensureHttpsCertificate({ certDir, logger });
    }

    if (httpsData) {
      try {
        httpsServer = https.createServer(
          {
            key: fs.readFileSync(httpsData.keyPath),
            cert: fs.readFileSync(httpsData.certPath),
            minVersion: 'TLSv1.2'
          },
          app
        );
      } catch (error) {
        logger.warn(`[https] 无法加载证书，已跳过 HTTPS：${error.message}`);
        httpsServer = null;
      }
    }
  }

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD,
    perMessageDeflate: false
  });

  const clients = new Map();
  let nextClientId = 1;

  function handleUpgrade(req, socket, head) {
    let pathname = '';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }

  httpServer.on('upgrade', handleUpgrade);
  httpsServer?.on('upgrade', handleUpgrade);

  function presenceSnapshot() {
    let phones = 0;
    let pcs = 0;
    for (const client of clients.values()) {
      if (client.role === 'phone') phones += 1;
      if (client.role === 'pc') pcs += 1;
    }
    return { phones, pcs };
  }

  function countRole(role) {
    let count = 0;
    for (const client of clients.values()) {
      if (client.role === role) count += 1;
    }
    return count;
  }

  function broadcastAll(payload) {
    const raw = JSON.stringify(payload);
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(raw);
        } catch {
          // The heartbeat will remove dead sockets.
        }
      }
    }
  }

  function broadcastToRole(role, payload) {
    const raw = JSON.stringify(payload);
    for (const client of clients.values()) {
      if (client.role !== role || client.ws.readyState !== WebSocket.OPEN) continue;
      try {
        client.ws.send(raw);
      } catch {
        // Ignore sockets that are closing.
      }
    }
  }

  function broadcastBinaryToRole(role, data) {
    for (const client of clients.values()) {
      if (client.role !== role || client.ws.readyState !== WebSocket.OPEN) continue;
      try {
        client.ws.send(data);
      } catch {
        // Ignore sockets that are closing.
      }
    }
  }

  function broadcastPresence() {
    broadcastAll({ type: 'presence', ...presenceSnapshot() });
  }

  function broadcastSystemStatus() {
    if (!systemBridge) return;
    broadcastToRole('pc', {
      type: 'system-status',
      ...systemBridge.getStatus()
    });
  }

  function clearVoice(client) {
    if (!client.voice) return;
    clearTimeout(client.voice.timer);
    client.voice = null;
  }

  function finishVoice(client, details = {}) {
    const voice = client.voice;
    if (!voice) return;
    clearVoice(client);
    systemBridge?.endAudio(voice.id);
    broadcastToRole('pc', {
      type: 'voice-end',
      id: voice.id,
      startedAt: voice.startedAt,
      durationMs: Number.isFinite(details.durationMs)
        ? Math.max(0, Math.min(MAX_VOICE_SESSION_MS, Math.round(details.durationMs)))
        : Date.now() - voice.startedAt,
      transcript: cleanText(details.transcript, LIMITS.transcript),
      source: voice.source,
      fileName: voice.fileName,
      cancelled: Boolean(details.cancelled),
      reason: details.reason || null,
      ts: Date.now(),
      phoneId: client.id
    });
  }

  wss.on('connection', (ws, req) => {
    const client = {
      id: `client-${nextClientId}`,
      role: null,
      ws,
      alive: true,
      secure: Boolean(req.socket.encrypted),
      voice: null,
      systemEnabled: false
    };
    nextClientId += 1;
    clients.set(ws, client);

    sendJson(ws, {
      type: 'welcome',
      serverTime: Date.now(),
      secure: client.secure
    });

    ws.on('pong', () => {
      client.alive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (client.role !== 'phone' || !client.voice) return;
        const voice = client.voice;
        if (!Buffer.isBuffer(data) || data.length < 3) return;

        const idLength = data.readUInt16BE(0);
        if (idLength < 1 || idLength > LIMITS.voiceId || data.length < 2 + idLength) {
          return;
        }
        const id = data.subarray(2, 2 + idLength).toString('utf8');
        if (id !== voice.id) return;

        const audioBytes = data.length - 2 - idLength;
        if (audioBytes <= 0) return;
        voice.bytes += audioBytes;
        if (voice.bytes > MAX_VOICE_BYTES) {
          sendError(ws, '语音数据过大，本段语音已结束', 'voice_too_large');
          finishVoice(client, { cancelled: true, reason: 'too_large' });
          return;
        }
        broadcastBinaryToRole('pc', data);

        if (voice.format === 'pcm16') {
          const audioPayload = data.subarray(2 + idLength);
          systemBridge?.sendAudio(voice.id, audioPayload);
        }
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        sendError(ws, '消息不是有效 JSON', 'invalid_json');
        return;
      }
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
        sendError(ws, '消息格式无效');
        return;
      }

      if (message.type === 'hello') {
        if (client.role) return;
        if (message.token !== sessionToken) {
          sendError(ws, '配对无效，请重新扫描电脑端二维码', 'unauthorized');
          setTimeout(() => {
            try {
              ws.close(4001, 'unauthorized');
            } catch {
              // Already closed.
            }
          }, 60);
          return;
        }
        if (message.role !== 'phone' && message.role !== 'pc') {
          sendError(ws, '客户端角色无效', 'invalid_role');
          return;
        }
        client.role = message.role;
        sendJson(ws, {
          type: 'ready',
          clientId: client.id,
          role: client.role,
          serverTime: Date.now(),
          secure: client.secure,
          config: configStore.get(),
          presence: presenceSnapshot(),
          system: client.role === 'pc' && systemBridge
            ? systemBridge.getStatus()
            : null
        });
        broadcastPresence();
        if (client.role === 'pc' && systemBridge) broadcastSystemStatus();
        return;
      }

      if (!client.role) {
        sendError(ws, '请先发送 hello', 'not_ready');
        return;
      }

      if (message.type === 'system-enable') {
        if (client.role !== 'pc') return;
        const enabled = Boolean(message.enabled);
        if (enabled) {
          if (!systemBridge || !systemBridge.getStatus().available) {
            sendError(ws, '本机系统桥接尚未就绪', 'system_unavailable');
            return;
          }
          client.systemEnabled = true;
          systemBridge.setEnabled(true);
        } else {
          client.systemEnabled = false;
          if (![...clients.values()].some((entry) => entry.role === 'pc' && entry.systemEnabled)) {
            systemBridge?.setEnabled(false);
          }
        }
        broadcastSystemStatus();
        return;
      }

      if (message.type === 'system-request-accessibility') {
        if (client.role !== 'pc') return;
        if (!systemBridge) {
          sendError(ws, '本机系统桥接不可用', 'system_unavailable');
          return;
        }
        systemBridge.requestAccessibility();
        return;
      }

      if (message.type === 'system-select-device') {
        if (client.role !== 'pc') return;
        if (!systemBridge) {
          sendError(ws, '本机系统桥接不可用', 'system_unavailable');
          return;
        }
        const requested = typeof message.device === 'string' ? message.device.trim() : '';
        const devices = systemBridge.getStatus().devices || [];
        const match = devices.find((device) => {
          if (!device || typeof device !== 'object') return false;
          return device.uid === requested || device.name === requested;
        });
        if (!match) {
          sendError(ws, '没有找到该音频设备，请点击重新检测', 'audio_device_missing');
          systemBridge.refreshStatus();
          return;
        }
        const current = configStore.get();
        const updated = configStore.update({
          ...current,
          audioDevice: match.uid || match.name
        });
        systemBridge.setPreferredDevice(updated.audioDevice);
        broadcastAll({ type: 'config', config: updated });
        broadcastSystemStatus();
        return;
      }

      if (message.type === 'system-refresh') {
        if (client.role !== 'pc') return;
        if (systemBridge) systemBridge.refreshStatus();
        return;
      }

      if (message.type === 'key') {
        if (client.role !== 'phone') return;
        const currentConfig = configStore.get();
        const mapping = currentConfig.keys[message.key]
          || currentConfig.customKeys.find((entry) => entry.id === message.key);
        if (!mapping) {
          sendError(ws, '未知按键', 'unknown_key');
          return;
        }
        const ts = Date.now();
        const deliveredTo = countRole('pc');
        const gesture = ['single', 'double', 'long'].includes(message.gesture)
          ? message.gesture
          : 'single';
        const selectedAction = gesture === 'double'
          ? mapping.doubleAction
          : gesture === 'long'
            ? mapping.longAction
            : mapping.action;
        broadcastToRole('pc', {
          type: 'key',
          key: message.key,
          label: mapping.label,
          meaning: mapping.meaning,
          action: selectedAction || { type: 'none' },
          gesture,
          gestureConfigured: Boolean(selectedAction),
          source: 'phone',
          ts
        });
        sendJson(ws, {
          type: 'key-ack',
          key: message.key,
          gesture,
          deliveredTo,
          ts
        });

        if (systemBridge && selectedAction) {
          systemBridge.executeAction(selectedAction);
        }
        return;
      }

      if (message.type === 'voice-start') {
        if (client.role !== 'phone') return;
        if (!isValidVoiceId(message.id)) {
          sendError(ws, '语音会话 ID 无效', 'invalid_voice_id');
          return;
        }
        if (client.voice) {
          finishVoice(client, { cancelled: true, reason: 'replaced' });
        }

        const source = message.source === 'file' ? 'file' : 'microphone';
        const startedAt = Date.now();
        const sampleRate = Number(message.sampleRate);
        const channels = Number(message.channels);
        const voice = {
          id: message.id,
          startedAt,
          mimeType: normalizeMime(message.mimeType),
          format: message.format === 'pcm16' ? 'pcm16' : 'compressed',
          sampleRate: Number.isFinite(sampleRate)
            ? Math.max(8000, Math.min(96000, Math.round(sampleRate)))
            : null,
          channels: Number.isFinite(channels)
            ? Math.max(1, Math.min(2, Math.round(channels)))
            : 1,
          bytes: 0,
          source,
          fileName: source === 'file'
            ? cleanText(message.fileName, LIMITS.fileName)
            : '',
          timer: null
        };
        voice.timer = setTimeout(() => {
          if (client.voice && client.voice.id === voice.id) {
            finishVoice(client, { cancelled: true, reason: 'timeout' });
          }
        }, MAX_VOICE_SESSION_MS);
        voice.timer.unref?.();
        client.voice = voice;

        broadcastToRole('pc', {
          type: 'voice-start',
          id: voice.id,
          mimeType: voice.mimeType,
          format: voice.format,
          sampleRate: voice.sampleRate,
          channels: voice.channels,
          startedAt,
          source,
          fileName: voice.fileName,
          ts: startedAt,
          phoneId: client.id
        });

        if (voice.format === 'pcm16') {
          systemBridge?.startAudio({
            sessionId: voice.id,
            sampleRate: voice.sampleRate || 48000,
            source
          });
        }
        return;
      }

      if (message.type === 'voice-transcript') {
        if (client.role !== 'phone' || !client.voice) return;
        if (message.id !== client.voice.id) return;
        broadcastToRole('pc', {
          type: 'voice-transcript',
          id: client.voice.id,
          text: cleanText(message.text, LIMITS.transcript),
          final: Boolean(message.final),
          ts: Date.now()
        });
        return;
      }

      if (message.type === 'voice-end') {
        if (client.role !== 'phone' || !client.voice) return;
        if (message.id !== client.voice.id) return;
        finishVoice(client, {
          durationMs: message.durationMs,
          transcript: message.transcript,
          cancelled: Boolean(message.cancelled)
        });
        return;
      }

      if (message.type === 'ping') {
        sendJson(ws, { type: 'pong', ts: Date.now() });
        return;
      }

      sendError(ws, `不支持的消息类型：${message.type}`, 'unknown_message');
    });

    ws.on('close', () => {
      const wasActive = Boolean(client.voice);
      if (wasActive) {
        finishVoice(client, { cancelled: true, reason: 'disconnected' });
      }
      clearVoice(client);
      clients.delete(ws);
      if (client.systemEnabled) {
        client.systemEnabled = false;
        if (![...clients.values()].some((entry) => entry.role === 'pc' && entry.systemEnabled)) {
          systemBridge?.setEnabled(false);
        }
        broadcastSystemStatus();
      }
      if (client.role) broadcastPresence();
    });

    ws.on('error', () => {
      // close fires after error and performs cleanup.
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.alive) {
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      try {
        client.ws.ping();
      } catch {
        client.ws.terminate();
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  async function getConnectInfo() {
    const addresses = getLanAddresses();
    const httpPort = runtime.httpPort || (options.httpPort ?? 3000);
    const httpsPort = runtime.httpsPort || (options.httpsPort ?? 3443);
    const hasLan = addresses.length > 0;
    const hostEntries = addresses.length
      ? addresses
      : [{ address: '127.0.0.1', interface: 'lo0', label: '本机', bluetooth: false }];

    const addPairToken = (url) => {
      const paired = new URL(url);
      paired.searchParams.set('pair', sessionToken);
      return paired.toString();
    };

    const endpoints = [];
    for (const entry of hostEntries) {
      const urls = [];
      if (runtime.httpsAvailable) {
        urls.push({
          protocol: 'https',
          url: addPairToken(buildUrl('https', entry.address, httpsPort)),
          voice: true,
          label: '语音推荐'
        });
      }
      urls.push({
        protocol: 'http',
        url: addPairToken(buildUrl('http', entry.address, httpPort)),
        voice: false,
        label: runtime.httpsAvailable ? '仅按键 / 备用' : '仅按键'
      });

      const primaryUrl = urls[0].url;
      const qrDataUrl = await QRCode.toDataURL(primaryUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 480,
        color: { dark: '#171411', light: '#f7f1e5' }
      });
      endpoints.push({
        address: entry.address,
        interface: entry.interface,
        label: entry.label || entry.interface || entry.address,
        bluetooth: Boolean(entry.bluetooth),
        primaryUrl,
        primaryProtocol: urls[0].protocol,
        urls,
        qrDataUrl
      });
    }

    const primary = endpoints[0];
    return {
      serverTime: Date.now(),
      lanAddresses: addresses,
      endpoints,
      httpPort,
      httpsPort: runtime.httpsAvailable ? httpsPort : null,
      httpsAvailable: runtime.httpsAvailable,
      primaryUrl: primary.primaryUrl,
      primaryProtocol: primary.primaryProtocol,
      urls: primary.urls,
      qrDataUrl: primary.qrDataUrl,
      note: hasLan
        ? '手机和电脑连接同一个 Wi-Fi、USB 网络共享或蓝牙网络后，用手机扫描二维码'
        : '未检测到局域网 IP，请检查网络连接'
    };
  }

  async function start({
    httpPort = Number(process.env.PORT) || 3000,
    httpsPort = Number(process.env.HTTPS_PORT) || 3443
  } = {}) {
    if (runtime.started) throw new Error('服务器已经启动');
    runtime.started = true;

    try {
      await listen(httpServer, httpPort, host);
    } catch (error) {
      runtime.started = false;
      throw error;
    }
    runtime.httpPort = httpServer.address().port;

    if (httpsServer) {
      try {
        await listen(httpsServer, httpsPort, host);
        runtime.httpsPort = httpsServer.address().port;
        runtime.httpsAvailable = true;
      } catch (error) {
        logger.warn(`[https] 无法监听 ${httpsPort} 端口，已继续使用 HTTP：${error.message}`);
        await closeServer(httpsServer);
        httpsServer = null;
        runtime.httpsAvailable = false;
      }
    }

    return {
      httpPort: runtime.httpPort,
      httpsPort: runtime.httpsPort,
      httpsAvailable: runtime.httpsAvailable
    };
  }

  async function stop() {
    clearInterval(heartbeat);
    for (const client of clients.values()) {
      clearVoice(client);
      try {
        client.ws.terminate();
      } catch {
        // Best effort.
      }
    }
    clients.clear();
    wss.close();
    await Promise.all([
      closeServer(httpServer),
      closeServer(httpsServer),
      systemBridge?.stop()
    ]);
    runtime.started = false;
  }

  if (systemBridge) {
    systemBridge.on('status', broadcastSystemStatus);
    systemBridge.on('action-result', (result) => {
      broadcastToRole('pc', {
        type: 'system-event',
        ...result,
        ts: Date.now()
      });
    });
    systemBridge.on('helper-error', (error) => {
      logger.warn(`[system] ${error.message}`);
    });
    void systemBridge.initialize(
      configStore.get().voiceTrigger,
      configStore.get().audioDevice,
      configStore.get().voiceTriggerShortcut
    );
  }

  return {
    app,
    httpServer,
    get httpsServer() {
      return httpsServer;
    },
    configStore,
    systemBridge,
    getConnectInfo,
    start,
    stop,
    get clients() {
      return clients;
    }
  };
}

module.exports = { createBridgeServer };
