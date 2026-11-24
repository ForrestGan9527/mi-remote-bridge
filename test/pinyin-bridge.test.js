'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');
const { EventEmitter } = require('node:events');
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

function createFakeSystemBridge() {
  const bridge = new EventEmitter();
  Object.assign(bridge, {
    calls: [],
    pasteCalls: [],
    unicodeCalls: [],
    autoCalls: [],
    speechLanguages: [],
    status: {
      platform: 'darwin',
      supported: true,
      available: true,
      enabled: true,
      devices: []
    },
    getStatus() {
      return this.status;
    },
    setVoiceTrigger() {},
    setPreferredDevice() {},
    setCaptureText() {},
    clearClipboard() {},
    copyText() {},
    typeText(text, delayMs, options) {
      this.calls.push({ text, delayMs, options });
      return true;
    },
    pasteMacText(text) {
      this.pasteCalls.push(text);
      return true;
    },
    typeUnicodeText(text) {
      this.unicodeCalls.push(text);
      return true;
    },
    autoTypeText(text) {
      this.autoCalls.push(text);
      return true;
    },
    setSpeechLanguage(language) {
      this.speechLanguages.push(language);
      return true;
    },
    setDefaultInput() {},
    requestAccessibility() {},
    refreshStatus() {},
    executeAction() {},
    startAudio() {},
    sendAudio() {},
    endAudio() {},
    setEnabled() {},
    stop() {},
    async initialize() {}
  });
  return bridge;
}

test('PC can request pinyin keyboard input', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-pinyin-'));
  const fakeSystemBridge = createFakeSystemBridge();
  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: fakeSystemBridge,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const baseUrl = `http://127.0.0.1:${ports.httpPort}`;
  const sessionResponse = await fetch(`${baseUrl}/api/session`);
  const { token } = await sessionResponse.json();

  const ws = new WebSocket(`ws://127.0.0.1:${ports.httpPort}/ws`);
  const messages = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    try {
      messages.push(JSON.parse(data.toString()));
    } catch {
      // Ignore malformed frames.
    }
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', role: 'pc', token }));
  await waitForMessage(messages, (message) => message.type === 'ready');

  ws.send(JSON.stringify({
    type: 'system-type-pinyin',
    text: '你好，世界！',
    delayMs: 3000,
    waitForRustDesk: true
  }));

  const deadline = Date.now() + 3000;
  while (fakeSystemBridge.calls.length === 0 && Date.now() < deadline) {
    await sleep(20);
  }
  assert.deepEqual(fakeSystemBridge.calls, [{
    text: 'ni hao, shi jie!',
    delayMs: 3000,
    options: {
      waitForRustDesk: true,
      waitTimeoutMs: 20000
    }
  }]);

  const preview = await waitForMessage(
    messages,
    (message) => message.type === 'system-event'
      && message.action === 'pinyinPreview'
  );
  assert.equal(preview.message, 'ni hao, shi jie!');

  ws.send(JSON.stringify({ type: 'system-type-mac-text', text: '你好，Mac' }));
  await sleep(80);
  assert.deepEqual(fakeSystemBridge.unicodeCalls, ['你好，Mac']);

  ws.send(JSON.stringify({ type: 'system-paste-mac-text', text: '你好，Mac' }));
  await sleep(80);
  assert.deepEqual(fakeSystemBridge.pasteCalls, ['你好，Mac']);

  ws.send(JSON.stringify({ type: 'system-auto-text', text: '自动判断' }));
  await sleep(80);
  assert.deepEqual(fakeSystemBridge.autoCalls, ['自动判断']);

  ws.send(JSON.stringify({ type: 'recognition-language', language: 'en-US' }));
  await sleep(80);
  assert.deepEqual(fakeSystemBridge.speechLanguages, ['en-US']);

  ws.send(JSON.stringify({ type: 'system-type-pinyin', text: '   ' }));
  const error = await waitForMessage(messages, (message) => message.type === 'error');
  assert.equal(error.code, 'empty_text');

  ws.close();
  await once(ws, 'close');
});

test('Auto route sends text to connected Windows agents', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-auto-route-'));
  const fakeSystemBridge = createFakeSystemBridge();
  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: fakeSystemBridge,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const { token } = await (await fetch(`http://127.0.0.1:${ports.httpPort}/api/session`)).json();
  const connect = async (role) => {
    const ws = new WebSocket(`ws://127.0.0.1:${ports.httpPort}/ws`);
    const messages = [];
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try { messages.push(JSON.parse(data.toString())); } catch {}
    });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'hello', role, token }));
    await waitForMessage(messages, (message) => message.type === 'ready');
    return { ws, messages };
  };

  const pc = await connect('pc');
  const agent = await connect('agent');
  try {
    fakeSystemBridge.emit('route-text', { target: 'windows', text: '自动路由测试' });
    const forwarded = await waitForMessage(agent.messages, (message) => message.type === 'agent-text');
    assert.equal(forwarded.text, '自动路由测试');
    const event = await waitForMessage(
      pc.messages,
      (message) => message.type === 'system-event' && message.action === 'autoRoute'
    );
    assert.equal(event.ok, true);
  } finally {
    await agent.ws.close();
    await pc.ws.close();
  }
});

test('Apple Speech results are forwarded to PC and phone', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-apple-speech-'));
  const fakeSystemBridge = createFakeSystemBridge();
  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: fakeSystemBridge,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const sessionResponse = await fetch(`http://127.0.0.1:${ports.httpPort}/api/session`);
  const { token } = await sessionResponse.json();

  const connect = async (role) => {
    const ws = new WebSocket(`ws://127.0.0.1:${ports.httpPort}/ws`);
    const messages = [];
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        // Ignore malformed frames.
      }
    });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'hello', role, token }));
    await waitForMessage(messages, (message) => message.type === 'ready');
    return { ws, messages };
  };

  const pc = await connect('pc');
  const phone = await connect('phone');
  try {
    fakeSystemBridge.emit('speech-result', {
      source: 'apple',
      text: '你好世界',
      final: true,
      error: null
    });

    for (const client of [pc, phone]) {
      const result = await waitForMessage(
        client.messages,
        (message) => message.type === 'speech-result' && message.source === 'apple'
      );
      assert.equal(result.text, '你好世界');
      assert.equal(result.final, true);
    }
  } finally {
    await phone.ws.close();
    await pc.ws.close();
  }
});

test('Mac captured recognition is forwarded to phones', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-speech-'));
  const fakeSystemBridge = createFakeSystemBridge();
  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: fakeSystemBridge,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const sessionResponse = await fetch(`http://127.0.0.1:${ports.httpPort}/api/session`);
  const { token } = await sessionResponse.json();

  const ws = new WebSocket(`ws://127.0.0.1:${ports.httpPort}/ws`);
  const messages = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    try {
      messages.push(JSON.parse(data.toString()));
    } catch {
      // Ignore malformed frames.
    }
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', role: 'phone', token }));
  await waitForMessage(messages, (message) => message.type === 'ready');

  fakeSystemBridge.emit('action-result', {
    action: 'captureText',
    ok: true,
    origin: 'capture',
    message: '你好世界'
  });

  const result = await waitForMessage(
    messages,
    (message) => message.type === 'speech-result'
  );
  assert.equal(result.source, 'mac');
  assert.equal(result.text, '你好世界');

  fakeSystemBridge.emit('action-result', {
    action: 'captureText',
    ok: true,
    origin: 'copy',
    message: 'nihao'
  });
  await sleep(150);
  assert.equal(
    messages.filter((message) => message.type === 'speech-result').length,
    0
  );

  ws.close();
  await once(ws, 'close');
});
