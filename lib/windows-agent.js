'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

class WindowsAgent extends EventEmitter {
  constructor({
    publicDir,
    logger = console,
    platform = process.platform,
    spawnFn = spawn,
    scriptPath = null,
    powershellPath = null
  } = {}) {
    super();
    this.rootDir = path.resolve(__dirname, '..');
    this.scriptPath = scriptPath || path.join(
      publicDir || path.join(this.rootDir, 'public'),
      'agent',
      'RemoteBridgeAgent.ps1'
    );
    const systemRoot = process.env.SystemRoot || process.env.WINDIR;
    this.powershellPath = powershellPath || (systemRoot
      ? path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe');
    this.logger = logger;
    this.platform = platform;
    this.spawnFn = spawnFn;
    this.process = null;
    this.startedAt = null;
    this.lastExit = null;
    this.error = null;
    this.localConnected = false;
    this.onlineAgents = 0;
    this.connectTimer = null;
  }

  #clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  get supported() {
    return this.platform === 'win32' && fs.existsSync(this.scriptPath);
  }

  getStatus() {
    return {
      supported: this.supported,
      platform: this.platform,
      running: Boolean(this.process),
      pid: this.process?.pid || null,
      startedAt: this.startedAt,
      exitCode: this.lastExit,
      error: this.error,
      localConnected: this.localConnected,
      onlineAgents: this.onlineAgents
    };
  }

  setPresence({ agents = 0, localAgents = 0 } = {}) {
    const connected = Number(localAgents) > 0;
    const online = Number(agents) || 0;
    if (connected === this.localConnected && online === this.onlineAgents) return;
    this.localConnected = connected;
    this.onlineAgents = online;
    if (connected) {
      this.#clearConnectTimer();
      this.error = null;
    }
    this.emit('status', this.getStatus());
  }

  start({ serverUrl, token } = {}) {
    if (!this.supported) {
      this.error = this.platform !== 'win32'
        ? '本机 Windows 助手仅在 Windows 上可用'
        : '找不到 RemoteBridgeAgent.ps1';
      this.emit('status', this.getStatus());
      return { ok: false, error: this.error };
    }
    if (this.process) {
      return { ok: true, alreadyRunning: true };
    }
    if (this.localConnected) {
      return { ok: true, alreadyConnected: true };
    }
    if (!serverUrl || !token) {
      this.error = '缺少启动 Windows 助手所需的地址或配对 token';
      this.emit('status', this.getStatus());
      return { ok: false, error: this.error };
    }

    let child;
    try {
      child = this.spawnFn(
        this.powershellPath,
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.scriptPath
        ],
        {
          cwd: path.dirname(this.scriptPath),
          env: {
            ...process.env,
            REMOTE_BRIDGE_SERVER: serverUrl,
            REMOTE_BRIDGE_TOKEN: token,
            REMOTE_BRIDGE_AGENT_LOCAL: '1'
          },
          detached: true,
          windowsHide: true,
          stdio: 'ignore'
        }
      );
    } catch (error) {
      this.error = `无法启动 Windows 助手：${error.message}`;
      this.emit('status', this.getStatus());
      return { ok: false, error: this.error };
    }

    this.process = child;
    this.startedAt = Date.now();
    this.lastExit = null;
    this.error = null;

    child.once('error', (error) => {
      if (this.process !== child) return;
      this.#clearConnectTimer();
      this.process = null;
      this.error = `无法启动 Windows 助手：${error.message}`;
      this.logger.warn?.(`[windows-agent] ${this.error}`);
      this.emit('status', this.getStatus());
    });

    child.once('exit', (code) => {
      if (this.process !== child) return;
      this.#clearConnectTimer();
      this.process = null;
      this.lastExit = code;
      if (code !== 0) {
        this.error = `Windows 助手已退出（代码 ${code}）`;
        this.logger.warn?.(`[windows-agent] ${this.error}`);
      }
      this.emit('status', this.getStatus());
    });

    this.connectTimer = setTimeout(() => {
      if (this.process && !this.localConnected) {
        this.error = 'Windows 助手已启动，但还没有连接到服务；请检查配对 token 或防火墙';
        this.emit('status', this.getStatus());
      }
    }, 8000);
    this.connectTimer.unref?.();

    child.unref?.();
    this.emit('status', this.getStatus());
    return { ok: true };
  }

  stop() {
    this.#clearConnectTimer();
    if (!this.process) return { ok: true, notRunning: true };
    const child = this.process;
    try {
      child.kill();
    } catch (error) {
      this.error = `无法停止 Windows 助手：${error.message}`;
      this.emit('status', this.getStatus());
      return { ok: false, error: this.error };
    }
    this.process = null;
    this.emit('status', this.getStatus());
    return { ok: true };
  }

  shutdown() {
    return this.stop();
  }
}

module.exports = { WindowsAgent };
