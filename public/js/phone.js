'use strict';

(() => {
  const MAX_RECORDING_MS = 60_000;
  const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;
  const MAX_TRANSCRIPT_LENGTH = 4000;
  const RECOGNITION_PLACEHOLDER = '按住语音键说话，识别结果会显示在这里。';
  const PCM_CHUNK_SAMPLES = 1024;
  const IS_PREVIEW = location.pathname.replace(/\/+$/, '') === '/preview';
  const VOICE_TAIL_MS = 140;
  const DOUBLE_TAP_MS = 300;
  const LONG_PRESS_MS = 550;
  const DELETE_REPEAT_DELAY_MS = 420;
  const DELETE_REPEAT_INTERVAL_MS = 70;
  const textEncoder = new TextEncoder();

  const FALLBACK_KEYS = {
    power: { label: '电源', meaning: '切换设备开关' },
    voice: { label: '语音', meaning: '按住说话，把语音发送到电脑' },
    up: { label: '上', meaning: '向上移动 / 切换上一个' },
    down: { label: '下', meaning: '向下移动 / 切换下一个' },
    left: { label: '左', meaning: '向左移动' },
    right: { label: '右', meaning: '向右移动' },
    ok: { label: '确认', meaning: '确认 / 播放或暂停' },
    back: { label: '返回', meaning: '返回上一级' },
    home: { label: '主页', meaning: '回到主页' },
    menu: { label: '菜单', meaning: '打开菜单' },
    delete: { label: '删除', meaning: '删除 / 退格' },
    volup: { label: '音量 +', meaning: '调高音量' },
    voldown: { label: '音量 −', meaning: '调低音量' },
    mute: { label: '静音', meaning: '切换静音状态' }
  };
  const BASE_KEY_KEYS = new Set(Object.keys(FALLBACK_KEYS));

  const DEFAULT_LAYOUT_COLUMNS = 2;
  const MIN_LAYOUT_COLUMNS = 2;
  const MAX_LAYOUT_COLUMNS = 4;

  const DEFAULT_LAYOUT_ORDER = [
    'power',
    'up',
    'left',
    'down',
    'right',
    'ok',
    'back',
    'home',
    'menu',
    'voice',
    'volup',
    'voldown',
    'mute',
    'delete'
  ];

  const KEY_ICONS = {
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3.2v8.4"/><path d="M7.1 5.7a8 8 0 1 0 9.8 0"/></svg>',
    voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.4V21"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 14 5-5 5 5"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7 9 12l5 5"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 7 5 5-5 5"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7.5"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 4 11l5 5M4 11h9.5a5.5 5.5 0 0 1 5.5 5.5V18"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 10.4 8-6.2 8 6.2V20a1 1 0 0 1-1 1h-4.7v-6H9.7v6H5a1 1 0 0 1-1-1z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="m12 9 5 6m0-6-5 6"/></svg>',
    volup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.8 9H4v6h2.8L11 18.5z"/><path d="M15 9.5a4 4 0 0 1 0 5M18 7a8 8 0 0 1 0 10"/></svg>',
    voldown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.8 9H4v6h2.8L11 18.5z"/><path d="M15 10.5a3 3 0 0 1 0 3"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5.5 6.8 9H4v6h2.8L11 18.5z"/><path d="m16 9 5 5m0-5-5 5"/></svg>'
  };

  const CUSTOM_KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-8 12h6l-1 8 9-13h-6z"/></svg>';

  const state = {
    ws: null,
    wsOpen: false,
    ready: false,
    pcs: 0,
    phones: 0,
    reconnectAttempt: 0,
    reconnectTimer: null,
    closingForPage: false,
    config: null,
    token: null,
    pairInvalid: false,
    voiceHold: false,
    voiceStarting: false,
    voice: null,
    remoteRecognitionMode: 'phone',
    remoteRecognitionLanguage: 'zh-CN',
    lastSentKey: null,
    order: [...DEFAULT_LAYOUT_ORDER],
    columns: DEFAULT_LAYOUT_COLUMNS,
    voiceButton: null
  };

  const dom = {
    connection: document.getElementById('connection'),
    connectionText: document.getElementById('connectionText'),
    connectionSub: document.getElementById('connectionSub'),
    helpButton: document.getElementById('helpButton'),
    textInputButton: document.getElementById('textInputButton'),
    textModal: document.getElementById('textModal'),
    phoneTextInput: document.getElementById('phoneTextInput'),
    phoneTextCount: document.getElementById('phoneTextCount'),
    clearPhoneText: document.getElementById('clearPhoneText'),
    cancelPhoneText: document.getElementById('cancelPhoneText'),
    sendPhoneText: document.getElementById('sendPhoneText'),
    voiceHint: document.getElementById('voiceHint'),
    keyGrid: document.getElementById('keyGrid'),
    okActionSub: document.getElementById('okActionSub'),
    recognitionDisplay: document.getElementById('recognitionDisplay'),
    recognitionSource: document.getElementById('recognitionSource'),
    recognitionText: document.getElementById('recognitionText'),
    voiceOverlay: document.getElementById('voiceOverlay'),
    voiceTimer: document.getElementById('voiceTimer'),
    voiceWave: document.getElementById('voiceWave'),
    voiceLiveTranscript: document.getElementById('voiceLiveTranscript'),
    lastEvent: document.getElementById('lastEvent'),
    lastEventText: document.getElementById('lastEventText'),
    secureNote: document.getElementById('secureNote'),
    toast: document.getElementById('toast'),
    modal: document.getElementById('voiceModal'),
    modalIcon: document.getElementById('modalIcon'),
    modalTitle: document.getElementById('voiceModalTitle'),
    modalBody: document.getElementById('voiceModalBody'),
    modalClose: document.getElementById('modalCloseButton'),
    uploadButton: document.getElementById('uploadAudioButton'),
    fileInput: document.getElementById('audioFileInput')
  };

  let toastTimer = null;
  let lastEventTimer = null;
  let modalUploadAvailable = false;
  let textLayoutLock = null;
  let textUnlockTimer = null;
  let waveBars = [];
  const pressedButtons = new Set();
  const activeRepeats = new Set();

  function init() {
    if (IS_PREVIEW) {
      initPreview();
      return;
    }

    buildWaveBars();
    bindKeyButtons();
    bindVoiceExtras();
    bindTextInput();
    bindGlobalEvents();
    dom.helpButton.addEventListener('click', showRemoteHelp);
    state.token = readPairToken();

    if (!window.isSecureContext) {
      dom.secureNote.hidden = false;
      dom.secureNote.textContent =
        '当前是 HTTP 连接，网页无法录音。请改用电脑端提供的 HTTPS 地址。';
    }

    updateConnectionUI();

    if (!state.token) {
      state.pairInvalid = true;
      updateConnectionUI();
      showVoiceModal({
        title: '需要配对',
        body: '请用手机扫描电脑端「连接手机」卡片中的二维码。配对链接只对本次电脑端服务有效，重新启动服务后需要重新扫码。',
        uploadAvailable: false,
        icon: 'info'
      });
      return;
    }

    connect();
  }

  function initPreview() {
    document.body.classList.add('is-preview');
    document.title = '布局预览';
    dom.connection.className = 'connection is-preview-state';
    dom.connectionText.textContent = '布局预览';
    dom.connectionSub.textContent = '手机端将使用此布局';
    const remote = document.querySelector('.remote-shell');
    if (remote && 'inert' in remote) remote.inert = true;

    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (!event.data || event.data.type !== 'remote-preview-config' || !event.data.config) return;
      applyConfig(event.data.config);
    });

    window.parent.postMessage({ type: 'remote-preview-ready' }, location.origin);
  }

  function customKeyIds(customKeys) {
    return (Array.isArray(customKeys) ? customKeys : [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === 'string' && id);
  }

  function normalizeLayout(layout, customKeys) {
    const required = [...DEFAULT_LAYOUT_ORDER, ...customKeyIds(customKeys)];
    const requiredSet = new Set(required);
    let candidate = [];

    if (layout && Array.isArray(layout.order)) {
      candidate = layout.order;
    } else if (
      layout
      && Array.isArray(layout.left)
      && Array.isArray(layout.right)
      && layout.left.length === 4
      && layout.right.length === 2
    ) {
      candidate = [...DEFAULT_LAYOUT_ORDER, ...customKeyIds(customKeys)];
      candidate[6] = layout.left[0];
      candidate[7] = layout.left[1];
      candidate[8] = layout.left[2];
      candidate[9] = layout.left[3];
      candidate[12] = layout.right[0];
      candidate[13] = layout.right[1];
    }

    const order = [];
    const seen = new Set();
    for (const id of candidate) {
      if (typeof id !== 'string' || !requiredSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
    for (const id of required) {
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }

    const rawColumns = Number(layout?.columns);
    const columns = Number.isInteger(rawColumns)
      && rawColumns >= MIN_LAYOUT_COLUMNS
      && rawColumns <= MAX_LAYOUT_COLUMNS
      ? rawColumns
      : DEFAULT_LAYOUT_COLUMNS;

    return { columns, order };
  }

  function createKeyButton(keyId, customKeys, keys) {
    const custom = (Array.isArray(customKeys) ? customKeys : [])
      .find((entry) => entry?.id === keyId);
    const info = custom
      || keys?.[keyId]
      || FALLBACK_KEYS[keyId]
      || { label: keyId, meaning: '' };

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'remote-key';
    button.dataset.key = keyId;
    button.classList.toggle('is-custom', Boolean(custom));
    button.classList.toggle('is-voice', keyId === 'voice');
    button.innerHTML = custom ? CUSTOM_KEY_ICON : (KEY_ICONS[keyId] || '');

    if (custom) {
      const label = document.createElement('span');
      label.className = 'key-label';
      label.textContent = info.label;
      button.appendChild(label);
    }
    if (keyId === 'voice') {
      const halo = document.createElement('span');
      halo.className = 'voice-halo';
      halo.setAttribute('aria-hidden', 'true');
      button.appendChild(halo);
    }

    button.setAttribute(
      'aria-label',
      custom
        ? `${info.label}，${info.meaning || '自定义快捷键'}`
        : `${info.label}${info.meaning ? `，${info.meaning}` : ''}`
    );
    bindKeyButton(button);
    return button;
  }

  function applyLayout(layout, customKeys, keys) {
    const { columns, order } = normalizeLayout(layout, customKeys);
    state.order = order;
    state.columns = columns;
    dom.keyGrid.style.setProperty('--grid-columns', String(columns));

    const fragment = document.createDocumentFragment();
    for (const keyId of order) {
      fragment.appendChild(createKeyButton(keyId, customKeys, keys));
    }
    dom.keyGrid.replaceChildren(fragment);

    state.voiceButton = dom.keyGrid.querySelector('[data-key="voice"]');
    if (state.voice) state.voiceButton?.classList.add('is-recording');
  }

  const PAIR_STORAGE_KEY = 'remoteBridge.pair';

  function readStoredPairToken() {
    try {
      const stored = localStorage.getItem(PAIR_STORAGE_KEY);
      if (stored) return stored;
    } catch {
      // localStorage can be unavailable in private browsing modes.
    }
    try {
      return sessionStorage.getItem(PAIR_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function storePairToken(token) {
    try {
      localStorage.setItem(PAIR_STORAGE_KEY, token);
    } catch {
      // Fall back to sessionStorage below.
    }
    try {
      sessionStorage.setItem(PAIR_STORAGE_KEY, token);
    } catch {
      // Storage is optional; the URL pair token still works for this load.
    }
  }

  function clearStoredPairToken() {
    try {
      localStorage.removeItem(PAIR_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    try {
      sessionStorage.removeItem(PAIR_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  function readPairToken() {
    try {
      const url = new URL(location.href);
      const fromUrl = url.searchParams.get('pair');
      if (fromUrl) {
        storePairToken(fromUrl);
        url.searchParams.delete('pair');
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        return fromUrl;
      }
      return readStoredPairToken();
    } catch {
      return null;
    }
  }

  function connect() {
    clearTimeout(state.reconnectTimer);
    if (state.pairInvalid || !state.token) return;
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    state.ready = false;
    updateConnectionUI();

    let ws;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    } catch {
      scheduleReconnect();
      return;
    }

    state.ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      if (state.ws !== ws) return;
      state.wsOpen = true;
      state.reconnectAttempt = 0;
      sendJson({
        type: 'hello',
        role: 'phone',
        name: '手机遥控',
        token: state.token
      });
      updateConnectionUI();
    });

    ws.addEventListener('message', (event) => {
      if (state.ws !== ws || typeof event.data !== 'string') return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      handleServerMessage(message);
    });

    ws.addEventListener('close', () => {
      if (state.ws !== ws) return;
      state.wsOpen = false;
      state.ready = false;
      state.ws = null;
      if (state.voice) {
        requestStopVoice({ cancelled: true, reason: 'disconnected' });
        showToast('连接已断开，录音已取消');
      }
      updateConnectionUI();
      if (!state.closingForPage && !state.pairInvalid) scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      try {
        ws.close();
      } catch {
        // close schedules the reconnect
      }
    });
  }

  function scheduleReconnect() {
    if (state.closingForPage || state.pairInvalid || state.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** state.reconnectAttempt, 8000);
    state.reconnectAttempt += 1;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay + Math.random() * 350);
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case 'ready':
        state.ready = true;
        state.pcs = Number(message.presence?.pcs) || 0;
        state.phones = Number(message.presence?.phones) || 0;
        if (message.config) applyConfig(message.config);
        updateConnectionUI();
        break;

      case 'presence':
        state.pcs = Number(message.pcs) || 0;
        state.phones = Number(message.phones) || 0;
        updateConnectionUI();
        break;

      case 'config':
        if (message.config) applyConfig(message.config);
        break;

      case 'error':
        showToast(message.message || '服务器返回了一个错误');
        if (message.code === 'unauthorized') {
          clearStoredPairToken();
          state.token = null;
          state.pairInvalid = true;
          updateConnectionUI();
          showVoiceModal({
            title: '配对已失效',
            body: '配对码已失效（可能已重新生成）。请重新扫描电脑端显示的二维码。',
            uploadAvailable: false,
            icon: 'info'
          });
        } else if (message.code === 'voice_too_large' && state.voice) {
          requestStopVoice({ cancelled: true, reason: 'too_large' });
        }
        break;

      case 'key-ack':
        if (state.lastSentKey === message.key && message.deliveredTo === 0) {
          const info = getKeyInfo(message.key);
          setLastEvent(`${info.label} · 已发送，等待电脑连接`, false, 2200);
        }
        break;

      case 'phone-text-ack':
        if (message.deliveredTo === 0) {
          setLastEvent('文字 · 未送达', false, 2200);
          showToast('电脑接收端未连接，文字未送达');
        }
        break;

      case 'recognition-mode': {
        const mode = ['mac', 'apple', 'local', 'phone'].includes(message.mode)
          ? message.mode
          : 'phone';
        state.remoteRecognitionMode = mode;
        if (mode !== 'phone' && state.voice) {
          state.voice.speechBlocked = true;
          stopSpeechRecognition(state.voice);
        }
        break;
      }

      case 'recognition-language':
        state.remoteRecognitionLanguage = message.language === 'en-US' ? 'en-US' : 'zh-CN';
        break;

      case 'speech-result': {
        const isApple = message.source === 'apple';
        const isLocal = message.source === 'local';
        if ((state.voice || state.voiceStarting) && !isApple && !isLocal) break;
        if (message.error && message.final) {
          const detail = String(message.error).trim().slice(0, 160);
          const existing = dom.recognitionText.textContent.trim();
          const hasPhoneText = existing
            && !dom.recognitionText.classList.contains('is-placeholder')
            && !dom.recognitionSource.textContent.includes('Mac')
            && !dom.recognitionSource.textContent.includes('本机');
          if (hasPhoneText) {
            showToast('本机识别失败，保留手机识别文字');
            break;
          }
          setRecognitionDisplay('', {
            source: isLocal ? 'local' : 'apple',
            live: false,
            placeholder: `本机识别失败：${detail || '未知错误'}`
          });
          showToast(`本机识别失败：${detail || '未知错误'}`);
          break;
        }
        if (typeof message.text === 'string' && message.text.trim()) {
          setRecognitionDisplay(message.text.slice(0, MAX_TRANSCRIPT_LENGTH), {
            source: isLocal ? 'local' : isApple ? 'apple' : message.source === 'mac' ? 'mac' : 'phone',
            live: isApple && !message.final
          });
        }
        break;
      }

      case 'pong':
      case 'welcome':
        break;

      default:
        break;
    }
  }

  function sendJson(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
    try {
      state.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function updateConnectionUI() {
    dom.connection.classList.remove('is-connecting', 'is-waiting', 'is-online', 'is-offline');

    if (state.pairInvalid) {
      dom.connection.classList.add('is-offline');
      dom.connectionText.textContent = '需要配对';
      dom.connectionSub.textContent = '请扫描电脑端二维码';
      return;
    }

    if (!state.wsOpen) {
      if (navigator.onLine === false) {
        dom.connection.classList.add('is-offline');
        dom.connectionText.textContent = '网络已断开';
        dom.connectionSub.textContent = '检查 Wi-Fi 后重试';
      } else if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
        dom.connection.classList.add('is-connecting');
        dom.connectionText.textContent = '正在连接';
        dom.connectionSub.textContent = '正在连接电脑';
      } else {
        dom.connection.classList.add('is-offline');
        dom.connectionText.textContent = '正在重连';
        dom.connectionSub.textContent = '请保持页面打开';
      }
      return;
    }

    if (!state.ready) {
      dom.connection.classList.add('is-connecting');
      dom.connectionText.textContent = '正在连接';
      dom.connectionSub.textContent = '正在同步电脑端';
      return;
    }

    if (state.pcs > 0) {
      dom.connection.classList.add('is-online');
      dom.connectionText.textContent = '电脑已连接';
      dom.connectionSub.textContent = '语音发送已就绪';
    } else {
      dom.connection.classList.add('is-waiting');
      dom.connectionText.textContent = '等待电脑';
      dom.connectionSub.textContent = '请打开电脑接收端';
    }
  }

  function applyConfig(config) {
    if (!config || typeof config !== 'object' || !config.keys) return;
    state.config = config;

    applyLayout(
      config.layout || { order: DEFAULT_LAYOUT_ORDER },
      config.customKeys,
      config.keys
    );

    document.querySelectorAll('[data-key-label]').forEach((element) => {
      const info = config.keys[element.dataset.keyLabel];
      if (!info || typeof info.label !== 'string' || !info.label.trim()) return;
      element.textContent = info.label;
    });
    const voiceLabel = config.keys.voice?.label || '语音';
    if (dom.voiceHint) {
      dom.voiceHint.textContent = `按住${voiceLabel}键说话 · 松开即发送`;
    }
    applyHiddenKeys(config.hiddenKeys);
  }

  function applyHiddenKeys(hiddenKeys) {
    const hidden = new Set(
      (Array.isArray(hiddenKeys) ? hiddenKeys : [])
        .filter((key) => BASE_KEY_KEYS.has(key))
    );

    dom.keyGrid.querySelectorAll('[data-key]').forEach((button) => {
      button.style.display = hidden.has(button.dataset.key) ? 'none' : '';
    });

    const hintRow = document.querySelector('.footer-hint-row');
    if (hintRow) hintRow.hidden = hidden.has('voice');
  }

  function describePhoneAction(action) {
    if (!action || action.type === 'none') return '不执行';
    if (action.type === 'focusInput') return '聚焦输入框';
    if (action.type === 'media') {
      const names = {
        playPause: '播放 / 暂停',
        volumeUp: '音量 +',
        volumeDown: '音量 −',
        mute: '静音',
        nextTrack: '下一首',
        previousTrack: '上一首'
      };
      return names[action.command] || '媒体键';
    }
    if (action.type === 'keys') {
      if (action.code === 'Enter' && (!action.modifiers || !action.modifiers.length)) {
        return 'Return';
      }
      const modifierSymbols = {
        control: '⌃', option: '⌥', shift: '⇧', cmd: '⌘', fn: 'fn'
      };
      const codeNames = {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Enter: 'Return', NumpadEnter: 'Enter', Escape: 'Esc', Tab: 'Tab',
        Space: 'Space', Backspace: 'Delete', Delete: 'Del', Home: 'Home',
        End: 'End', PageUp: 'Page ↑', PageDown: 'Page ↓',
        Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']',
        Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
        Period: '.', Slash: '/', Backquote: '`'
      };
      let keyName = codeNames[action.code];
      if (!keyName && action.code.startsWith('Key')) keyName = action.code.slice(3);
      if (!keyName && action.code.startsWith('Digit')) keyName = action.code.slice(5);
      if (!keyName) keyName = action.code;
      const mods = (action.modifiers || []).map((modifier) => modifierSymbols[modifier] || '').join('');
      return `${mods}${keyName}`;
    }
    return 'Return';
  }

  function getKeyInfo(key) {
    return (
      state.config?.keys?.[key] ||
      state.config?.customKeys?.find((entry) => entry.id === key) ||
      FALLBACK_KEYS[key] || { label: key, meaning: '' }
    );
  }

  function bindKeyButtons() {
    document.querySelectorAll('[data-key]').forEach(bindKeyButton);
  }

  function bindKeyButton(button) {
    if (!button || button.dataset.keyBound === '1') return;
    button.dataset.keyBound = '1';

    const gesture = {
      pointerDown: false,
      immediateSent: false,
      longFired: false,
      secondTap: false,
      voice: false,
      longTimer: null,
      singleTimer: null,
      repeatDelayTimer: null,
      repeatIntervalTimer: null
    };

    const clearLongTimer = () => {
      clearTimeout(gesture.longTimer);
      gesture.longTimer = null;
    };

    const startVoiceHold = () => {
      if (state.voiceHold) return;
      state.voiceHold = true;
      state.voiceButton = button;
      addPressedState(button);
      beginVoiceHold();
    };

    const handlePointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      if (gesture.pointerDown) return;
      gesture.pointerDown = true;
      gesture.immediateSent = false;
      gesture.longFired = false;
      gesture.secondTap = false;
      gesture.voice = button.dataset.key === 'voice';

      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is a convenience; release handlers still run normally.
      }

      if (gesture.voice) {
        startVoiceHold();
        return;
      }

      addPressedState(button);
      const info = getKeyInfo(button.dataset.key);
      const hasDouble = Boolean(info.doubleAction);
      const hasLong = Boolean(info.longAction);

      if (!hasDouble && !hasLong) {
        gesture.immediateSent = true;
        pressKey(button.dataset.key, 'single');
        if (button.dataset.key === 'delete') {
          activeRepeats.add(gesture);
          gesture.repeatDelayTimer = setTimeout(() => {
            gesture.repeatDelayTimer = null;
            if (!gesture.pointerDown) {
              stopKeyRepeat(gesture);
              return;
            }
            gesture.repeatIntervalTimer = setInterval(() => {
              if (!gesture.pointerDown) {
                stopKeyRepeat(gesture);
                return;
              }
              pressKey('delete', 'single', { repeat: true });
            }, DELETE_REPEAT_INTERVAL_MS);
          }, DELETE_REPEAT_DELAY_MS);
        }
        return;
      }

      if (gesture.singleTimer) {
        clearTimeout(gesture.singleTimer);
        gesture.singleTimer = null;
        gesture.secondTap = true;
      }

      if (hasLong) {
        gesture.longTimer = setTimeout(() => {
          gesture.longTimer = null;
          if (!gesture.pointerDown) return;
          if (!getKeyInfo(button.dataset.key).longAction) return;
          gesture.longFired = true;
          pressKey(button.dataset.key, 'long');
        }, LONG_PRESS_MS);
      }
    };

    const handlePointerUp = () => {
      if (!gesture.pointerDown) return;
      gesture.pointerDown = false;
      clearLongTimer();
      stopKeyRepeat(gesture);
      if (gesture.voice) {
        gesture.voice = false;
        return;
      }
      if (gesture.immediateSent || gesture.longFired) {
        gesture.immediateSent = false;
        gesture.longFired = false;
        return;
      }

      const info = getKeyInfo(button.dataset.key);
      if (info.doubleAction) {
        if (gesture.secondTap) {
          gesture.secondTap = false;
          pressKey(button.dataset.key, 'double');
          return;
        }
        if (!gesture.singleTimer) {
          gesture.singleTimer = setTimeout(() => {
            gesture.singleTimer = null;
            pressKey(button.dataset.key, 'single');
          }, DOUBLE_TAP_MS);
        }
      } else {
        pressKey(button.dataset.key, 'single');
      }
    };

    button.addEventListener('pointerdown', handlePointerDown);
    button.addEventListener('pointerup', handlePointerUp);
    button.addEventListener('pointercancel', () => {
      clearLongTimer();
      stopKeyRepeat(gesture);
      gesture.pointerDown = false;
      gesture.secondTap = false;
      gesture.voice = false;
    });

    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.repeat) return;
      event.preventDefault();
      if (button.dataset.key === 'voice') {
        startVoiceHold();
        return;
      }
      pressKey(button.dataset.key, 'single');
      flashButton(button);
    });

    button.addEventListener('keyup', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (button.dataset.key !== 'voice') return;
      event.preventDefault();
      endVoiceHold();
    });

    // Assistive technology can activate buttons through a synthetic click.
    button.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      if (button.dataset.key === 'voice') return;
      pressKey(button.dataset.key, 'single');
      flashButton(button);
    });
  }

  function stopKeyRepeat(gesture) {
    if (!gesture) return;
    clearTimeout(gesture.repeatDelayTimer);
    clearInterval(gesture.repeatIntervalTimer);
    gesture.repeatDelayTimer = null;
    gesture.repeatIntervalTimer = null;
    activeRepeats.delete(gesture);
  }

  function stopAllKeyRepeats() {
    for (const gesture of [...activeRepeats]) {
      stopKeyRepeat(gesture);
    }
  }

  function pressKey(key, gestureName = 'single', options = {}) {
    const info = getKeyInfo(key);
    const gestureLabel = gestureName === 'double'
      ? '双击'
      : gestureName === 'long'
        ? '长按'
        : '';
    if (navigator.vibrate && !options.repeat) {
      try {
        navigator.vibrate(gestureName === 'long' ? 14 : 7);
      } catch {
        // Vibration is optional.
      }
    }

    if (!sendJson({ type: 'key', key, gesture: gestureName })) {
      showToast('尚未连接到服务，请稍后重试');
      setLastEvent('未发送 · 等待连接', false, 1500);
      return;
    }

    state.lastSentKey = key;
    const meaning = info.meaning.length > 38
      ? `${info.meaning.slice(0, 38)}…`
      : info.meaning;
    setLastEvent(
      `${info.label}${gestureLabel ? ` ${gestureLabel}` : ''}${meaning ? ` · ${meaning}` : ''}`,
      true,
      950
    );
  }

  function addPressedState(button) {
    button.classList.add('is-pressed');
    clearTimeout(button._pressReleaseTimer);
    button._pressReleaseTimer = setTimeout(() => {
      button.classList.remove('is-pressed');
    }, 4000);
    pressedButtons.add(button);
  }

  function releaseAllPressedButtons() {
    for (const button of pressedButtons) {
      clearTimeout(button._pressReleaseTimer);
      button.classList.remove('is-pressed');
    }
    pressedButtons.clear();
  }

  function flashButton(button, duration = 160) {
    button.classList.add('is-pressed');
    setTimeout(() => button.classList.remove('is-pressed'), duration);
  }

  function setLastEvent(text, active = true, duration = 1000) {
    dom.lastEvent.classList.add('is-visible');
    dom.lastEventText.textContent = text;
    dom.lastEvent.classList.toggle('is-active', active);
    clearTimeout(lastEventTimer);
    lastEventTimer = setTimeout(() => {
      dom.lastEvent.classList.remove('is-active');
    }, duration);
  }

  function showToast(text, duration = 2000) {
    dom.toast.textContent = text;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, duration);
  }

  // ---------------------------------------------------------------------------
  // Voice recording
  // ---------------------------------------------------------------------------

  function bindVoiceExtras() {
    dom.modalClose.addEventListener('click', closeVoiceModal);
    dom.modal.querySelector('[data-close-modal]').addEventListener('click', closeVoiceModal);
    dom.uploadButton.addEventListener('click', () => {
      closeVoiceModal();
      dom.fileInput.click();
    });
    dom.fileInput.addEventListener('change', handleFileSelection);
  }

  function bindTextInput() {
    dom.textInputButton.addEventListener('click', openTextModal);
    dom.cancelPhoneText.addEventListener('click', closeTextModal);
    dom.sendPhoneText.addEventListener('click', sendPhoneText);
    dom.clearPhoneText.addEventListener('click', () => {
      dom.phoneTextInput.value = '';
      updatePhoneTextCount();
      dom.phoneTextInput.focus();
    });
    dom.textModal.querySelector('[data-close-text-modal]')
      .addEventListener('click', closeTextModal);
    dom.phoneTextInput.addEventListener('input', updatePhoneTextCount);
    dom.phoneTextInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      // Enter from the software keyboard's send key should submit directly.
      // Shift+Enter keeps a newline.
      if (event.isComposing || event.keyCode === 229) return;
      if (event.shiftKey) return;
      event.preventDefault();
      sendPhoneText();
    });
    if (window.visualViewport) {
      const syncViewport = () => {
        if (!dom.textModal.hidden) layoutTextModal();
      };
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
    }
  }

  function layoutTextModal() {
    if (dom.textModal.hidden || !window.visualViewport) return;
    const viewport = window.visualViewport;
    dom.textModal.style.top = `${viewport.offsetTop}px`;
    dom.textModal.style.left = `${viewport.offsetLeft}px`;
    dom.textModal.style.right = 'auto';
    dom.textModal.style.bottom = 'auto';
    dom.textModal.style.width = `${viewport.width}px`;
    dom.textModal.style.height = `${viewport.height}px`;
    dom.textModal.style.setProperty('--vv-height', `${viewport.height}px`);
  }

  function resetTextModalLayout() {
    for (const property of ['top', 'left', 'right', 'bottom', 'width', 'height']) {
      dom.textModal.style.removeProperty(property);
    }
    dom.textModal.style.removeProperty('--vv-height');
  }

  function lockPhoneLayout() {
    if (textLayoutLock) return;
    const stage = document.querySelector('.stage');
    const remote = document.querySelector('.remote-shell');
    if (!stage || !remote) return;

    const stageRect = stage.getBoundingClientRect();
    const remoteRect = remote.getBoundingClientRect();
    textLayoutLock = {
      stageStyle: stage.getAttribute('style'),
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      scrollY: window.scrollY,
      viewportHeight: window.visualViewport?.height || window.innerHeight
    };

    document.body.classList.add('is-text-input-open');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    stage.style.position = 'fixed';
    stage.style.top = `${stageRect.top}px`;
    stage.style.left = `${stageRect.left}px`;
    stage.style.width = `${stageRect.width}px`;
    stage.style.height = `${stageRect.height}px`;
    stage.style.minHeight = '0';
    stage.style.margin = '0';
    stage.style.overflow = 'hidden';
    stage.style.setProperty('--rw', `${remoteRect.width}px`);
  }

  function unlockPhoneLayout() {
    if (!textLayoutLock) return;
    clearTimeout(textUnlockTimer);
    textUnlockTimer = null;
    const stage = document.querySelector('.stage');
    if (stage) {
      if (textLayoutLock.stageStyle === null) {
        stage.removeAttribute('style');
      } else {
        stage.setAttribute('style', textLayoutLock.stageStyle);
      }
    }
    document.body.classList.remove('is-text-input-open');
    document.documentElement.style.overflow = textLayoutLock.htmlOverflow;
    document.body.style.overflow = textLayoutLock.bodyOverflow;
    const scrollY = textLayoutLock.scrollY;
    textLayoutLock = null;
    window.scrollTo(0, scrollY);
    setTimeout(resetZoomIfNeeded, 120);
  }

  function resetZoomIfNeeded() {
    const scale = window.visualViewport?.scale || 1;
    if (scale <= 1.05) return;

    let lastAttempt = 0;
    try {
      lastAttempt = Number(sessionStorage.getItem('remoteBridge.zoomResetAt')) || 0;
    } catch {
      // Storage is optional.
    }
    if (Date.now() - lastAttempt < 3000) return;
    try {
      sessionStorage.setItem('remoteBridge.zoomResetAt', String(Date.now()));
    } catch {
      // Storage is optional.
    }

    // Give the browser a chance to apply the viewport constraints.
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      const content = meta.getAttribute('content')
        || 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
      setTimeout(() => {
        meta.setAttribute('content', content);
        setTimeout(() => {
          if ((window.visualViewport?.scale || 1) > 1.05) {
            window.location.reload();
          }
        }, 120);
      }, 60);
      return;
    }

    window.location.reload();
  }

  function updatePhoneTextCount() {
    const length = Array.from(dom.phoneTextInput.value).length;
    dom.phoneTextCount.textContent = `${length} / 4000`;
  }

  function openTextModal() {
    if (state.voice || state.voiceStarting) {
      showToast('请先结束当前录音');
      return;
    }
    if (!state.wsOpen || !state.ready) {
      showToast('服务尚未连接，暂时无法发送文字');
      return;
    }
    if (state.pcs === 0) {
      showToast('电脑接收端尚未连接');
      return;
    }
    clearTimeout(textUnlockTimer);
    textUnlockTimer = null;
    lockPhoneLayout();
    dom.textModal.hidden = false;
    updatePhoneTextCount();
    layoutTextModal();
    try {
      // Focus inside the original click gesture and avoid browser scrolling.
      dom.phoneTextInput.focus({ preventScroll: true });
    } catch {
      // The keyboard cannot always be opened programmatically.
    }
  }

  function closeTextModal() {
    try {
      dom.phoneTextInput.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } catch {
      // Ignore focus failures.
    }
    dom.textModal.hidden = true;
    resetTextModalLayout();
    scheduleUnlockPhoneLayout();
  }

  function scheduleUnlockPhoneLayout() {
    if (!textLayoutLock) return;
    const targetHeight = textLayoutLock.viewportHeight;
    const startedAt = Date.now();
    const attempt = () => {
      if (!textLayoutLock) return;
      const height = window.visualViewport?.height || window.innerHeight;
      // Keep the remote frozen until the soft keyboard has fully closed.
      if (height >= targetHeight - 2 || Date.now() - startedAt > 900) {
        unlockPhoneLayout();
        return;
      }
      textUnlockTimer = setTimeout(attempt, 80);
    };
    clearTimeout(textUnlockTimer);
    textUnlockTimer = setTimeout(attempt, 180);
  }

  function sendPhoneText() {
    const text = dom.phoneTextInput.value.trim();
    if (!text) {
      showToast('还没有输入文字');
      return;
    }
    if (state.pcs === 0) {
      showToast('电脑接收端未连接，文字未发送');
      return;
    }
    if (!sendJson({
      type: 'phone-text',
      text,
      source: 'keyboard'
    })) {
      showToast('服务未连接，文字未发送');
      return;
    }
    setRecognitionDisplay(text, { source: 'keyboard', live: false });
    setLastEvent('文字 · 已发送', true, 1400);
    showToast('文字已发送');
    closeTextModal();
    dom.phoneTextInput.value = '';
    updatePhoneTextCount();
  }

  function bindGlobalEvents() {
    document.addEventListener('pointerup', () => {
      stopAllKeyRepeats();
      releaseAllPressedButtons();
      endVoiceHold();
    });
    document.addEventListener('pointercancel', () => {
      stopAllKeyRepeats();
      releaseAllPressedButtons();
      endVoiceHold();
    });
    document.addEventListener('contextmenu', (event) => {
      if (event.target.closest('[data-key]')) event.preventDefault();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!dom.textModal.hidden) {
        closeTextModal();
        return;
      }
      if (!dom.modal.hidden) closeVoiceModal();
    });
    // Safari on iOS can pinch-zoom the remote into a corner. Keep the
    // control surface at its designed scale.
    for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(gesture, (event) => {
        event.preventDefault();
      }, { passive: false });
    }
    window.addEventListener('blur', () => {
      stopAllKeyRepeats();
      releaseAllPressedButtons();
      if (state.voiceHold) endVoiceHold();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAllKeyRepeats();
        releaseAllPressedButtons();
      }
      if (document.hidden && state.voice) {
        requestStopVoice({ cancelled: false });
      }
    });
    window.addEventListener('pagehide', () => {
      state.closingForPage = true;
      clearTimeout(state.reconnectTimer);
      if (state.voice) requestStopVoice({ cancelled: true });
      try {
        state.ws?.close();
      } catch {
        // The page is going away.
      }
    });
    window.addEventListener('online', () => {
      if (!state.wsOpen) connect();
    });
    window.addEventListener('offline', updateConnectionUI);
  }

  function endVoiceHold() {
    if (!state.voiceHold) {
      if (state.voice) requestStopVoice({ cancelled: false });
      return;
    }
    state.voiceHold = false;
    state.voiceButton?.classList.remove('is-pressed');
    if (state.voice) {
      requestStopVoice({ cancelled: false });
    }
  }

  async function beginVoiceHold() {
    if (state.voiceStarting || state.voice) return;

    if (!state.wsOpen) {
      showVoiceModal({
        title: '还没有连接到服务',
        body: '请先确认页面顶部的连接状态，连接成功后再按住语音键。也可以检查电脑端服务是否正在运行。',
        uploadAvailable: false
      });
      state.voiceHold = false;
      return;
    }

    if (!window.isSecureContext) {
      showVoiceModal({
        title: '语音需要 HTTPS',
        body: '手机浏览器只允许在 HTTPS 安全连接下使用麦克风。请回到电脑端，使用“连接手机”卡片里的 HTTPS 地址重新打开本页。你也可以上传一段已经录好的音频。',
        uploadAvailable: true
      });
      state.voiceHold = false;
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
      showVoiceModal({
        title: '当前浏览器无法录音',
        body: '这个浏览器不支持网页实时录音。请尝试较新的 Chrome 或 Safari，或者上传一段已经录好的音频。',
        uploadAvailable: true
      });
      state.voiceHold = false;
      return;
    }

    state.voiceStarting = true;

    // Create the audio context while the pointerdown gesture is still active.
    // This is important on iOS, where an AudioContext created after an await
    // may stay suspended.
    let audioContext = null;
    try {
      try {
        audioContext = new AudioContextClass({ sampleRate: 48000, latencyHint: 'interactive' });
      } catch {
        audioContext = new AudioContextClass();
      }
      audioContext.resume?.().catch(() => {});
    } catch {
      state.voiceStarting = false;
      state.voiceHold = false;
      showVoiceModal({
        title: '无法启动音频引擎',
        body: '浏览器没有成功创建音频上下文。请重试，或者上传一段已经录好的音频。',
        uploadAvailable: true
      });
      return;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    } catch (error) {
      closeAudioContext(audioContext);
      state.voiceStarting = false;
      state.voiceHold = false;
      showVoiceModal(explainMicrophoneError(error));
      return;
    }

    if (!state.voiceHold || !state.wsOpen) {
      stopStream(stream);
      closeAudioContext(audioContext);
      state.voiceStarting = false;
      state.voiceHold = false;
      if (!state.wsOpen) {
        showToast('连接已断开，请重试');
      } else {
        showToast('麦克风已就绪，请按住语音键说话');
      }
      return;
    }

    const session = {
      id: createId(),
      stream,
      audioContext,
      sourceNode: null,
      captureNode: null,
      scriptNode: null,
      captureSink: null,
      analyser: null,
      sampleRate: audioContext.sampleRate || 48000,
      startedAt: Date.now(),
      durationMs: 0,
      stopping: false,
      stopRequested: false,
      cancelled: false,
      cancelledReason: '',
      finalized: false,
      captureCleaned: false,
      sendAudio: false,
      pendingPcm: [],
      bytes: 0,
      transcript: '',
      finalTranscript: '',
      interimTranscript: '',
      recognition: null,
      recognitionActive: false,
      speechBlocked: false,
      speechUnavailable: false,
      recognitionRestartTimer: null,
      waveFrame: null,
      waveTimer: null,
      durationTimer: null,
      maxTimer: null,
      stopTimer: null,
      flushResolver: null,
      flushTimer: null
    };

    try {
      await startPcmCapture(session);
    } catch {
      cleanupCapture(session);
      state.voiceStarting = false;
      state.voiceHold = false;
      showVoiceModal({
        title: '麦克风启动失败',
        body: '浏览器没有成功启动实时语音采集。请重试，或上传一段已经录好的音频。',
        uploadAvailable: true
      });
      return;
    }

    if (!state.voiceHold || !state.wsOpen) {
      cleanupCapture(session);
      state.voiceStarting = false;
      state.voiceHold = false;
      if (!state.wsOpen) showToast('连接已断开，请重试');
      else showToast('麦克风已就绪，请按住语音键说话');
      return;
    }

    state.voice = session;
    state.voiceStarting = false;

    const started = sendJson({
      type: 'voice-start',
      id: session.id,
      mimeType: 'audio/pcm',
      format: 'pcm16',
      sampleRate: session.sampleRate,
      channels: 1,
      source: 'microphone',
      startedAt: session.startedAt
    });
    if (!started) {
      state.voice = null;
      state.voiceHold = false;
      cleanupCapture(session);
      showToast('连接已断开，请重试');
      return;
    }

    session.sendAudio = true;
    flushPendingPcm(session);

    if (state.pcs === 0) {
      showToast('电脑端尚未连接，语音可能无法送达', 2400);
    }

    state.voiceButton?.classList.add('is-recording');
    dom.voiceOverlay.hidden = false;
    dom.voiceTimer.textContent = '00:00';
    dom.voiceLiveTranscript.textContent = '开始说话…';
    setRecognitionDisplay('', {
      source: 'phone',
      live: true,
      placeholder: '正在识别…'
    });
    startWaveAnimation(session);
    startDurationTimer(session);
    startSpeechRecognition(session);

    session.maxTimer = setTimeout(() => {
      if (state.voice === session) {
        showToast('已达到 60 秒上限，正在发送语音');
        state.voiceHold = false;
        requestStopVoice({ cancelled: false });
      }
    }, MAX_RECORDING_MS);

    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch {
        // Vibration is optional.
      }
    }
  }

  async function startPcmCapture(session) {
    const context = session.audioContext;
    if (context.state === 'suspended') {
      await context.resume().catch(() => {});
    }

    const source = context.createMediaStreamSource(session.stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);

    const sink = context.createGain();
    sink.gain.value = 0;
    sink.connect(context.destination);
    analyser.connect(sink);

    session.sourceNode = source;
    session.analyser = analyser;
    session.captureSink = sink;

    let workletReady = false;
    if (context.audioWorklet && typeof window.AudioWorkletNode === 'function') {
      try {
        await context.audioWorklet.addModule('/js/pcm-worklet.js');
        const node = new AudioWorkletNode(context, 'pcm16-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: 'explicit',
          processorOptions: { chunkSamples: PCM_CHUNK_SAMPLES }
        });
        node.port.addEventListener('message', (event) => {
          handleCaptureMessage(session, event.data);
        });
        node.port.start?.();
        source.connect(node);
        node.connect(sink);
        session.captureNode = node;
        workletReady = true;
      } catch {
        // Fall through to ScriptProcessorNode for older browsers.
      }
    }

    if (!workletReady) {
      const processor = context.createScriptProcessor(PCM_CHUNK_SAMPLES, 1, 1);
      processor.onaudioprocess = (event) => {
        if (session.finalized || session.cancelled) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let index = 0; index < input.length; index += 1) {
          let sample = input[index];
          if (sample > 1) sample = 1;
          else if (sample < -1) sample = -1;
          pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        handlePcmBuffer(session, pcm.buffer);
      };
      source.connect(processor);
      processor.connect(sink);
      session.scriptNode = processor;
    }

    session.sampleRate = context.sampleRate || session.sampleRate;
  }

  function handleCaptureMessage(session, data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'pcm' && data.buffer) {
      handlePcmBuffer(session, data.buffer);
    } else if (data.type === 'flushed') {
      resolveFlush(session);
    }
  }

  function handlePcmBuffer(session, buffer) {
    if (session.finalized || session.cancelled) return;
    if (!session.sendAudio) {
      if (session.pendingPcm.length < 80) session.pendingPcm.push(buffer);
      return;
    }
    sendPcmBuffer(session, buffer);
  }

  function flushPendingPcm(session) {
    if (!session.pendingPcm.length) return;
    const pending = session.pendingPcm;
    session.pendingPcm = [];
    for (const buffer of pending) sendPcmBuffer(session, buffer);
  }

  function sendPcmBuffer(session, buffer) {
    if (session.finalized || session.cancelled) return;
    if (!state.wsOpen || !state.ws || !buffer) return;
    try {
      state.ws.send(encodeVoiceFrame(session.id, buffer));
      session.bytes += buffer.byteLength;
    } catch {
      // The close handler will cancel the session.
    }
  }

  function flushAudioWorklet(session) {
    if (!session.captureNode) return Promise.resolve();
    if (session.flushResolver) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(session.flushTimer);
        session.flushTimer = null;
        session.flushResolver = null;
        resolve();
      };
      session.flushResolver = done;
      session.flushTimer = setTimeout(done, 180);
      try {
        session.captureNode.port.postMessage({ type: 'flush' });
      } catch {
        done();
      }
    });
  }

  function resolveFlush(session) {
    if (session.flushResolver) session.flushResolver();
  }

  function stopStream(stream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Best effort.
      }
    }
  }

  function closeAudioContext(context) {
    if (!context || context.state === 'closed') return;
    context.close().catch(() => {});
  }

  function cleanupCapture(session) {
    if (session.captureCleaned) return;
    session.captureCleaned = true;

    clearTimeout(session.stopTimer);
    clearInterval(session.durationTimer);
    clearTimeout(session.maxTimer);
    clearTimeout(session.recognitionRestartTimer);
    clearTimeout(session.flushTimer);
    cancelAnimationFrame(session.waveFrame);
    clearInterval(session.waveTimer);

    stopSpeechRecognition(session);
    try {
      session.recognition?.abort();
    } catch {
      // Recognition may already be stopped.
    }

    try {
      session.captureNode?.port.close();
    } catch {
      // The worklet may already be gone.
    }
    for (const node of [
      session.captureNode,
      session.scriptNode,
      session.sourceNode,
      session.analyser,
      session.captureSink
    ]) {
      try {
        node?.disconnect();
      } catch {
        // Nodes can already be disconnected.
      }
    }

    stopStream(session.stream);
    closeAudioContext(session.audioContext);

    if (session.flushResolver) {
      const resolve = session.flushResolver;
      session.flushResolver = null;
      resolve();
    }
  }

  function requestStopVoice({ cancelled = false, reason = '' } = {}) {
    const session = state.voice;
    if (!session || session.stopRequested) return;

    session.stopRequested = true;
    session.stopping = true;
    session.cancelled = session.cancelled || cancelled;
    if (reason) session.cancelledReason = reason;
    session.durationMs = Date.now() - session.startedAt;

    clearInterval(session.durationTimer);
    clearTimeout(session.maxTimer);
    clearTimeout(session.recognitionRestartTimer);
    stopSpeechRecognition(session);
    dom.voiceLiveTranscript.textContent = session.transcript
      ? session.transcript
      : '正在发送语音…';
    if (state.remoteRecognitionMode === 'phone') {
      setRecognitionDisplay(session.transcript, {
        source: 'phone',
        live: false,
        placeholder: '正在发送语音…'
      });
    } else {
      setRecognitionDisplay('', {
        source: state.remoteRecognitionMode === 'apple' ? 'apple' : 'mac',
        live: true,
        placeholder: '正在识别…'
      });
    }

    if (cancelled) {
      cleanupCapture(session);
      finalizeVoice(session);
      return;
    }

    session.stopTimer = setTimeout(async () => {
      await flushAudioWorklet(session);
      cleanupCapture(session);
      finalizeVoice(session);
    }, VOICE_TAIL_MS);
  }

  function finalizeVoice(session) {
    if (session.finalized) return;
    session.finalized = true;

    flushPendingPcm(session);
    cleanupCapture(session);

    const wsWasOpen = state.wsOpen && state.ws?.readyState === WebSocket.OPEN;
    if (!session.cancelled && wsWasOpen) {
      sendJson({
        type: 'voice-end',
        id: session.id,
        durationMs: session.durationMs,
        transcript: session.transcript.slice(0, MAX_TRANSCRIPT_LENGTH),
        source: 'microphone'
      });
      const info = getKeyInfo('voice');
      setLastEvent(`${info.label} · 语音已发送`, true, 1200);
      showToast(session.bytes > 0 ? '语音已发送到电脑' : '语音消息已发送');
    } else if (session.cancelled) {
      if (session.cancelledReason === 'too_large') {
        showToast('语音过长，未发送');
      } else if (session.cancelledReason !== 'disconnected') {
        showToast('录音已取消');
      }
    } else if (!wsWasOpen) {
      showToast('连接已断开，语音未发送');
    }

    if (state.voice === session) {
      state.voice = null;
    }
    state.voiceStarting = false;
    state.voiceHold = false;

    state.voiceButton?.classList.remove('is-recording', 'is-pressed');
    dom.voiceOverlay.hidden = true;

    if (state.remoteRecognitionMode === 'phone') {
      setRecognitionDisplay(session.transcript, {
        source: 'phone',
        live: false,
        placeholder: session.cancelled ? '录音已取消' : '未返回识别文字'
      });
    } else if (session.cancelled) {
      setRecognitionDisplay('', {
        source: state.remoteRecognitionMode === 'apple'
          ? 'apple'
          : state.remoteRecognitionMode === 'local' ? 'local' : 'mac',
        live: false,
        placeholder: '录音已取消'
      });
    }
  }

  function startDurationTimer(session) {
    clearInterval(session.durationTimer);
    session.durationTimer = setInterval(() => {
      if (state.voice !== session) return;
      const seconds = Math.floor((Date.now() - session.startedAt) / 1000);
      const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
      const remaining = String(seconds % 60).padStart(2, '0');
      dom.voiceTimer.textContent = `${minutes}:${remaining}`;
    }, 200);
  }

  function buildWaveBars() {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 24; index += 1) {
      const bar = document.createElement('span');
      const height = 14 + Math.random() * 20;
      bar.style.setProperty('--h', `${height}%`);
      fragment.appendChild(bar);
    }
    dom.voiceWave.appendChild(fragment);
    waveBars = [...dom.voiceWave.children];
  }

  function startWaveAnimation(session) {
    const setBars = (level) => {
      const now = performance.now();
      waveBars.forEach((bar, index) => {
        const wave = (Math.sin(index * 0.82 + now / 170) + 1) / 2;
        const jitter = Math.random() * 7;
        const height = 12 + level * 76 * wave + jitter;
        bar.style.setProperty('--h', `${Math.min(100, height)}%`);
      });
    };

    if (!session.analyser) {
      session.waveTimer = setInterval(() => {
        if (state.voice !== session) return;
        setBars(0.25 + Math.random() * 0.35);
      }, 120);
      return;
    }

    const data = new Uint8Array(session.analyser.fftSize);
    const tick = () => {
      if (state.voice !== session) return;
      session.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        const value = (data[index] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / data.length);
      setBars(Math.min(1, rms * 5.5));
      session.waveFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  function startSpeechRecognition(session) {
    // Some mobile browsers give SpeechRecognition exclusive access to the
    // microphone. When the Mac is doing the recognition, keep the mic free for
    // the PCM stream instead.
    if (state.remoteRecognitionMode !== 'phone') {
      session.speechUnavailable = true;
      setRecognitionDisplay('', {
        source: state.remoteRecognitionMode === 'apple' ? 'apple' : 'mac',
        live: true,
        placeholder: state.remoteRecognitionMode === 'apple'
          ? 'Mac 本机识别中…'
          : 'Mac 豆包识别中…'
      });
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      session.speechUnavailable = true;
      updateLiveTranscriptHint(session);
      return;
    }

    let recognition;
    try {
      recognition = new Recognition();
      recognition.lang = state.remoteRecognitionLanguage === 'en-US' ? 'en-US' : 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
    } catch {
      session.speechUnavailable = true;
      updateLiveTranscriptHint(session);
      return;
    }

    session.recognition = recognition;

    recognition.addEventListener('start', () => {
      session.recognitionActive = true;
    });

    recognition.addEventListener('result', (event) => {
      if (state.voice !== session) return;
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          session.finalTranscript += text;
        } else {
          interim += text;
        }
      }
      session.interimTranscript = interim;
      session.transcript = `${session.finalTranscript}${interim}`.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
      if (session.transcript) {
        dom.voiceLiveTranscript.textContent = session.transcript;
        setRecognitionDisplay(session.transcript, {
          source: 'phone',
          live: true
        });
        sendJson({
          type: 'voice-transcript',
          id: session.id,
          text: session.transcript,
          final: false
        });
      }
    });

    recognition.addEventListener('error', (event) => {
      if (!['no-speech', 'aborted'].includes(event.error)) {
        session.speechBlocked = true;
      }
      if (!session.transcript) updateLiveTranscriptHint(session);
    });

    recognition.addEventListener('end', () => {
      session.recognitionActive = false;
      if (state.voice !== session || session.stopping || session.speechBlocked) return;
      clearTimeout(session.recognitionRestartTimer);
      session.recognitionRestartTimer = setTimeout(() => {
        if (state.voice !== session || session.stopping) return;
        try {
          recognition.start();
        } catch {
          // If the recognizer cannot restart, audio recording continues.
        }
      }, 250);
    });

    try {
      recognition.start();
    } catch {
      session.speechUnavailable = true;
      updateLiveTranscriptHint(session);
    }
  }

  function stopSpeechRecognition(session) {
    if (!session.recognition) return;
    try {
      session.recognition.stop();
    } catch {
      // Already stopped.
    }
    session.recognitionActive = false;
  }

  function updateLiveTranscriptHint(session) {
    if (state.voice !== session || session.transcript) return;
    dom.voiceLiveTranscript.textContent = '录音中 · 松开后发送语音';
  }

  function setRecognitionDisplay(text, {
    source = 'phone',
    live = false,
    placeholder = RECOGNITION_PLACEHOLDER
  } = {}) {
    if (!dom.recognitionDisplay) return;
    const value = typeof text === 'string'
      ? text.trim().slice(0, MAX_TRANSCRIPT_LENGTH)
      : '';
    let sourceLabel = '等待语音';
    if (source === 'mac') {
      sourceLabel = 'Mac 豆包';
    } else if (source === 'apple') {
      sourceLabel = live ? 'Mac 识别中' : 'Mac 本机';
    } else if (source === 'local') {
      sourceLabel = live ? '本机识别中' : '本机 SenseVoice';
    } else if (source === 'keyboard') {
      sourceLabel = '手机键盘';
    } else if (source === 'phone') {
      sourceLabel = live ? '手机识别中' : '手机识别';
    }

    dom.recognitionDisplay.classList.toggle('is-live', Boolean(live));
    dom.recognitionSource.textContent = sourceLabel;
    dom.recognitionText.textContent = value || placeholder;
    dom.recognitionText.classList.toggle('is-placeholder', !value);
    if (live) {
      dom.recognitionText.scrollTop = dom.recognitionText.scrollHeight;
    }
  }

  function encodeVoiceFrame(id, arrayBuffer) {
    const idBytes = textEncoder.encode(id);
    const frame = new Uint8Array(2 + idBytes.length + arrayBuffer.byteLength);
    new DataView(frame.buffer).setUint16(0, idBytes.length);
    frame.set(idBytes, 2);
    frame.set(new Uint8Array(arrayBuffer), 2 + idBytes.length);
    return frame;
  }

  function createId() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function explainMicrophoneError(error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        title: '麦克风权限被拒绝',
        body: '请在浏览器的站点设置里允许麦克风访问，然后重新按住语音键。你也可以上传一段已经录好的音频。',
        uploadAvailable: true
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        title: '没有找到麦克风',
        body: '手机没有连接或开放可用的麦克风。请检查系统权限，或者上传一段已经录好的音频。',
        uploadAvailable: true
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        title: '麦克风被占用',
        body: '另一个应用正在使用麦克风。请关闭正在录音的应用后再试。',
        uploadAvailable: true
      };
    }
    return {
      title: '无法打开麦克风',
      body: '录音没有成功启动。请重试一次，或上传一段已经录好的音频。',
      uploadAvailable: true
    };
  }

  const MODAL_ICONS = {
    voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3"/>
      <path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.4V21"/>
      <path d="m3 3 18 18"/>
    </svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 10.8v5.4M12 7.6h.01"/>
    </svg>`
  };

  function showVoiceModal({ title, body, uploadAvailable, icon = 'voice' }) {
    modalUploadAvailable = Boolean(uploadAvailable) && state.wsOpen;
    dom.modalIcon.innerHTML = MODAL_ICONS[icon] || MODAL_ICONS.voice;
    dom.modalTitle.textContent = title;
    dom.modalBody.textContent = body;
    dom.uploadButton.hidden = !modalUploadAvailable;
    dom.modal.hidden = false;
    setTimeout(() => dom.modalClose.focus(), 30);
  }

  function showRemoteHelp() {
    const connectionLine = dom.connectionText.textContent;
    const httpsTip = window.isSecureContext
      ? ''
      : ' 当前页面是 HTTP，浏览器无法直接录音；请改用电脑端提供的 HTTPS 地址。';
    showVoiceModal({
      title: '遥控说明',
      body: `当前状态：${connectionLine}。按住麦克风键说话（竖屏时在遥控器左下角），松开后声音会发送到电脑。手机和电脑需要连接同一个 Wi-Fi。${httpsTip} 方向盘中央是确认键；具体电脑动作可在接收端的「按键设置」中配置。`,
      uploadAvailable: false,
      icon: 'info'
    });
  }

  function closeVoiceModal() {
    dom.modal.hidden = true;
    modalUploadAvailable = false;
  }

  async function handleFileSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!state.wsOpen) {
      showToast('尚未连接到服务，无法上传录音');
      return;
    }
    if (!file.size) {
      showToast('这个音频文件是空的');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('录音文件超过 14 MB，请选择更短的录音');
      return;
    }

    const id = createId();
    const mimeType = inferAudioMime(file);
    const startedAt = Date.now();

    const started = sendJson({
      type: 'voice-start',
      id,
      mimeType,
      source: 'file',
      fileName: file.name.slice(0, 160)
    });
    if (!started) {
      showToast('连接已断开，录音未发送');
      return;
    }

    showToast('正在发送录音…', 2600);

    try {
      const buffer = await file.arrayBuffer();
      if (!state.wsOpen || !state.ws) {
        showToast('连接已断开，录音未发送');
        return;
      }
      state.ws.send(encodeVoiceFrame(id, buffer));
      sendJson({
        type: 'voice-end',
        id,
        durationMs: Date.now() - startedAt,
        transcript: '',
        source: 'file'
      });
      const info = getKeyInfo('voice');
      setLastEvent(`${info.label} · 录音已发送`, true, 1400);
      showToast('录音已发送到电脑');
    } catch {
      sendJson({
        type: 'voice-end',
        id,
        durationMs: Date.now() - startedAt,
        transcript: '',
        source: 'file',
        cancelled: true
      });
      showToast('读取录音文件失败');
    }
  }

  function inferAudioMime(file) {
    if (file.type) return file.type;
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'mp3':
        return 'audio/mpeg';
      case 'm4a':
      case 'mp4':
        return 'audio/mp4';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
      case 'opus':
        return 'audio/ogg';
      case 'webm':
        return 'audio/webm';
      default:
        return 'audio/mp4';
    }
  }
  init();
})();
