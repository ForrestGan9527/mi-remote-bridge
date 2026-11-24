'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');

const {
  LocalSpeech,
  pcm16ToFloat32,
  resampleTo16k,
  trimSilence
} = require('../lib/local-speech');
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

function encodeVoiceFrame(id, payload) {
  const idBytes = Buffer.from(id, 'utf8');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(idBytes.length, 0);
  return Buffer.concat([header, idBytes, payload]);
}

function makePcm16(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32768))), index * 2);
  });
  return buffer;
}

function createFakeLocalSpeech() {
  const fake = new EventEmitter();
  Object.assign(fake, {
    calls: [],
    downloads: 0,
    languages: [],
    status: {
      state: 'ready',
      installed: true,
      downloading: false,
      loading: false,
      progress: null,
      error: null,
      modelDir: '/tmp/sense-voice',
      modelUrl: 'https://example.invalid/model.tar.bz2',
      modelBytes: 163002883
    },
    getStatus() {
      return { ...this.status };
    },
    setLanguage(language) {
      this.languages.push(language);
    },
    async ensureReady() {
      return true;
    },
    async transcribe(buffer, options) {
      this.calls.push({ bytes: buffer.length, ...options });
      return { text: '本机识别文字', durationMs: 1000 };
    },
    async download() {
      this.downloads += 1;
      return true;
    }
  });
  return fake;
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
      // Ignore malformed frames.
    }
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', role, token }));
  const ready = await waitForMessage(messages, (message) => message.type === 'ready');
  return {
    ws,
    messages,
    ready,
    async close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        await once(ws, 'close');
      }
    }
  };
}

test('local speech resamples PCM16 to 16 kHz and trims silence', () => {
  const pcm = makePcm16([0.5, 0.5, 0.5, -0.5, -0.5, -0.5]);
  const floats = pcm16ToFloat32(pcm, 1);
  assert.equal(floats.length, 6);
  assert.ok(Math.abs(floats[0] - 0.5) < 0.001);

  const resampled = resampleTo16k(floats, 48000);
  assert.equal(resampled.length, 2);
  assert.ok(Math.abs(resampled[0] - 0.5) < 0.001);
  assert.ok(Math.abs(resampled[1] + 0.5) < 0.001);

  const stereo = pcm16ToFloat32(makePcm16([0.5, 0.5, -0.5, -0.5]), 2);
  assert.equal(stereo.length, 2);
  assert.ok(Math.abs(stereo[0] - 0.5) < 0.001);
  assert.ok(Math.abs(stereo[1] + 0.5) < 0.001);

  const silent = new Float32Array(16000).fill(0);
  assert.equal(trimSilence(silent, 16000).length, 0);
  const tone = new Float32Array(16000);
  for (let index = 4000; index < 8000; index += 1) tone[index] = 0.2;
  const trimmed = trimSilence(tone, 16000);
  assert.ok(trimmed.length > 4000);
  assert.ok(trimmed.length < tone.length);
});

test('LocalSpeech loads SenseVoice and transcribes through sherpa-onnx', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-local-'));
  const modelDir = path.join(tempDir, 'models', 'sense-voice');
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(path.join(modelDir, 'model.int8.onnx'), 'model');
  fs.writeFileSync(path.join(modelDir, 'tokens.txt'), 'tokens');

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let capturedConfig = null;
  let accepted = null;
  const fakeRecognizer = {
    createStream() {
      return {
        acceptWaveform(payload) {
          accepted = payload;
        }
      };
    },
    async decodeAsync() {
      return { text: ' 你好世界 ' };
    }
  };
  const loader = () => ({
    OfflineRecognizer: {
      async createAsync(config) {
        capturedConfig = config;
        return fakeRecognizer;
      }
    }
  });

  const localSpeech = new LocalSpeech({
    dataDir: tempDir,
    loader,
    logger: { info() {}, warn() {} }
  });
  localSpeech.setLanguage('zh-CN');
  const statusBefore = localSpeech.getStatus();
  assert.equal(statusBefore.state, 'installed');

  await localSpeech.ensureReady();
  assert.equal(localSpeech.getStatus().state, 'ready');
  assert.equal(capturedConfig.modelConfig.senseVoice.language, 'zh');
  assert.equal(capturedConfig.modelConfig.senseVoice.useInverseTextNormalization, 1);
  assert.equal(capturedConfig.modelConfig.tokens, path.join(modelDir, 'tokens.txt'));
  assert.equal(capturedConfig.featConfig.sampleRate, 16000);

  const pcm = makePcm16(new Array(16000).fill(0.2));
  const result = await localSpeech.transcribe(pcm, { sampleRate: 48000, channels: 1 });
  assert.equal(result.text, '你好世界');
  assert.equal(accepted.sampleRate, 16000);
  assert.ok(accepted.samples.length > 5000);

  localSpeech.setLanguage('en-US');
  assert.equal(localSpeech.language, 'en');
});

test('LocalSpeech reports a missing model', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-local-missing-'));
  const localSpeech = new LocalSpeech({
    dataDir: tempDir,
    loader: () => ({}),
    logger: { info() {}, warn() {} }
  });
  await assert.rejects(
    () => localSpeech.ensureReady(),
    (error) => error.code === 'model_missing'
  );
  assert.equal(localSpeech.getStatus().state, 'missing');
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('bridge buffers PCM and broadcasts local SenseVoice results', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-local-bridge-'));
  const fakeLocalSpeech = createFakeLocalSpeech();
  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: false,
    localSpeech: fakeLocalSpeech,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const sessionResponse = await fetch(`http://127.0.0.1:${ports.httpPort}/api/session`);
  const { token } = await sessionResponse.json();
  const wsUrl = `ws://127.0.0.1:${ports.httpPort}/ws`;

  const pc = await connectClient(wsUrl, 'pc', token);
  const phone = await connectClient(wsUrl, 'phone', token);
  t.after(async () => {
    await pc.close();
    await phone.close();
  });

  assert.equal(pc.ready.localSpeech.state, 'ready');

  pc.ws.send(JSON.stringify({ type: 'recognition-mode', mode: 'local' }));
  const modeMessage = await waitForMessage(
    phone.messages,
    (message) => message.type === 'recognition-mode' && message.mode === 'local'
  );
  assert.equal(modeMessage.mode, 'local');

  phone.ws.send(JSON.stringify({
    type: 'voice-start',
    id: 'voice-local',
    format: 'pcm16',
    sampleRate: 48000,
    channels: 1,
    durationMs: 1000
  }));
  await waitForMessage(pc.messages, (message) => message.type === 'voice-start');

  const pcm = makePcm16(new Array(4800).fill(0.2));
  phone.ws.send(encodeVoiceFrame('voice-local', pcm));
  await sleep(40);
  phone.ws.send(JSON.stringify({
    type: 'voice-end',
    id: 'voice-local',
    durationMs: 1000,
    transcript: ''
  }));

  const pcResult = await waitForMessage(
    pc.messages,
    (message) => message.type === 'speech-result' && message.source === 'local'
  );
  assert.equal(pcResult.text, '本机识别文字');
  assert.equal(pcResult.final, true);
  const phoneResult = await waitForMessage(
    phone.messages,
    (message) => message.type === 'speech-result' && message.source === 'local'
  );
  assert.equal(phoneResult.text, '本机识别文字');
  assert.equal(fakeLocalSpeech.calls.length, 1);
  assert.equal(fakeLocalSpeech.calls[0].bytes, pcm.length);
  assert.equal(fakeLocalSpeech.calls[0].sampleRate, 48000);

  pc.ws.send(JSON.stringify({ type: 'local-speech-download' }));
  const downloadEvent = await waitForMessage(
    pc.messages,
    (message) => message.type === 'system-event' && message.action === 'localSpeechDownload'
  );
  assert.equal(downloadEvent.ok, true);
  assert.equal(fakeLocalSpeech.downloads, 1);
});
