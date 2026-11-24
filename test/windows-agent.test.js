'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');

const { createBridgeServer } = require('../lib/bridge-server');
const { WindowsAgent } = require('../lib/windows-agent');

const ROOT_DIR = path.resolve(__dirname, '..');

async function waitForMessage(messages, predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const index = messages.findIndex(predicate);
    if (index !== -1) return messages.splice(index, 1)[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for WebSocket message');
}

async function connectClient(url, role, token, extra = {}) {
  const ws = new WebSocket(url);
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
  ws.send(JSON.stringify({ type: 'hello', role, token, ...extra }));
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

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = 4242;
    this.killed = false;
  }

  unref() {}

  kill() {
    this.killed = true;
  }
}

test('WindowsAgent reports unsupported platforms', () => {
  const agent = new WindowsAgent({ platform: 'darwin', logger: { info() {}, warn() {} } });
  assert.equal(agent.getStatus().supported, false);
  const result = agent.start({ serverUrl: 'ws://127.0.0.1:3000/ws', token: 'token' });
  assert.equal(result.ok, false);
  assert.match(result.error, /Windows/);
});

test('WindowsAgent starts PowerShell with local environment and tracks presence', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-agent-'));
  const scriptPath = path.join(tempDir, 'RemoteBridgeAgent.ps1');
  fs.writeFileSync(scriptPath, '# test');

  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  let child = null;
  let spawned = null;
  const agent = new WindowsAgent({
    platform: 'win32',
    scriptPath,
    powershellPath: 'powershell.exe',
    logger: { info() {}, warn() {} },
    spawnFn(command, args, options) {
      spawned = { command, args, options };
      child = new FakeChild();
      return child;
    }
  });

  assert.equal(agent.getStatus().supported, true);
  const result = agent.start({
    serverUrl: 'ws://127.0.0.1:3210/ws',
    token: 'test-token'
  });
  assert.equal(result.ok, true);
  assert.equal(spawned.command, 'powershell.exe');
  assert.ok(spawned.args.includes(scriptPath));
  assert.equal(spawned.options.env.REMOTE_BRIDGE_SERVER, 'ws://127.0.0.1:3210/ws');
  assert.equal(spawned.options.env.REMOTE_BRIDGE_TOKEN, 'test-token');
  assert.equal(spawned.options.env.REMOTE_BRIDGE_AGENT_LOCAL, '1');
  assert.equal(spawned.options.windowsHide, true);
  assert.equal(agent.getStatus().running, true);
  assert.equal(agent.getStatus().pid, 4242);

  agent.setPresence({ agents: 1, localAgents: 1 });
  assert.equal(agent.getStatus().localConnected, true);
  assert.equal(agent.getStatus().onlineAgents, 1);

  agent.stop();
  assert.equal(child.killed, true);
});

test('bridge exposes Windows agent status and can start/stop the local agent', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-agent-bridge-'));
  const fakeAgent = new EventEmitter();
  Object.assign(fakeAgent, {
    starts: [],
    stops: 0,
    presences: [],
    status: {
      supported: true,
      platform: 'win32',
      running: false,
      pid: null,
      startedAt: null,
      exitCode: null,
      error: null,
      localConnected: false,
      onlineAgents: 0
    },
    getStatus() {
      return { ...this.status };
    },
    setPresence(presence) {
      this.presences.push({ ...presence });
      const next = {
        ...this.status,
        localConnected: Number(presence.localAgents) > 0,
        onlineAgents: Number(presence.agents) || 0
      };
      if (
        next.localConnected !== this.status.localConnected
        || next.onlineAgents !== this.status.onlineAgents
      ) {
        this.status = next;
        this.emit('status', this.getStatus());
      }
    },
    start(details) {
      this.starts.push(details);
      this.status = { ...this.status, running: true, pid: 777 };
      this.emit('status', this.getStatus());
      return { ok: true };
    },
    stop() {
      this.stops += 1;
      this.status = { ...this.status, running: false, pid: null };
      this.emit('status', this.getStatus());
      return { ok: true };
    },
    shutdown() {
      this.stops += 1;
    }
  });

  const bridge = await createBridgeServer({
    rootDir: ROOT_DIR,
    dataDir: tempDir,
    https: false,
    systemBridge: false,
    localSpeech: false,
    windowsAgent: fakeAgent,
    logger: { info() {}, warn() {} }
  });

  t.after(async () => {
    await bridge.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ports = await bridge.start({ httpPort: 0, httpsPort: 0 });
  const { token } = await (await fetch(`http://127.0.0.1:${ports.httpPort}/api/session`)).json();
  const wsUrl = `ws://127.0.0.1:${ports.httpPort}/ws`;

  const pc = await connectClient(wsUrl, 'pc', token);
  t.after(() => pc.close());
  assert.equal(pc.ready.windowsAgent.supported, true);
  assert.equal(pc.ready.windowsAgent.localConnected, false);

  const agent = await connectClient(wsUrl, 'agent', token, { local: true });
  t.after(() => agent.close());

  const connectedStatus = await waitForMessage(
    pc.messages,
    (message) => message.type === 'agent-local-status' && message.localConnected === true
  );
  assert.equal(connectedStatus.onlineAgents, 1);
  assert.ok(fakeAgent.presences.some((presence) => (
    presence.agents === 1 && presence.localAgents === 1
  )));

  pc.ws.send(JSON.stringify({ type: 'agent-start-local' }));
  await waitForMessage(
    pc.messages,
    (message) => message.type === 'system-event' && message.action === 'localAgentStart'
  );
  assert.equal(fakeAgent.starts.length, 1);
  assert.equal(fakeAgent.starts[0].serverUrl, `ws://127.0.0.1:${ports.httpPort}/ws`);
  assert.equal(fakeAgent.starts[0].token, token);

  pc.ws.send(JSON.stringify({ type: 'agent-stop-local' }));
  const shutdown = await waitForMessage(
    agent.messages,
    (message) => message.type === 'agent-shutdown'
  );
  assert.equal(shutdown.type, 'agent-shutdown');
  assert.equal(fakeAgent.stops, 1);
});
