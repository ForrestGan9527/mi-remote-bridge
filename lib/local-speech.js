'use strict';

const { EventEmitter } = require('node:events');
const { once } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const TARGET_SAMPLE_RATE = 16000;
const MODEL_DIR_NAME = 'sense-voice';
const MODEL_ARCHIVE_NAME = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17';
const MODEL_FILE = 'model.int8.onnx';
const TOKENS_FILE = 'tokens.txt';
const MODEL_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL_ARCHIVE_NAME}.tar.bz2`;
const MODEL_ARCHIVE_BYTES = 163002883;
const MIN_SPEECH_SECONDS = 0.15;
const SILENCE_THRESHOLD = 0.002;
const SILENCE_MARGIN_SECONDS = 0.1;

function pcm16ToFloat32(buffer, channels = 1) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return new Float32Array(0);
  const channelCount = channels === 2 ? 2 : 1;
  const frameBytes = channelCount * 2;
  const frames = Math.floor(buffer.length / frameBytes);
  const samples = new Float32Array(frames);
  if (channelCount === 2) {
    for (let index = 0; index < frames; index += 1) {
      const left = buffer.readInt16LE(index * 4);
      const right = buffer.readInt16LE(index * 4 + 2);
      samples[index] = (left + right) / 65536;
    }
    return samples;
  }
  for (let index = 0; index < frames; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return samples;
}

function resampleTo16k(samples, sampleRate) {
  const rate = Number(sampleRate);
  if (!samples || samples.length === 0) return new Float32Array(0);
  if (!Number.isFinite(rate) || rate <= 0) return new Float32Array(0);
  if (rate === TARGET_SAMPLE_RATE) return samples;

  if (rate % TARGET_SAMPLE_RATE === 0) {
    const factor = rate / TARGET_SAMPLE_RATE;
    const length = Math.floor(samples.length / factor);
    const output = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      let sum = 0;
      const start = index * factor;
      for (let offset = 0; offset < factor; offset += 1) {
        sum += samples[start + offset] || 0;
      }
      output[index] = sum / factor;
    }
    return output;
  }

  const ratio = rate / TARGET_SAMPLE_RATE;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const leftIndex = Math.floor(position);
    const fraction = position - leftIndex;
    const left = samples[leftIndex] || 0;
    const right = samples[leftIndex + 1] ?? left;
    output[index] = left + (right - left) * fraction;
  }
  return output;
}

function trimSilence(samples, sampleRate = TARGET_SAMPLE_RATE) {
  if (!samples || samples.length === 0) return new Float32Array(0);
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < SILENCE_THRESHOLD) {
    start += 1;
  }
  if (start === samples.length) return new Float32Array(0);
  let end = samples.length - 1;
  while (end > start && Math.abs(samples[end]) < SILENCE_THRESHOLD) {
    end -= 1;
  }
  const margin = Math.round(sampleRate * SILENCE_MARGIN_SECONDS);
  start = Math.max(0, start - margin);
  end = Math.min(samples.length - 1, end + margin);
  return samples.slice(start, end + 1);
}

function languageToSenseVoice(value) {
  if (value === 'en-US') return 'en';
  if (value === 'zh-CN') return 'zh';
  return 'auto';
}

function runTar(archivePath, directory) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xjf', archivePath, '-C', directory], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });
    child.on('error', (error) => {
      reject(new Error(`无法解压模型：${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`解压模型失败（tar ${code}）：${stderr.trim().slice(0, 300)}`));
      }
    });
  });
}

class LocalSpeech extends EventEmitter {
  constructor({ dataDir, logger = console, loader } = {}) {
    super();
    const root = dataDir || path.resolve(__dirname, '..', 'data');
    this.modelDir = path.join(root, 'models', MODEL_DIR_NAME);
    this.logger = logger;
    this.loader = loader || (() => require('sherpa-onnx-node'));
    this.recognizer = null;
    this.language = 'auto';
    this.loading = null;
    this.downloading = null;
    this.progress = null;
    this.error = null;
  }

  #modelInstalled() {
    return fs.existsSync(path.join(this.modelDir, MODEL_FILE))
      && fs.existsSync(path.join(this.modelDir, TOKENS_FILE));
  }

  #dependencyAvailable() {
    try {
      require.resolve('sherpa-onnx-node');
      return true;
    } catch {
      return false;
    }
  }

  getStatus() {
    const installed = this.#modelInstalled();
    let state = 'missing';
    if (this.downloading) {
      state = 'downloading';
    } else if (this.loading) {
      state = 'loading';
    } else if (this.recognizer) {
      state = 'ready';
    } else if (this.error) {
      state = 'error';
    } else if (!this.#dependencyAvailable()) {
      state = 'unavailable';
    } else if (installed) {
      state = 'installed';
    }
    return {
      state,
      installed,
      downloading: Boolean(this.downloading),
      loading: Boolean(this.loading),
      progress: this.progress,
      error: this.error,
      modelDir: this.modelDir,
      modelUrl: MODEL_URL,
      modelBytes: MODEL_ARCHIVE_BYTES
    };
  }

  setLanguage(language) {
    const next = languageToSenseVoice(language);
    if (next === this.language) return;
    this.language = next;
    if (this.recognizer) {
      this.recognizer = null;
      this.emit('status', this.getStatus());
    }
  }

  async ensureReady() {
    if (this.recognizer) return this.recognizer;
    if (this.loading) return this.loading;
    if (this.downloading) {
      const error = new Error('本机语音模型正在下载，请稍候');
      error.code = 'model_downloading';
      throw error;
    }
    if (!this.#modelInstalled()) {
      const error = new Error('本机语音模型未安装，请先下载');
      error.code = 'model_missing';
      throw error;
    }

    this.error = null;
    const task = this.#load();
    this.loading = task;
    this.emit('status', this.getStatus());
    return task;
  }

  async #load() {
    try {
      let sherpa;
      try {
        sherpa = this.loader();
      } catch (error) {
        const wrapped = new Error(`本机识别组件不可用：${error.message}`);
        wrapped.code = 'dependency_missing';
        throw wrapped;
      }

      const modelConfig = {
        senseVoice: {
          model: path.join(this.modelDir, MODEL_FILE),
          language: this.language,
          useInverseTextNormalization: 1
        },
        tokens: path.join(this.modelDir, TOKENS_FILE),
        numThreads: Math.max(1, Math.min(4, Math.floor((os.cpus()?.length || 4) / 2) || 2)),
        provider: 'cpu',
        debug: 0
      };
      const featureConfig = {
        sampleRate: TARGET_SAMPLE_RATE,
        featureDim: 80
      };
      const config = {
        featConfig: featureConfig,
        modelConfig
      };

      const recognizer = sherpa.OfflineRecognizer?.createAsync
        ? await sherpa.OfflineRecognizer.createAsync(config)
        : new sherpa.OfflineRecognizer(config);
      this.recognizer = recognizer;
      this.error = null;
      return recognizer;
    } catch (error) {
      this.error = error.message;
      throw error;
    } finally {
      this.loading = null;
      this.emit('status', this.getStatus());
    }
  }

  async transcribe(buffer, { sampleRate = 48000, channels = 1 } = {}) {
    const recognizer = await this.ensureReady();
    const samples = trimSilence(
      resampleTo16k(pcm16ToFloat32(buffer, channels), sampleRate),
      TARGET_SAMPLE_RATE
    );
    if (samples.length < TARGET_SAMPLE_RATE * MIN_SPEECH_SECONDS) {
      return { text: '', durationMs: 0 };
    }

    const stream = recognizer.createStream();
    stream.acceptWaveform({
      sampleRate: TARGET_SAMPLE_RATE,
      samples
    });
    const result = recognizer.decodeAsync
      ? await recognizer.decodeAsync(stream)
      : (recognizer.decode(stream), recognizer.getResult(stream));
    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    return {
      text,
      durationMs: Math.round((samples.length / TARGET_SAMPLE_RATE) * 1000)
    };
  }

  download() {
    if (this.downloading) return this.downloading;
    if (this.#modelInstalled()) {
      return this.ensureReady();
    }

    this.error = null;
    this.progress = { received: 0, total: MODEL_ARCHIVE_BYTES, percent: 0 };
    let task;
    try {
      task = this.#download();
    } catch (error) {
      task = Promise.reject(error);
    }
    this.downloading = task.finally(() => {
      this.downloading = null;
      this.emit('status', this.getStatus());
    });
    this.emit('status', this.getStatus());
    return this.downloading;
  }

  async #download() {
    const modelsRoot = path.dirname(this.modelDir);
    await fsp.mkdir(modelsRoot, { recursive: true });
    const tempDir = await fsp.mkdtemp(path.join(modelsRoot, '.download-'));
    const archivePath = path.join(tempDir, `${MODEL_ARCHIVE_NAME}.tar.bz2`);

    try {
      const response = await fetch(MODEL_URL, { redirect: 'follow' });
      if (!response.ok || !response.body) {
        throw new Error(`模型下载失败（HTTP ${response.status}）`);
      }
      const total = Number(response.headers.get('content-length')) || MODEL_ARCHIVE_BYTES;
      this.progress = { received: 0, total, percent: 0 };

      const file = fs.createWriteStream(archivePath);
      const fileClosed = once(file, 'close');
      const fileFailed = new Promise((_, reject) => {
        file.once('error', reject);
      });
      let received = 0;
      let lastEmitted = 0;
      try {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.length === 0) continue;
          const chunk = Buffer.from(value);
          received += chunk.length;
          if (!file.write(chunk)) {
            await once(file, 'drain');
          }
          const now = Date.now();
          if (now - lastEmitted > 400) {
            this.progress = {
              received,
              total,
              percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0
            };
            this.emit('status', this.getStatus());
            lastEmitted = now;
          }
        }
      } finally {
        file.end();
      }
      await Promise.race([fileClosed, fileFailed]);

      this.progress = { received, total, percent: 100 };
      this.emit('status', this.getStatus());

      await runTar(archivePath, tempDir);
      const entries = await fsp.readdir(tempDir, { withFileTypes: true });
      let extractedDir = null;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(tempDir, entry.name);
        if (
          fs.existsSync(path.join(candidate, MODEL_FILE))
          && fs.existsSync(path.join(candidate, TOKENS_FILE))
        ) {
          extractedDir = candidate;
          break;
        }
      }
      if (!extractedDir) {
        throw new Error('模型压缩包内容不完整');
      }

      await fsp.rm(this.modelDir, { recursive: true, force: true });
      await fsp.mkdir(this.modelDir, { recursive: true });
      await fsp.copyFile(
        path.join(extractedDir, MODEL_FILE),
        path.join(this.modelDir, MODEL_FILE)
      );
      await fsp.copyFile(
        path.join(extractedDir, TOKENS_FILE),
        path.join(this.modelDir, TOKENS_FILE)
      );

      this.progress = null;
      this.error = null;
      const loadTask = this.#load();
      this.loading = loadTask;
      this.emit('status', this.getStatus());
      await loadTask;
      this.logger.info?.(
        `[local-speech] model ready: ${path.join(this.modelDir, MODEL_FILE)}`
      );
    } catch (error) {
      this.progress = null;
      this.error = error.message;
      this.logger.warn?.(`[local-speech] ${error.message}`);
      throw error;
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = {
  LocalSpeech,
  TARGET_SAMPLE_RATE,
  MODEL_URL,
  pcm16ToFloat32,
  resampleTo16k,
  trimSilence
};
