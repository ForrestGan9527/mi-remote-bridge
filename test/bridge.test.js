'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const WebSocket = require('ws');

const { createBridgeServer } = require('../lib/bridge-server');

const ROOT_DIR = path.resolve(__dirname, '..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMessage(messages, predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const index = messages.findIndex(predicate);
    if (index !== -1) return messages.splice(index, 1)[0];
    await sleep(20);
  }
  throw new Error('Timed out waiting for WebSocket message');
}

async function connectClient(url, role, token) {
  const ws = new WebSocket(url);
  const messages = [];

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      messages.push({ binary: Buffer.from(data) });
      return;
    }
    try {
      messages.push(JSON.parse(data.toString()));
    } catch {
      // Ignore malformed frames in the test client.
    }
  });

  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', role, token }));
  const ready = await waitForMessage(messages, (message) => message.type === 'ready');
  assert.equal(ready.role, role);

  return {
    ws,
    messages,
    async close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        await once(ws, 'close');
      }
    }
  };
}

function encodeVoiceFrame(id, payload) {
  const idBytes = Buffer.from(id, 'utf8');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(idBytes.length, 0);
  return Buffer.concat([header, idBytes, payload]);
}

test('bridge server handles config, keys, voice, and presence', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-test-'));
  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: false,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const baseUrl = `http://127.0.0.1:${ports.httpPort}`;
  const wsUrl = `ws://127.0.0.1:${ports.httpPort}/ws`;
  const sessionResponse = await fetch(`${baseUrl}/api/session`);
  assert.equal(sessionResponse.status, 200);
  const { token } = await sessionResponse.json();
  assert.ok(token);
  const authHeaders = { 'X-Bridge-Token': token };

  await t.test('serves health, defaults, QR info, and validates config', async () => {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);

    const configResponse = await fetch(`${baseUrl}/api/config`, { headers: authHeaders });
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.keys.ok.label, '确认');
    assert.equal(config.keys.voice.label, '语音');
    assert.equal(config.keys.delete.label, '删除');
    assert.equal(config.keys.delete.action.code, 'Backspace');
    assert.deepEqual(config.layout, {
      columns: 2,
      order: [
        'power', 'up', 'left', 'down', 'right', 'ok',
        'back', 'home', 'menu', 'voice',
        'volup', 'voldown', 'mute', 'delete'
      ]
    });
    assert.deepEqual(config.customKeys, []);
    assert.equal(config.audioDevice, '');
    assert.deepEqual(config.hiddenKeys, [
      'power', 'home', 'menu', 'volup', 'voldown', 'mute'
    ]);

    const connectInfoResponse = await fetch(`${baseUrl}/api/connect-info`, { headers: authHeaders });
    assert.equal(connectInfoResponse.status, 200);
    const connectInfo = await connectInfoResponse.json();
    assert.equal(connectInfo.httpsAvailable, false);
    assert.equal(connectInfo.primaryProtocol, 'http');
    assert.match(connectInfo.primaryUrl, /^http:\/\//);
    assert.match(connectInfo.primaryUrl, /[?&]pair=/);
    assert.match(connectInfo.qrDataUrl, /^data:image\/png;base64,/);

    const invalidResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ keys: { ok: { label: '', meaning: 'x' } } })
    });
    assert.equal(invalidResponse.status, 400);

    const invalidActionResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        keys: {
          ok: {
            label: '确认',
            meaning: '确认',
            action: { type: 'keys', code: 'NotAKey', modifiers: [] }
          }
        }
      })
    });
    assert.equal(invalidActionResponse.status, 400);

    const duplicateLayoutResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        keys: config.keys,
        layout: {
          left: ['back', 'back', 'menu', 'voice'],
          right: ['mute', 'delete']
        }
      })
    });
    assert.equal(duplicateLayoutResponse.status, 400);

    const invalidCustomResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        keys: config.keys,
        customKeys: [
          { id: 'bad-id', label: '截图', meaning: '自定义', action: { type: 'none' } }
        ]
      })
    });
    assert.equal(invalidCustomResponse.status, 400);

    const invalidHiddenResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ keys: config.keys, hiddenKeys: ['not-a-key'] })
    });
    assert.equal(invalidHiddenResponse.status, 400);

    const updatedResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        voiceTrigger: 'rightOption',
        audioDevice: 'BlackHole 2ch',
        layout: {
          left: ['voice', 'home', 'menu', 'back'],
          right: ['mute', 'delete']
        },
        customKeys: [
          {
            id: 'custom_shot01',
            label: '截图',
            meaning: '自定义快捷键',
            action: { type: 'keys', code: 'Digit4', modifiers: ['shift', 'cmd'] }
          }
        ],
        hiddenKeys: ['mute'],
        keys: {
          ok: {
            label: '确认播放',
            meaning: '确认 / 播放暂停',
            action: { type: 'keys', code: 'KeyK', modifiers: ['shift', 'cmd'] },
            doubleAction: { type: 'media', command: 'playPause' },
            longAction: { type: 'focusInput' }
          }
        }
      })
    });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json();
    assert.equal(updated.keys.ok.label, '确认播放');
    assert.equal(updated.keys.ok.meaning, '确认 / 播放暂停');
    assert.deepEqual(updated.keys.ok.action, {
      type: 'keys',
      code: 'KeyK',
      modifiers: ['shift', 'cmd']
    });
    assert.deepEqual(updated.keys.ok.doubleAction, {
      type: 'media',
      command: 'playPause'
    });
    assert.deepEqual(updated.keys.ok.longAction, { type: 'focusInput' });
    assert.equal(updated.voiceTrigger, 'rightOption');
    assert.equal(updated.audioDevice, 'BlackHole 2ch');
    assert.deepEqual(updated.layout, {
      columns: 2,
      order: [
        'power', 'up', 'left', 'down', 'right', 'ok',
        'voice', 'home', 'menu', 'back',
        'volup', 'voldown', 'mute', 'delete', 'custom_shot01'
      ]
    });
    assert.equal(updated.customKeys.length, 1);
    assert.equal(updated.customKeys[0].id, 'custom_shot01');
    assert.equal(updated.customKeys[0].action.code, 'Digit4');
    assert.deepEqual(updated.hiddenKeys, ['mute']);
    assert.ok(updated.revision >= 2);

    const diskConfig = JSON.parse(fs.readFileSync(path.join(tempDir, 'config.json'), 'utf8'));
    assert.equal(diskConfig.keys.ok.label, '确认播放');
    assert.equal(diskConfig.voiceTrigger, 'rightOption');
    assert.equal(diskConfig.audioDevice, 'BlackHole 2ch');
    assert.equal(diskConfig.keys.ok.action.code, 'KeyK');
    assert.equal(diskConfig.keys.ok.doubleAction.command, 'playPause');
    assert.equal(diskConfig.keys.ok.longAction.type, 'focusInput');
    assert.deepEqual(diskConfig.layout, {
      columns: 2,
      order: [
        'power', 'up', 'left', 'down', 'right', 'ok',
        'voice', 'home', 'menu', 'back',
        'volup', 'voldown', 'mute', 'delete', 'custom_shot01'
      ]
    });
    assert.equal(diskConfig.customKeys[0].label, '截图');
    assert.deepEqual(diskConfig.hiddenKeys, ['mute']);
  });

  await t.test('rejects API and WebSocket clients without the pairing token', async () => {
    const protectedResponse = await fetch(`${baseUrl}/api/config`);
    assert.equal(protectedResponse.status, 401);

    const ws = new WebSocket(wsUrl);
    const messages = [];
    ws.on('message', (data, isBinary) => {
      if (!isBinary) messages.push(JSON.parse(data.toString()));
    });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'hello', role: 'phone', token: 'wrong-token' }));
    const error = await waitForMessage(messages, (message) => message.type === 'error');
    assert.equal(error.code, 'unauthorized');
    await once(ws, 'close');
  });

  await t.test('relays key events with configured meanings and presence', async () => {
    const pc = await connectClient(wsUrl, 'pc', token);
    const phone = await connectClient(wsUrl, 'phone', token);

    try {
      await waitForMessage(pc.messages, (message) => message.type === 'presence' && message.phones >= 1);

      phone.ws.send(JSON.stringify({ type: 'key', key: 'ok' }));
      const keyEvent = await waitForMessage(pc.messages, (message) => message.type === 'key');
      assert.equal(keyEvent.key, 'ok');
      assert.equal(keyEvent.label, '确认播放');
      assert.equal(keyEvent.meaning, '确认 / 播放暂停');
      assert.equal(keyEvent.source, 'phone');

      const ack = await waitForMessage(phone.messages, (message) => message.type === 'key-ack');
      assert.equal(ack.key, 'ok');
      assert.equal(ack.deliveredTo, 1);

      phone.ws.send(JSON.stringify({ type: 'key', key: 'not-a-key' }));
      const error = await waitForMessage(phone.messages, (message) => message.type === 'error');
      assert.equal(error.code, 'unknown_key');
    } finally {
      await phone.close();
      await pc.close();
    }
  });

  await t.test('broadcasts config updates to phones and PC receivers', async () => {
    const pc = await connectClient(wsUrl, 'pc', token);
    const phone = await connectClient(wsUrl, 'phone', token);

    try {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          keys: {
            ok: { label: '开始', meaning: '开始播放' }
          }
        })
      });
      assert.equal(response.status, 200);

      const pcConfig = await waitForMessage(pc.messages, (message) => message.type === 'config');
      const phoneConfig = await waitForMessage(phone.messages, (message) => message.type === 'config');
      assert.equal(pcConfig.config.keys.ok.label, '开始');
      assert.equal(phoneConfig.config.keys.ok.meaning, '开始播放');
    } finally {
      await phone.close();
      await pc.close();
    }
  });

  await t.test('relays voice start, binary audio, transcript, and end', async () => {
    const pc = await connectClient(wsUrl, 'pc', token);
    const phone = await connectClient(wsUrl, 'phone', token);

    try {
      await waitForMessage(pc.messages, (message) => message.type === 'presence' && message.phones >= 1);

      const voiceId = 'voice-test_123';
      const payload = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
      phone.ws.send(JSON.stringify({
        type: 'voice-start',
        id: voiceId,
        mimeType: 'audio/webm;codecs=opus',
        source: 'microphone'
      }));

      const start = await waitForMessage(pc.messages, (message) => message.type === 'voice-start');
      assert.equal(start.id, voiceId);
      assert.equal(start.mimeType, 'audio/webm;codecs=opus');
      assert.equal(start.source, 'microphone');

      phone.ws.send(encodeVoiceFrame(voiceId, payload));
      const forwarded = await waitForMessage(pc.messages, (message) => Boolean(message.binary));
      const forwardedBuffer = forwarded.binary;
      assert.equal(forwardedBuffer.readUInt16BE(0), voiceId.length);
      assert.equal(forwardedBuffer.subarray(2, 2 + voiceId.length).toString(), voiceId);
      assert.deepEqual(
        [...forwardedBuffer.subarray(2 + voiceId.length)],
        [...payload]
      );

      phone.ws.send(JSON.stringify({
        type: 'voice-transcript',
        id: voiceId,
        text: '你好，这是一条语音测试'
      }));
      const transcript = await waitForMessage(
        pc.messages,
        (message) => message.type === 'voice-transcript'
      );
      assert.equal(transcript.text, '你好，这是一条语音测试');

      phone.ws.send(JSON.stringify({
        type: 'voice-end',
        id: voiceId,
        durationMs: 1234,
        transcript: '你好，这是一条语音测试',
        source: 'microphone'
      }));
      const end = await waitForMessage(pc.messages, (message) => message.type === 'voice-end');
      assert.equal(end.id, voiceId);
      assert.equal(end.durationMs, 1234);
      assert.equal(end.transcript, '你好，这是一条语音测试');
      assert.equal(end.cancelled, false);
    } finally {
      await phone.close();
      await pc.close();
    }
  });

  await t.test('announces a disconnected phone to PC receivers', async () => {
    const pc = await connectClient(wsUrl, 'pc', token);
    const phone = await connectClient(wsUrl, 'phone', token);

    try {
      await waitForMessage(pc.messages, (message) => message.type === 'presence' && message.phones >= 1);
      await phone.close();
      const presence = await waitForMessage(
        pc.messages,
        (message) => message.type === 'presence' && message.phones === 0
      );
      assert.equal(presence.phones, 0);
    } finally {
      await pc.close();
    }
  });
});
