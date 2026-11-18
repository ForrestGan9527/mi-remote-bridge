'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');

const BUILD_TIMEOUT_MS = 90_000;

class SystemBridge extends EventEmitter {
  constructor({ rootDir, logger = console, autoBuild = true, helperPath = null }) {
    super();
    this.rootDir = rootDir;
    this.logger = logger;
    this.autoBuild = autoBuild;
    this.sourcePath = path.join(rootDir, 'native', 'RemoteBridgeHelper.swift');
    this.buildDir = path.join(rootDir, 'native', '.build');
    this.helperPath = helperPath || path.join(this.buildDir, 'RemoteBridgeHelper');
    this.process = null;
    this.stopped = false;
    this.voiceTrigger = 'fn';
    this.activeSessionId = null;
    this.activeSampleRate = null;
    this.outputBuffer = '';
    this.readyPromise = null;
    this.readyResolve = null;
    this.startTimer = null;
    this.status = {
      platform: process.platform,
      supported: process.platform === 'darwin',
      preparing: process.platform === 'darwin' && autoBuild,
      helperReady: false,
      available: false,
      enabled: false,
      active: false,
      device: null,
      accessibility: false,
      voiceTrigger: 'fn',
      frontmostApp: null,
      frontmostBundleId: null,
      secureInput: false,
      error: null
    };
  }

  getStatus() {
    return { ...this.status, enabled: this.status.enabled, voiceTrigger: this.voiceTrigger };
  }

  async initialize(voiceTrigger = 'fn') {
    this.voiceTrigger = voiceTrigger;
    if (process.platform !== 'darwin') {
      this.#setStatus({
        preparing: false,
        available: false,
        error: '系统桥接仅支持 macOS'
      });
      return this.getStatus();
    }

    try {
      await this.#ensureHelperBuilt();
      if (this.stopped) return this.getStatus();
      this.#spawnHelper();
      return this.getStatus();
    } catch (error) {
      this.logger.warn?.(`[system] ${error.message}`);
      this.#setStatus({
        preparing: false,
        available: false,
        helperReady: false,
        error: error.message
      });
      return this.getStatus();
    }
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (next && (!this.process || !this.status.available)) {
      return false;
    }
    if (!next) {
      this.stopAudio();
    }
    if (this.status.enabled !== next) {
      this.#setStatus({ enabled: next }, true);
    }
    return true;
  }

  setVoiceTrigger(trigger) {
    if (!['fn', 'rightOption', 'rightCommand', 'none'].includes(trigger)) return;
    if (this.voiceTrigger === trigger) return;
    this.voiceTrigger = trigger;
    this.#send({ type: 'configure', voiceTrigger: trigger });
    this.#setStatus({ voiceTrigger: trigger }, true);
  }

  requestAccessibility() {
    return this.#send({ type: 'request-accessibility' });
  }

  refreshStatus() {
    return this.#send({ type: 'status' });
  }

  startAudio({ sessionId, sampleRate, source }) {
    if (!this.status.enabled || !this.status.available) return false;
    if (source === 'file') return false;
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      this.endAudio(this.activeSessionId);
    }
    this.activeSessionId = sessionId;
    this.activeSampleRate = sampleRate || 48000;
    this.#send({
      type: 'audio-start',
      sampleRate: this.activeSampleRate,
      voiceTrigger: this.voiceTrigger
    });
    return true;
  }

  sendAudio(sessionId, data) {
    if (!this.status.enabled || !this.activeSessionId || this.activeSessionId !== sessionId) {
      return false;
    }
    if (!data || data.length === 0) return false;
    return this.#send({
      type: 'audio',
      data: data.toString('base64')
    });
  }

  endAudio(sessionId) {
    if (!this.activeSessionId || this.activeSessionId !== sessionId) return;
    this.activeSessionId = null;
    this.activeSampleRate = null;
    this.#send({ type: 'audio-end' });
  }

  stopAudio() {
    if (this.activeSessionId) {
      this.activeSessionId = null;
      this.activeSampleRate = null;
      this.#send({ type: 'audio-end' });
    }
  }

  executeAction(action) {
    if (!this.status.enabled || !this.status.available || !action) return false;
    switch (action.type) {
      case 'keys':
        this.#send({
          type: 'key',
          code: action.code,
          modifiers: action.modifiers || []
        });
        return true;
      case 'media':
        this.#send({ type: 'media', command: action.command });
        return true;
      case 'focusInput':
        this.#send({ type: 'focus-input' });
        return true;
      default:
        return false;
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.startTimer);
    this.activeSessionId = null;
    if (!this.process) return;
    try {
      this.#send({ type: 'quit' });
    } catch {
      // Best effort.
    }
    const child = this.process;
    this.process = null;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          // Best effort.
        }
        resolve();
      }, 800);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async #ensureHelperBuilt() {
    // Packaged apps ship a prebuilt helper and cannot invoke swiftc.
    if (!this.autoBuild) {
      if (fs.existsSync(this.helperPath)) return;
      throw new Error('缺少本机桥接可执行文件，请重新安装应用');
    }
    if (!fs.existsSync(this.sourcePath)) {
      throw new Error('缺少本机桥接源码 native/RemoteBridgeHelper.swift');
    }
    if (!fs.existsSync(this.buildDir)) fs.mkdirSync(this.buildDir, { recursive: true });

    const needsBuild = !fs.existsSync(this.helperPath)
      || fs.statSync(this.sourcePath).mtimeMs > fs.statSync(this.helperPath).mtimeMs;
    if (!needsBuild) return;

    this.logger.info('[system] 正在编译 macOS 本机音频/按键桥接…');
    const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    await new Promise((resolve, reject) => {
      const compiler = spawn(
        'swiftc',
        [
          '-swift-version',
          '5',
          '-O',
          '-target',
          `${architecture}-apple-macos13.0`,
          this.sourcePath,
          '-o',
          this.helperPath,
          '-framework',
          'AppKit',
          '-framework',
          'AVFoundation',
          '-framework',
          'CoreAudio',
          '-framework',
          'AudioToolbox',
          '-framework',
          'ApplicationServices'
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );

      let stderr = '';
      const timer = setTimeout(() => {
        try {
          compiler.kill('SIGKILL');
        } catch {
          // Best effort.
        }
        reject(new Error('本机桥接编译超时'));
      }, BUILD_TIMEOUT_MS);

      compiler.stderr.on('data', (chunk) => {
        if (stderr.length < 16_000) stderr += chunk.toString();
      });
      compiler.once('error', (error) => {
        clearTimeout(timer);
        if (error.code === 'ENOENT') {
          reject(new Error('未安装 Xcode Command Line Tools，无法编译本机桥接'));
        } else {
          reject(new Error(`无法启动 swiftc：${error.message}`));
        }
      });
      compiler.once('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`本机桥接编译失败：${stderr.trim().slice(0, 800)}`));
          return;
        }
        try {
          spawnSync('codesign', ['--force', '--sign', '-', this.helperPath], {
            stdio: 'ignore',
            timeout: 15_000
          });
        } catch {
          // Signing is optional; it only helps make the Accessibility entry stable.
        }
        resolve();
      });
    });
    this.logger.info('[system] 本机桥接编译完成');
  }

  #spawnHelper() {
    const child = spawn(this.helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
    this.process = child;
    this.#setStatus({ preparing: true, error: null }, true);

    child.stdin.on('error', () => {
      // The exit handler below updates the UI; EPIPE alone must not crash the server.
    });

    let stdoutBuffer = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (line) this.#handleHelperLine(line);
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) this.logger.warn?.(`[system] ${message}`);
    });

    child.on('error', (error) => {
      this.#setStatus({
        preparing: false,
        available: false,
        helperReady: false,
        enabled: false,
        error: `本机桥接启动失败：${error.message}`
      }, true);
    });

    child.on('exit', (code, signal) => {
      if (this.process === child) this.process = null;
      this.activeSessionId = null;
      this.activeSampleRate = null;
      this.#setStatus({
        preparing: false,
        available: false,
        helperReady: false,
        active: false,
        enabled: false,
        error: this.stopped ? null : `本机桥接已退出（${signal || code}）`
      }, true);
    });

    this.#send({ type: 'configure', voiceTrigger: this.voiceTrigger });

    clearTimeout(this.startTimer);
    this.startTimer = setTimeout(() => {
      if (!this.status.helperReady && !this.stopped) {
        this.#setStatus({
          preparing: false,
          available: false,
          error: this.status.error || '本机桥接未在预期时间内就绪'
        }, true);
      }
    }, 5000);
    this.startTimer.unref?.();
  }

  #handleHelperLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    switch (message.type) {
      case 'hello':
        this.#setStatus({
          helperReady: true,
          accessibility: Boolean(message.accessibility)
        }, true);
        break;

      case 'configured':
        if (!this.status.available) {
          this.logger.info?.(`[system] 系统桥接就绪，虚拟麦克风：${message.device || '未知'}`);
        }
        this.#setStatus({
          preparing: false,
          available: true,
          helperReady: true,
          device: message.device || null,
          error: null
        }, true);
        break;

      case 'status':
        this.#setStatus({
          helperReady: true,
          preparing: false,
          available: Boolean(message.audioAvailable),
          device: message.device || null,
          accessibility: Boolean(message.accessibility),
          voiceTrigger: message.voiceTrigger || this.voiceTrigger,
          active: Boolean(message.active),
          frontmostApp: message.frontmostApp || null,
          frontmostBundleId: message.frontmostBundleId || null,
          secureInput: Boolean(message.secureInput)
        });
        break;

      case 'accessibility':
        this.#setStatus({ accessibility: Boolean(message.trusted) }, true);
        break;

      case 'audio-started':
        this.#setStatus({
          active: true,
          device: message.device || this.status.device,
          accessibility: Boolean(message.accessibility)
        }, true);
        break;

      case 'audio-ended':
        this.#setStatus({ active: false }, true);
        break;

      case 'action-result':
        this.emit('action-result', {
          action: message.action || 'action',
          ok: Boolean(message.ok),
          message: message.message || ''
        });
        break;

      case 'error':
        this.#setStatus({
          preparing: false,
          available: message.code === 'virtual_device_missing' ? false : this.status.available,
          error: message.message || '本机桥接返回错误'
        }, true);
        this.emit('helper-error', message);
        break;

      default:
        break;
    }
  }

  #send(payload) {
    if (!this.process?.stdin?.writable) return false;
    try {
      this.process.stdin.write(`${JSON.stringify(payload)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  #setStatus(patch, force = false) {
    const next = { ...this.status, ...patch };
    if (patch.voiceTrigger) this.voiceTrigger = patch.voiceTrigger;
    const changed = Object.keys(next).some((key) => this.status[key] !== next[key]);
    this.status = next;
    if (changed || force) this.emit('status', this.getStatus());
  }
}

module.exports = { SystemBridge };
