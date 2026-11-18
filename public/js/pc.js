'use strict';

(() => {
  const KEY_ORDER = [
    'power',
    'voice',
    'up',
    'down',
    'left',
    'right',
    'ok',
    'back',
    'home',
    'menu',
    'delete',
    'volup',
    'voldown',
    'mute'
  ];

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

  function defaultActionForKey(id) {
    switch (id) {
      case 'up': return { type: 'keys', code: 'ArrowUp', modifiers: [] };
      case 'down': return { type: 'keys', code: 'ArrowDown', modifiers: [] };
      case 'left': return { type: 'keys', code: 'ArrowLeft', modifiers: [] };
      case 'right': return { type: 'keys', code: 'ArrowRight', modifiers: [] };
      case 'ok': return { type: 'keys', code: 'Enter', modifiers: [] };
      case 'back': return { type: 'keys', code: 'Escape', modifiers: [] };
      case 'delete': return { type: 'keys', code: 'Backspace', modifiers: [] };
      case 'volup': return { type: 'media', command: 'volumeUp' };
      case 'voldown': return { type: 'media', command: 'volumeDown' };
      case 'mute': return { type: 'media', command: 'mute' };
      default: return { type: 'none' };
    }
  }

  for (const [id, entry] of Object.entries(FALLBACK_KEYS)) {
    entry.action = defaultActionForKey(id);
    entry.doubleAction = null;
    entry.longAction = null;
  }

  const ACTION_OPTIONS = [
    { value: 'none', label: '不执行' },
    { value: 'keys:ArrowUp', label: '方向 ↑' },
    { value: 'keys:ArrowDown', label: '方向 ↓' },
    { value: 'keys:ArrowLeft', label: '方向 ←' },
    { value: 'keys:ArrowRight', label: '方向 →' },
    { value: 'keys:Enter', label: '回车 ⏎' },
    { value: 'keys:Escape', label: 'Esc' },
    { value: 'keys:Tab', label: 'Tab' },
    { value: 'keys:Space', label: '空格' },
    { value: 'keys:Backspace', label: '删除 ⌫' },
    { value: 'keys:PageUp', label: '上一页' },
    { value: 'keys:PageDown', label: '下一页' },
    { value: 'media:playPause', label: '播放 / 暂停' },
    { value: 'media:volumeUp', label: '音量 +' },
    { value: 'media:volumeDown', label: '音量 −' },
    { value: 'media:mute', label: '静音' },
    { value: 'focusInput', label: '聚焦输入框' },
    { value: 'custom', label: '自定义快捷键…' }
  ];

  const ACTION_PRESET_CODES = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape',
    'Tab', 'Space', 'Backspace', 'PageUp', 'PageDown'
  ]);
  const ACTION_CODES = new Set([
    ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
    ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
    ...ACTION_PRESET_CODES,
    'NumpadEnter', 'Delete', 'Home', 'End', 'Insert',
    ...Array.from({ length: 20 }, (_, index) => `F${index + 1}`),
    'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
    'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backquote'
  ]);
  const MODIFIER_ORDER = ['control', 'option', 'shift', 'cmd', 'fn'];

  // The remote is a free grid: the order array is the key sequence and the
  // columns value decides how many keys sit on each row.
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
  const DEFAULT_HIDDEN_KEYS = [
    'power',
    'home',
    'menu',
    'volup',
    'voldown',
    'mute'
  ];
  const MAX_CUSTOM_KEYS = 8;
  const CUSTOM_KEY_ID_PATTERN = /^custom_[A-Za-z0-9_-]{4,48}$/;
  const CUSTOM_KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-8 12h6l-1 8 9-13h-6z"/></svg>';

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

  const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l9.3-6.4c.6-.4.6-1.4 0-1.8L9.6 4.7C8.9 4.3 8 4.8 8 5.6z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>';

  const MAX_FEED_ITEMS = 45;
  const MAX_VOICE_ITEMS = 20;
  const MAX_TRANSCRIPT_LENGTH = 4000;
  const textDecoder = new TextDecoder();

  const state = {
    ws: null,
    wsOpen: false,
    ready: false,
    phones: 0,
    pcs: 0,
    presenceInitialized: false,
    reconnectAttempt: 0,
    reconnectTimer: null,
    closing: false,
    token: null,
    authFailed: false,
    authErrorText: '需在本机打开',
    config: null,
    draft: null,
    configLoaded: false,
    dirty: false,
    saving: false,
    connectInfo: null,
    connectEndpoint: null,
    keyCount: 0,
    lastKeyAt: 0,
    lastKey: null,
    voices: new Map(),
    voiceOrder: [],
    activeVoiceId: null,
    waveEnergy: 0.4,
    waveTimer: null,
    audio: null,
    playingId: null,
    autoplay: false,
    previousFocus: null,
    voiceTrigger: 'fn',
    system: null,
    systemPending: null,
    systemPendingTimer: null,
    systemAccessPollTimer: null,
    capturingActionKey: null,
    designerOpen: false,
    designerDraftLayout: null,
    designerDraftCustomKeys: [],
    designerDraftHiddenKeys: [],
    designerGestureActions: null,
    designerTab: 'layout',
    functionSelection: null,
    designerCapturingGesture: null,
    designerDirty: false,
    designerSaving: false,
    designerPreviousFocus: null,
    designerCapturingCustomId: null,
    previewReady: false
  };

  const dom = {
    desktopStatus: document.getElementById('desktopStatus'),
    desktopStatusText: document.getElementById('desktopStatusText'),
    liveClock: document.getElementById('liveClock'),
    signalKey: document.getElementById('signalKey'),
    signalBadge: document.getElementById('signalBadge'),
    signalMeaning: document.getElementById('signalMeaning'),
    signalActionText: document.getElementById('signalActionText'),
    signalSource: document.getElementById('signalSource'),
    signalCount: document.getElementById('signalCount'),
    voiceStatus: document.getElementById('voiceStatus'),
    voiceStatusText: document.getElementById('voiceStatusText'),
    voiceLive: document.getElementById('voiceLive'),
    liveLabel: document.getElementById('liveLabel'),
    liveBytes: document.getElementById('liveBytes'),
    liveTranscript: document.getElementById('liveTranscript'),
    waveBars: document.getElementById('waveBars'),
    voiceHistory: document.getElementById('voiceHistory'),
    voiceHistoryCount: document.getElementById('voiceHistoryCount'),
    autoplayToggle: document.getElementById('autoplayToggle'),
    feedList: document.getElementById('feedList'),
    clearFeedButton: document.getElementById('clearFeedButton'),
    systemPanel: document.getElementById('systemPanel'),
    systemBadge: document.getElementById('systemBadge'),
    systemDevice: document.getElementById('systemDevice'),
    systemDeviceSelect: document.getElementById('systemDeviceSelect'),
    systemInstall: document.getElementById('systemInstall'),
    systemInstallState: document.getElementById('systemInstallState'),
    copyCoreaudiodCommand: document.getElementById('copyCoreaudiodCommand'),
    copyDoubaoCommand: document.getElementById('copyDoubaoCommand'),
    copyBlackholeCommand: document.getElementById('copyBlackholeCommand'),
    redetectAudioButton: document.getElementById('redetectAudioButton'),
    systemAccessibility: document.getElementById('systemAccessibility'),
    systemTrigger: document.getElementById('systemTrigger'),
    systemTarget: document.getElementById('systemTarget'),
    systemSecureInput: document.getElementById('systemSecureInput'),
    systemNote: document.getElementById('systemNote'),
    systemEnableButton: document.getElementById('systemEnableButton'),
    systemEnableTitle: document.getElementById('systemEnableTitle'),
    systemEnableHint: document.getElementById('systemEnableHint'),
    systemError: document.getElementById('systemError'),
    requestAccessButton: document.getElementById('requestAccessButton'),
    refreshSystemButton: document.getElementById('refreshSystemButton'),
    openAccessibilityButton: document.getElementById('openAccessibilityButton'),
    voiceTriggerSelect: document.getElementById('voiceTriggerSelect'),
    connectPanel: document.getElementById('connectPanel'),
    connectStatus: document.getElementById('connectStatus'),
    connectNote: document.getElementById('connectNote'),
    connectUrl: document.getElementById('connectUrl'),
    connectAddressRow: document.getElementById('connectAddressRow'),
    connectAddressSelect: document.getElementById('connectAddressSelect'),
    refreshConnectInfoButton: document.getElementById('refreshConnectInfoButton'),
    securityBadge: document.getElementById('securityBadge'),
    qrImage: document.getElementById('qrImage'),
    qrLoading: document.getElementById('qrLoading'),
    copyUrlButton: document.getElementById('copyUrlButton'),
    toggleHttpButton: document.getElementById('toggleHttpButton'),
    httpRow: document.getElementById('httpRow'),
    httpUrl: document.getElementById('httpUrl'),
    copyHttpButton: document.getElementById('copyHttpButton'),
    serverMeta: document.getElementById('serverMeta'),
    openConnectButton: document.getElementById('openConnectButton'),
    openConfigButton: document.getElementById('openConfigButton'),
    openDesignerButton: document.getElementById('openDesignerButton'),
    designerOverlay: document.getElementById('designerOverlay'),
    designerBackdrop: document.getElementById('designerBackdrop'),
    closeDesignerButton: document.getElementById('closeDesignerButton'),
    cancelDesignerButton: document.getElementById('cancelDesignerButton'),
    saveDesignerButton: document.getElementById('saveDesignerButton'),
    resetLayoutButton: document.getElementById('resetLayoutButton'),
    designerStatus: document.getElementById('designerStatus'),
    layoutOrderList: document.getElementById('layoutOrderList'),
    layoutColumns: document.getElementById('layoutColumns'),
    miniKeyGrid: document.getElementById('miniKeyGrid'),
    addCustomKeyButton: document.getElementById('addCustomKeyButton'),
    customKeyEmpty: document.getElementById('customKeyEmpty'),
    customKeyList: document.getElementById('customKeyList'),
    defaultKeyVisibility: document.getElementById('defaultKeyVisibility'),
    designerSide: document.querySelector('.designer-side'),
    designerLayoutPane: document.getElementById('designerLayoutPane'),
    designerFunctionPane: document.getElementById('designerFunctionPane'),
    designerLayoutTab: document.getElementById('designerLayoutTab'),
    designerFunctionTab: document.getElementById('designerFunctionTab'),
    designerDescription: document.getElementById('designerDescription'),
    functionEditor: document.getElementById('functionEditor'),
    functionEditorTitle: document.getElementById('functionEditorTitle'),
    functionEditorClose: document.getElementById('functionEditorClose'),
    functionActionSelect: document.getElementById('functionActionSelect'),
    functionShortcutButton: document.getElementById('functionShortcutButton'),
    functionKeyList: document.getElementById('functionKeyList'),
    phonePreview: document.getElementById('phonePreview'),
    editKeySettingsButton: document.getElementById('editKeySettingsButton'),
    configDrawer: document.getElementById('configDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    closeConfigButton: document.getElementById('closeConfigButton'),
    configList: document.getElementById('configList'),
    openGestureEditorButton: document.getElementById('openGestureEditorButton'),
    configStatus: document.getElementById('configStatus'),
    revertConfigButton: document.getElementById('revertConfigButton'),
    saveConfigButton: document.getElementById('saveConfigButton'),
    pcToast: document.getElementById('pcToast')
  };

  let feedEmptyMarkup = '';
  let voiceEmptyMarkup = '';
  let waveBars = [];
  let toastTimer = null;
  let keyBadgeTimer = null;
  let remoteKeyTimer = null;
  let connectHighlightTimer = null;

  init();

  function init() {
    feedEmptyMarkup = dom.feedList.innerHTML;
    voiceEmptyMarkup = dom.voiceHistory.innerHTML;
    state.config = fallbackConfig();
    state.draft = clone(state.config);
    state.autoplay = readAutoplayPreference();
    updateAutoplayButton();
    buildWaveBars();
    bindUi();
    updateClock();
    setInterval(updateClock, 1000);
    dom.voiceTriggerSelect.value = state.voiceTrigger;
    updateConnectionUi();
    updateSignalBadgeIdle();
    updateSystemCard();
    syncConfigControls();
    setConfigStatus('clean', '未修改');
    if ('inert' in dom.configDrawer) dom.configDrawer.inert = true;

    bootstrapSession();
  }

  async function bootstrapSession() {
    try {
      const response = await fetch('/api/session', { cache: 'no-store' });
      if (!response.ok) throw new Error('not_loopback');
      const data = await response.json();
      if (!data || typeof data.token !== 'string' || !data.token) {
        throw new Error('missing_token');
      }
      state.token = data.token;
    } catch {
      state.authFailed = true;
      state.authErrorText = '需在本机打开';
      updateConnectionUi();
      dom.connectNote.textContent = '请在运行本服务的电脑上通过 localhost 打开此页面。';
      const label = dom.qrLoading.querySelector('span:last-child');
      if (label) label.textContent = '请在电脑本机打开';
      showToast('无法获取配对信息，请在本机的 localhost 页面打开', true);
      return;
    }

    loadConfigOnce();
    loadConnectInfo();
    connect();
  }

  // ---------------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------------

  function connect() {
    clearTimeout(state.reconnectTimer);
    if (
      state.ws &&
      (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    let ws;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    } catch {
      scheduleReconnect();
      return;
    }

    state.ws = ws;
    state.ready = false;
    ws.binaryType = 'arraybuffer';
    updateConnectionUi();

    ws.addEventListener('open', () => {
      if (state.ws !== ws) return;
      state.wsOpen = true;
      state.reconnectAttempt = 0;
      sendJson({
        type: 'hello',
        role: 'pc',
        name: '电脑接收端',
        token: state.token
      });
      updateConnectionUi();
    });

    ws.addEventListener('message', (event) => {
      if (state.ws !== ws) return;
      if (typeof event.data === 'string') {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        handleServerMessage(message);
      } else if (event.data instanceof ArrayBuffer) {
        handleVoiceFrame(event.data);
      }
    });

    ws.addEventListener('close', () => {
      if (state.ws !== ws) return;
      const wasReady = state.ready;
      state.wsOpen = false;
      state.ready = false;
      state.ws = null;

      if (state.activeVoiceId) {
        const entry = state.voices.get(state.activeVoiceId);
        if (entry) finishVoice(entry, { cancelled: true, reason: 'pc_disconnected' });
      }

      state.phones = 0;
      state.pcs = 0;
      state.systemPending = null;
      clearTimeout(state.systemPendingTimer);
      clearInterval(state.systemAccessPollTimer);
      state.systemAccessPollTimer = null;
      updateSystemCard();
      if (wasReady) {
        addFeed('system', '服务连接中断', '正在自动尝试重新连接');
      }
      updateConnectionUi();
      updateSignalBadgeIdle();
      if (!state.closing && !state.authFailed) scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      try {
        ws.close();
      } catch {
        // The close listener handles the retry.
      }
    });
  }

  function scheduleReconnect() {
    if (state.closing || state.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** state.reconnectAttempt, 8000);
    state.reconnectAttempt += 1;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay + Math.random() * 300);
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

  function handleServerMessage(message) {
    switch (message.type) {
      case 'ready':
        state.ready = true;
        if (message.config) applyServerConfig(message.config);
        applySystemStatus(message.system || {
          supported: false,
          available: false,
          enabled: false,
          error: '服务端未启用系统桥接'
        });
        applyPresence(message.presence, true);
        updateConnectionUi();
        break;

      case 'system-status':
        applySystemStatus(message);
        break;

      case 'system-event':
        handleSystemEvent(message);
        break;

      case 'presence':
        applyPresence(message, false);
        break;

      case 'key':
        handleKey(message);
        break;

      case 'voice-start':
        handleVoiceStart(message);
        break;

      case 'voice-transcript':
        handleVoiceTranscript(message);
        break;

      case 'voice-end':
        handleVoiceEnd(message);
        break;

      case 'config':
        if (message.config) applyServerConfig(message.config);
        break;

      case 'error':
        if (message.code === 'unauthorized') {
          state.authFailed = true;
          state.authErrorText = '配对已失效，请刷新';
          updateConnectionUi();
          showToast('配对已失效，请刷新电脑端页面', true);
        } else {
          showToast(message.message || '服务器返回了一个错误', true);
        }
        break;

      case 'welcome':
      case 'pong':
      case 'key-ack':
        break;

      default:
        break;
    }
  }

  function applyPresence(presence, initial) {
    if (!presence || typeof presence !== 'object') return;
    const nextPhones = Number(presence.phones) || 0;
    const nextPcs = Number(presence.pcs) || 0;
    const oldPhones = state.phones;
    const hadPresence = state.presenceInitialized;

    state.phones = nextPhones;
    state.pcs = nextPcs;
    state.presenceInitialized = true;

    if (!hadPresence && initial) {
      if (nextPhones > 0) {
        addFeed('system', '手机已连接', `${nextPhones} 台手机正在发送信号`);
      }
    } else if (hadPresence && nextPhones !== oldPhones) {
      if (nextPhones > 0) {
        addFeed('system', '手机已连接', `${nextPhones} 台手机在线`);
      } else {
        addFeed('system', '手机已断开', '等待设备重新连接');
      }
    }

    updateConnectionUi();
    updateSignalBadgeIdle();
  }

  function updateConnectionUi() {
    dom.desktopStatus.classList.remove('is-connecting', 'is-online', 'is-offline', 'is-waiting');

    if (state.authFailed) {
      dom.desktopStatus.classList.add('is-offline');
      dom.desktopStatusText.textContent = state.authErrorText;
    } else if (!state.wsOpen && state.ws?.readyState === WebSocket.CONNECTING) {
      dom.desktopStatus.classList.add('is-connecting');
      dom.desktopStatusText.textContent = '正在连接服务';
    } else if (!state.wsOpen) {
      dom.desktopStatus.classList.add('is-offline');
      dom.desktopStatusText.textContent = '服务连接中断';
    } else if (!state.ready) {
      dom.desktopStatus.classList.add('is-connecting');
      dom.desktopStatusText.textContent = '正在连接服务';
    } else if (state.phones > 0) {
      dom.desktopStatus.classList.add('is-online');
      dom.desktopStatusText.textContent =
        state.phones > 1 ? `手机已连接 · ${state.phones}` : '手机已连接';
    } else {
      dom.desktopStatus.classList.add('is-waiting');
      dom.desktopStatusText.textContent = '等待手机连接';
    }

    const foot = dom.connectStatus.closest('.connect-foot');
    if (foot) {
      foot.classList.toggle('is-online', state.phones > 0);
      if (state.phones > 0) {
        dom.connectStatus.textContent =
          state.phones > 1 ? `${state.phones} 台手机在线` : '手机在线';
      } else if (!state.wsOpen) {
        dom.connectStatus.textContent = '服务未连接';
      } else if (!state.ready) {
        dom.connectStatus.textContent = '正在连接服务';
      } else {
        dom.connectStatus.textContent = '等待手机扫码';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Key events
  // ---------------------------------------------------------------------------

  function handleKey(message) {
    const meta = getKeyMapping(message.key);
    const label = cleanDisplayText(message.label, 80) || meta.label;
    const meaning = cleanDisplayText(message.meaning, 240) || meta.meaning;
    const timestamp = Number(message.ts) || Date.now();

    state.keyCount += 1;
    state.lastKeyAt = Date.now();
    state.lastKey = { key: message.key, label, meaning };

    const gesture = ['single', 'double', 'long'].includes(message.gesture)
      ? message.gesture
      : 'single';
    const gestureLabel = gesture === 'double' ? '双击' : gesture === 'long' ? '长按' : '';

    setSignalLabel(label);
    dom.signalMeaning.textContent = gestureLabel
      ? `${meaning || '没有配置含义'} · ${gestureLabel}`
      : (meaning || '没有配置含义');
    dom.signalSource.textContent = `来自手机 · ${formatClock(timestamp)}`;
    dom.signalCount.textContent = `${state.keyCount} 次按键`;
    setSignalBadge('刚刚收到', true);

    clearTimeout(keyBadgeTimer);
    keyBadgeTimer = setTimeout(updateSignalBadgeIdle, 2600);

    const action = normalizeClientAction(
      message.action,
      meta.action || { type: 'none' }
    );
    dom.signalActionText.textContent = describeAction(action);
    dom.signalActionText.classList.toggle('is-none', action.type === 'none');

    highlightRemoteKey(message.key, 700);
    const detail = action.type === 'none'
      ? `${meaning || '无含义'}${gestureLabel ? ` · ${gestureLabel}` : ''} · 来自手机`
      : `${meaning || '无含义'}${gestureLabel ? ` · ${gestureLabel}` : ''} · 动作 ${describeAction(action)}`;
    addFeed('key', `${label}`, detail, timestamp);
  }

  function actionPresetValue(action) {
    if (!action || action.type === 'none') return 'none';
    if (action.type === 'focusInput') return 'focusInput';
    if (action.type === 'media') return `media:${action.command}`;
    if (action.type === 'keys') {
      if (
        (!action.modifiers || action.modifiers.length === 0)
        && ACTION_PRESET_CODES.has(action.code)
      ) {
        return `keys:${action.code}`;
      }
      return 'custom';
    }
    return 'none';
  }

  function describeAction(action) {
    if (!action || action.type === 'none') return '不执行';
    if (action.type === 'focusInput') return '聚焦输入框';
    if (action.type === 'media') {
      const labels = {
        playPause: '播放 / 暂停',
        volumeUp: '音量 +',
        volumeDown: '音量 −',
        mute: '静音',
        nextTrack: '下一首',
        previousTrack: '上一首'
      };
      return labels[action.command] || action.command;
    }
    if (action.type === 'keys') {
      return formatShortcut(action);
    }
    return '不执行';
  }

  function formatShortcut(action) {
    if (!action?.code) return '未录制';
    const modifierSymbols = {
      control: '⌃',
      option: '⌥',
      shift: '⇧',
      cmd: '⌘',
      fn: 'fn'
    };
    const codeLabels = {
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Enter: '⏎', NumpadEnter: '⌤', Escape: '⎋', Tab: '⇥', Space: '␠',
      Backspace: '⌫', Delete: '⌦', Home: '↖', End: '↘',
      PageUp: '⇞', PageDown: '⇟', Insert: '⎀',
      Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
      Period: '.', Slash: '/', Backquote: '`'
    };
    let keyLabel = codeLabels[action.code];
    if (!keyLabel && action.code.startsWith('Key')) keyLabel = action.code.slice(3);
    if (!keyLabel && action.code.startsWith('Digit')) keyLabel = action.code.slice(5);
    if (!keyLabel) keyLabel = action.code;
    const mods = (action.modifiers || [])
      .slice()
      .sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
      .map((modifier) => modifierSymbols[modifier] || '')
      .join('');
    return `${mods}${keyLabel}`;
  }

  function normalizeOptionalClientAction(value) {
    if (value === undefined || value === null) return null;
    return normalizeClientAction(value, { type: 'none' });
  }

  function normalizeClientAction(value, fallback) {
    if (!value || typeof value !== 'object' || typeof value.type !== 'string') {
      return clone(fallback || { type: 'none' });
    }
    if (value.type === 'none') return { type: 'none' };
    if (value.type === 'focusInput') return { type: 'focusInput' };
    if (value.type === 'media') {
      const commands = new Set([
        'volumeUp', 'volumeDown', 'mute', 'playPause', 'nextTrack', 'previousTrack'
      ]);
      return commands.has(value.command)
        ? { type: 'media', command: value.command }
        : clone(fallback || { type: 'none' });
    }
    if (value.type === 'keys') {
      if (typeof value.code !== 'string' || !ACTION_CODES.has(value.code)) {
        return clone(fallback || { type: 'none' });
      }
      const modifiers = Array.isArray(value.modifiers)
        ? MODIFIER_ORDER.filter((modifier) => value.modifiers.includes(modifier))
        : [];
      return { type: 'keys', code: value.code, modifiers };
    }
    return clone(fallback || { type: 'none' });
  }

  function applySystemStatus(status) {
    if (!status || typeof status !== 'object') return;
    const wasEnabled = Boolean(state.system?.enabled);
    state.system = { ...status };
    state.systemPending = null;
    clearTimeout(state.systemPendingTimer);
    if (status.accessibility) {
      clearInterval(state.systemAccessPollTimer);
      state.systemAccessPollTimer = null;
    }
    updateSystemCard();
    if (!wasEnabled && state.system.enabled) {
      addFeed('system', '系统桥接已启用', '按键动作与语音系统麦克风已开启');
    } else if (wasEnabled && !state.system.enabled) {
      addFeed('system', '系统桥接已关闭', '语音仅在接收端回放，按键仅展示');
    }
  }

  const VIRTUAL_AUDIO_PATTERN = /MiRemoteV|SayAll|BlackHole|Loopback|Soundflower|VB[- ]?Cable|Virtual|虚拟/i;

  function getVirtualAudioDevices(status) {
    const devices = Array.isArray(status?.devices) ? status.devices : [];
    const result = devices.filter((device) => {
      if (!device || typeof device.name !== 'string') return false;
      return VIRTUAL_AUDIO_PATTERN.test(device.name)
        || VIRTUAL_AUDIO_PATTERN.test(device.uid || '');
    });
    if (
      status?.device
      && !result.some((device) => (
        (device.uid && device.uid === status.deviceUID) || device.name === status.device
      ))
    ) {
      result.unshift({
        id: null,
        name: status.device,
        uid: status.deviceUID || status.device,
        outputChannels: status.outputChannels || 0
      });
    }
    return result;
  }

  function updateSystemCard() {
    const status = state.system;
    if (!status) {
      dom.systemBadge.textContent = '未连接';
      dom.systemDevice.hidden = false;
      dom.systemDevice.textContent = '正在检测…';
      dom.systemDeviceSelect.hidden = true;
      dom.systemAccessibility.textContent = '未检测';
      dom.systemTarget.textContent = '未检测';
      dom.systemSecureInput.textContent = '未检测';
      dom.systemInstallState.textContent = '正在检测虚拟声卡…';
      dom.systemEnableButton.disabled = true;
      return;
    }

    const serviceConnected = state.wsOpen && state.ready;
    const preparing = Boolean(status.preparing);
    const available = Boolean(status.available) && serviceConnected;
    const enabled = Boolean(status.enabled) && serviceConnected;
    const pending = state.systemPending !== null;

    dom.systemBadge.className = 'security-badge system-badge';
    let badge = '未就绪';
    if (!serviceConnected) badge = '服务断开';
    else if (preparing) badge = '准备中';
    else if (enabled) badge = '已启用';
    else if (available) badge = '就绪';
    if (enabled) dom.systemBadge.classList.add('is-live');
    else if (!available && !preparing) dom.systemBadge.classList.add('is-http');
    dom.systemBadge.textContent = badge;

    const virtualDevices = getVirtualAudioDevices(status);
    const hasVirtualDevices = virtualDevices.length > 0;
    dom.systemDevice.hidden = hasVirtualDevices;
    dom.systemDeviceSelect.hidden = !hasVirtualDevices;
    dom.systemDevice.textContent = '未检测到虚拟麦克风';
    dom.systemDevice.classList.toggle('is-missing', true);

    if (hasVirtualDevices) {
      const signature = virtualDevices
        .map((device) => `${device.uid || device.name}\u0000${device.name}`)
        .join('|');
      if (dom.systemDeviceSelect.dataset.signature !== signature) {
        const fragment = document.createDocumentFragment();
        for (const device of virtualDevices) {
          const option = document.createElement('option');
          option.value = device.uid || device.name;
          option.textContent = device.name;
          fragment.appendChild(option);
        }
        dom.systemDeviceSelect.replaceChildren(fragment);
        dom.systemDeviceSelect.dataset.signature = signature;
      }
      const selectedValue = status.deviceUID
        || virtualDevices.find((device) => device.name === status.device)?.uid
        || status.device
        || '';
      if (selectedValue && dom.systemDeviceSelect.value !== selectedValue) {
        dom.systemDeviceSelect.value = selectedValue;
      }
      dom.systemDeviceSelect.disabled = !serviceConnected || !status.helperReady;
    }

    dom.systemInstallState.textContent = !status.helperReady
      ? '正在检测虚拟声卡…'
      : hasVirtualDevices
        ? `当前已检测到：${status.device || virtualDevices[0]?.name || '虚拟声卡'}`
        : '当前未检测到虚拟声卡';

    if (!hasVirtualDevices) {
      if (dom.systemInstall.dataset.wasMissing !== '1') {
        dom.systemInstall.open = true;
      }
      dom.systemInstall.dataset.wasMissing = '1';
    } else if (dom.systemInstall.dataset.wasMissing === '1') {
      dom.systemInstall.open = false;
      delete dom.systemInstall.dataset.wasMissing;
    }

    dom.systemAccessibility.textContent = status.accessibility ? '已授权' : '未授权';
    dom.systemAccessibility.classList.toggle('is-ok', Boolean(status.accessibility));
    dom.requestAccessButton.hidden = Boolean(status.accessibility) || !available;
    dom.requestAccessButton.disabled = !available || !status.helperReady;

    const triggerLabels = {
      fn: 'Fn / 地球键',
      rightOption: '右 Option',
      rightCommand: '右 Command',
      none: '不触发'
    };
    dom.systemTrigger.textContent = triggerLabels[status.voiceTrigger] || 'Fn / 地球键';

    dom.systemTarget.textContent = status.frontmostApp || '未检测';
    dom.systemSecureInput.textContent = status.secureInput ? '已开启（会拦截按键）' : '正常';
    dom.systemSecureInput.classList.toggle('is-missing', Boolean(status.secureInput));

    dom.systemEnableButton.disabled = !available || pending || !serviceConnected;
    dom.systemEnableButton.classList.toggle('is-on', enabled);
    dom.systemEnableButton.setAttribute('aria-pressed', String(enabled));
    dom.systemEnableButton.title = available
      ? (enabled ? '点击关闭系统桥接' : '点击启用系统桥接')
      : (status.error || '系统桥接不可用');

    if (pending) {
      dom.systemEnableTitle.textContent = state.systemPending ? '正在启用…' : '正在关闭…';
      dom.systemEnableHint.textContent = '请稍候';
    } else if (enabled) {
      dom.systemEnableTitle.textContent = '系统控制已启用';
      dom.systemEnableHint.textContent = '点击关闭；关闭后不会执行按键动作';
    } else if (preparing) {
      dom.systemEnableTitle.textContent = '正在准备本机桥接';
      dom.systemEnableHint.textContent = '首次启动可能需要编译本机组件';
    } else if (!available) {
      dom.systemEnableTitle.textContent = '系统桥接不可用';
      dom.systemEnableHint.textContent = status.error || '请检查虚拟麦克风与权限';
    } else {
      dom.systemEnableTitle.textContent = '启用系统控制与麦克风';
      dom.systemEnableHint.textContent = status.accessibility
        ? '语音进入虚拟麦克风，按键执行真实动作'
        : '未授权辅助功能时，仅语音麦克风可用';
    }

    if (enabled) {
      dom.systemNote.textContent = status.device
        ? `已启用。请在语音工具中选择「${status.device}」作为麦克风；按键会发送到 Mac 当前最前面的应用，请先点一下目标输入框。`
        : '已启用：语音会进入虚拟麦克风；按键会发送到 Mac 当前最前面的应用，请先点一下目标输入框。';
    } else if (status.accessibility) {
      dom.systemNote.textContent = '开启后，手机按键会执行真实快捷键，语音会进入虚拟麦克风。';
    } else {
      dom.systemNote.textContent = '语音输出可用；若要让按键执行真实动作或触发语音工具，请授权辅助功能。';
    }

    dom.systemError.hidden = !status.error;
    dom.systemError.textContent = status.error || '';
  }

  function toggleSystemBridge() {
    if (!state.system || state.systemPending !== null) return;
    if (!state.wsOpen || !state.ready) {
      showToast('服务尚未连接', true);
      return;
    }
    const target = !state.system.enabled;
    if (target && !state.system.available) {
      showToast(state.system.error || '本机系统桥接尚未就绪', true);
      return;
    }
    state.systemPending = target;
    updateSystemCard();
    if (!sendJson({ type: 'system-enable', enabled: target })) {
      state.systemPending = null;
      updateSystemCard();
      showToast('发送系统桥接请求失败', true);
      return;
    }
    clearTimeout(state.systemPendingTimer);
    state.systemPendingTimer = setTimeout(() => {
      if (state.systemPending === null) return;
      state.systemPending = null;
      updateSystemCard();
      showToast('系统桥接响应超时，请重新检测', true);
    }, 5000);
  }

  function handleSystemEvent(event) {
    if (!event) return;
    if (!event.ok) {
      addFeed('system', '系统动作执行失败', event.message || event.action);
      showToast(event.message || '系统动作执行失败', true);
    }
  }

  function setSignalLabel(label) {
    dom.signalKey.textContent = label;
    dom.signalKey.classList.remove('is-medium', 'is-long', 'is-fresh');
    const length = Array.from(label).length;
    if (length > 8) {
      dom.signalKey.classList.add('is-long');
    } else if (length > 4) {
      dom.signalKey.classList.add('is-medium');
    }
    void dom.signalKey.offsetWidth;
    dom.signalKey.classList.add('is-fresh');
  }

  function setSignalBadge(text, live) {
    dom.signalBadge.replaceChildren();
    const dot = document.createElement('span');
    dom.signalBadge.append(dot, document.createTextNode(text));
    dom.signalBadge.classList.toggle('is-live', Boolean(live));
  }

  function updateSignalBadgeIdle() {
    if (Date.now() - state.lastKeyAt < 2500) return;
    let text = '等待手机';
    if (!state.wsOpen) text = '服务离线';
    else if (!state.ready) text = '连接中';
    else if (state.phones > 0) text = '手机在线';
    setSignalBadge(text, false);
  }

  function highlightRemoteKey(key, duration = 700) {
    document.querySelectorAll('[data-rkey]').forEach((element) => {
      element.classList.toggle('is-active', element.dataset.rkey === key);
    });
    clearTimeout(remoteKeyTimer);
    remoteKeyTimer = setTimeout(() => {
      document.querySelectorAll('[data-rkey].is-active').forEach((element) => {
        element.classList.remove('is-active');
      });
    }, duration);
  }

  function getKeyMapping(key) {
    const configured = state.config?.keys?.[key]
      || state.config?.customKeys?.find((entry) => entry.id === key);
    const fallback = FALLBACK_KEYS[key];
    return {
      label: configured?.label || fallback?.label || key,
      meaning: configured?.meaning || fallback?.meaning || '',
      action: normalizeClientAction(
        configured?.action,
        fallback?.action || { type: 'none' }
      )
    };
  }

  // ---------------------------------------------------------------------------
  // Voice
  // ---------------------------------------------------------------------------

  function handleVoiceStart(message) {
    if (!isValidVoiceId(message.id)) return;
    if (state.voices.has(message.id) && !state.voices.get(message.id).ended) return;

    if (state.activeVoiceId && state.activeVoiceId !== message.id) {
      const previous = state.voices.get(state.activeVoiceId);
      if (previous) {
        finishVoice(previous, { cancelled: true, reason: 'replaced' });
      }
    }

    const entry = {
      id: message.id,
      mimeType: typeof message.mimeType === 'string' ? message.mimeType : 'audio/webm',
      format: message.format === 'pcm16' ? 'pcm16' : 'compressed',
      sampleRate: Number.isFinite(Number(message.sampleRate))
        ? Math.max(8000, Math.min(96000, Number(message.sampleRate)))
        : 48000,
      channels: Number.isFinite(Number(message.channels))
        ? Math.max(1, Math.min(2, Number(message.channels)))
        : 1,
      startedAt: Number(message.startedAt) || Date.now(),
      source: message.source === 'file' ? 'file' : 'microphone',
      fileName: cleanDisplayText(message.fileName, 160),
      chunks: [],
      bytes: 0,
      transcript: '',
      durationMs: null,
      cancelled: false,
      ended: false,
      blobUrl: null,
      published: false
    };

    state.voices.set(entry.id, entry);
    state.activeVoiceId = entry.id;

    dom.voiceStatus.classList.remove('is-live', 'is-received');
    dom.voiceStatus.classList.add('is-live');
    dom.voiceStatusText.textContent = entry.source === 'file' ? '接收录音' : '正在接收';
    dom.voiceLive.classList.add('is-live');
    dom.liveLabel.textContent = entry.source === 'file' ? '文件接收' : '实时转写';
    dom.liveBytes.textContent = '0 B';
    setLiveText(
      entry.source === 'file'
        ? `正在接收录音文件${entry.fileName ? ` · ${entry.fileName}` : ''}…`
        : '正在接收手机语音…',
      true
    );

    startLiveWave();
    highlightRemoteKey('voice', 1400);
  }

  function handleVoiceTranscript(message) {
    if (!isValidVoiceId(message.id)) return;
    const entry = state.voices.get(message.id);
    if (!entry) return;

    const text = cleanDisplayText(message.text, MAX_TRANSCRIPT_LENGTH, false);
    if (!text) return;
    entry.transcript = text;

    if (state.activeVoiceId === entry.id) {
      dom.liveLabel.textContent = '实时转写';
      dom.liveBytes.textContent = entry.bytes > 0 ? formatBytes(entry.bytes) : '转写中';
      setLiveText(entry.transcript, false);
      state.waveEnergy = Math.max(state.waveEnergy, 0.55);
    }

    if (entry.published) updatePublishedVoiceText(entry);
  }

  function handleVoiceEnd(message) {
    if (!isValidVoiceId(message.id)) return;
    let entry = state.voices.get(message.id);

    if (!entry) {
      const transcript = cleanDisplayText(message.transcript, MAX_TRANSCRIPT_LENGTH, false);
      if (!transcript) return;
      entry = {
        id: message.id,
        mimeType: 'audio/webm',
        format: message.format === 'pcm16' ? 'pcm16' : 'compressed',
        sampleRate: Number.isFinite(Number(message.sampleRate))
          ? Math.max(8000, Math.min(96000, Number(message.sampleRate)))
          : 48000,
        channels: Number.isFinite(Number(message.channels))
          ? Math.max(1, Math.min(2, Number(message.channels)))
          : 1,
        startedAt: Number(message.startedAt) || Date.now(),
        source: message.source === 'file' ? 'file' : 'microphone',
        fileName: cleanDisplayText(message.fileName, 160),
        chunks: [],
        bytes: 0,
        transcript,
        durationMs: null,
        cancelled: false,
        ended: false,
        blobUrl: null,
        published: false
      };
      state.voices.set(entry.id, entry);
    }

    if (entry.ended) return;
    const transcript = cleanDisplayText(message.transcript, MAX_TRANSCRIPT_LENGTH, false);
    if (transcript) entry.transcript = transcript;
    entry.durationMs = Number.isFinite(Number(message.durationMs))
      ? Math.max(0, Number(message.durationMs))
      : null;
    if (entry.source === 'file') entry.durationMs = null;

    finishVoice(entry, {
      cancelled: Boolean(message.cancelled),
      reason: message.reason || null
    });
  }

  function finishVoice(entry, { cancelled = false, reason = null } = {}) {
    if (!entry || entry.ended) return;
    entry.ended = true;
    entry.cancelled = cancelled;
    entry.cancelReason = reason;

    if (entry.chunks.length > 0) {
      try {
        const blob = entry.format === 'pcm16'
          ? buildWavBlob(entry.chunks, entry.sampleRate, entry.channels)
          : new Blob(entry.chunks, { type: entry.mimeType || 'audio/webm' });
        entry.blobUrl = URL.createObjectURL(blob);
      } catch {
        entry.blobUrl = null;
      }
      entry.chunks.length = 0;
    }

    const isActive = state.activeVoiceId === entry.id;
    const hasContent = entry.bytes > 0 || Boolean(entry.transcript);

    if (isActive) {
      state.activeVoiceId = null;
      stopLiveWave();
      dom.voiceLive.classList.remove('is-live');
      dom.voiceStatus.classList.remove('is-live', 'is-received');
      if (!cancelled) dom.voiceStatus.classList.add('is-received');
      dom.voiceStatusText.textContent = cancelled ? '接收中断' : '已接收';
      dom.liveLabel.textContent = cancelled ? '接收中断' : '最近一条';
      dom.liveBytes.textContent = entry.bytes > 0 ? formatBytes(entry.bytes) : '';

      if (entry.transcript) {
        setLiveText(entry.transcript, false);
      } else if (entry.blobUrl) {
        setLiveText(
          cancelled ? '语音接收中断，可播放已收到的部分。' : '原声已接收，可在下方播放。',
          true
        );
      } else {
        setLiveText(cancelled ? '语音接收中断，没有收到内容。' : '没有收到语音内容。', true);
      }
    }

    if (hasContent) {
      publishVoice(entry);
      const duration = entry.source === 'microphone' ? formatDuration(entry.durationMs) : '';
      const summary = entry.transcript
        ? truncate(entry.transcript, 90)
        : entry.source === 'file'
          ? entry.fileName || '录音文件已接收'
          : '原声已保存';
      addFeed(
        'voice',
        cancelled ? '语音接收中断' : '语音消息已接收',
        [duration, summary].filter(Boolean).join(' · ')
      );

      if (state.autoplay && entry.blobUrl && !cancelled) {
        setTimeout(() => playVoice(entry.id), 140);
      }
    }
  }

  function publishVoice(entry) {
    if (!entry.published) {
      entry.published = true;
      state.voiceOrder = [entry.id, ...state.voiceOrder.filter((id) => id !== entry.id)];
      trimVoiceHistory();
    }
    renderVoiceHistory();
  }

  function trimVoiceHistory() {
    while (state.voiceOrder.length > MAX_VOICE_ITEMS) {
      const removeId = state.voiceOrder.pop();
      const oldEntry = state.voices.get(removeId);
      if (!oldEntry) continue;
      if (state.playingId === removeId && state.audio) {
        state.audio.pause();
        state.playingId = null;
      }
      if (oldEntry.blobUrl) URL.revokeObjectURL(oldEntry.blobUrl);
      state.voices.delete(removeId);
    }
  }

  function handleVoiceFrame(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 3) return;
    const view = new DataView(arrayBuffer);
    const idLength = view.getUint16(0);
    if (idLength < 1 || idLength > 64 || arrayBuffer.byteLength <= 2 + idLength) return;

    let id;
    try {
      id = textDecoder.decode(new Uint8Array(arrayBuffer, 2, idLength));
    } catch {
      return;
    }
    const entry = state.voices.get(id);
    if (!entry || entry.ended) return;

    const chunk = new Uint8Array(arrayBuffer, 2 + idLength).slice();
    entry.chunks.push(chunk);
    entry.bytes += chunk.byteLength;

    if (state.activeVoiceId === id) {
      dom.liveBytes.textContent = formatBytes(entry.bytes);
      state.waveEnergy = Math.min(1, Math.max(0.6, state.waveEnergy + 0.32));
    }
  }

  function setLiveText(text, placeholder) {
    dom.liveTranscript.textContent = text;
    dom.liveTranscript.classList.toggle('is-placeholder', Boolean(placeholder));
    dom.liveTranscript.scrollTop = 0;
  }

  function buildWaveBars() {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 30; index += 1) {
      const bar = document.createElement('span');
      bar.style.setProperty('--h', `${20 + Math.random() * 30}%`);
      fragment.appendChild(bar);
    }
    dom.waveBars.replaceChildren(fragment);
    waveBars = [...dom.waveBars.children];
    setIdleWave();
  }

  function setIdleWave() {
    waveBars.forEach((bar, index) => {
      const height = 16 + (Math.sin(index * 0.58) + 1) * 7;
      bar.style.setProperty('--h', `${height}%`);
    });
  }

  function startLiveWave() {
    clearInterval(state.waveTimer);
    state.waveEnergy = 0.42;
    dom.voiceLive.classList.add('is-live');
    state.waveTimer = setInterval(() => {
      state.waveEnergy = Math.max(0.28, state.waveEnergy * 0.83);
      paintLiveWave();
    }, 105);
    paintLiveWave();
  }

  function paintLiveWave() {
    const now = performance.now();
    waveBars.forEach((bar, index) => {
      const wave = (Math.sin(index * 0.66 + now / 165) + 1) / 2;
      const height = 10 + state.waveEnergy * 78 * wave + Math.random() * 8;
      bar.style.setProperty('--h', `${Math.min(100, height)}%`);
    });
  }

  function stopLiveWave() {
    clearInterval(state.waveTimer);
    state.waveTimer = null;
    dom.voiceLive.classList.remove('is-live');
    setIdleWave();
  }

  function renderVoiceHistory() {
    if (state.voiceOrder.length === 0) {
      dom.voiceHistory.innerHTML = voiceEmptyMarkup;
      dom.voiceHistoryCount.textContent = '0 条';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const id of state.voiceOrder) {
      const entry = state.voices.get(id);
      if (!entry) continue;
      fragment.appendChild(createVoiceItem(entry));
    }
    dom.voiceHistory.replaceChildren(fragment);
    dom.voiceHistoryCount.textContent = `${state.voiceOrder.length} 条`;
    dom.voiceHistory.scrollTop = 0;
    updatePlaybackUi();
  }

  function createVoiceItem(entry) {
    const item = document.createElement('article');
    item.className = 'voice-item';
    item.dataset.voiceId = entry.id;
    if (state.playingId === entry.id) item.classList.add('is-playing');

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'play-button';
    playButton.dataset.playId = entry.id;
    playButton.disabled = !entry.blobUrl;
    const isPlaying = state.playingId === entry.id;
    playButton.innerHTML = isPlaying ? PAUSE_ICON : PLAY_ICON;
    playButton.setAttribute('aria-label', isPlaying ? '暂停播放语音' : '播放语音');

    const main = document.createElement('div');
    main.className = 'voice-item-main';

    const text = document.createElement('div');
    text.className = 'voice-item-text';
    let displayText = entry.transcript;
    if (!displayText) {
      displayText = entry.source === 'file'
        ? '录音文件 · 未获得文字转写'
        : '语音原声 · 未获得文字转写';
      text.classList.add('is-empty');
    }
    text.textContent = displayText;
    text.title = entry.transcript || entry.fileName || displayText;

    const meta = document.createElement('div');
    meta.className = 'voice-item-meta';

    const primaryMeta = entry.source === 'file'
      ? truncate(entry.fileName || '录音文件', 26)
      : (entry.durationMs !== null ? formatDuration(entry.durationMs) : '语音');
    appendMetaPart(meta, primaryMeta);

    if (entry.bytes > 0) {
      appendMetaSeparator(meta);
      appendMetaPart(meta, formatBytes(entry.bytes));
    }
    if (entry.cancelled) {
      appendMetaSeparator(meta);
      appendMetaPart(meta, '接收中断');
    }

    main.append(text, meta);

    const time = document.createElement('time');
    time.className = 'voice-item-time';
    time.dateTime = new Date(entry.startedAt).toISOString();
    time.textContent = formatShortTime(entry.startedAt);

    item.append(playButton, main, time);
    return item;
  }

  function appendMetaPart(parent, text) {
    const span = document.createElement('span');
    span.textContent = text;
    parent.appendChild(span);
  }

  function appendMetaSeparator(parent) {
    parent.appendChild(document.createElement('i'));
  }

  function updatePublishedVoiceText(entry) {
    const item = dom.voiceHistory.querySelector(
      `.voice-item[data-voice-id="${entry.id}"]`
    );
    if (!item) return;
    const text = item.querySelector('.voice-item-text');
    if (!text) return;
    text.textContent = entry.transcript || '语音原声 · 未获得文字转写';
    text.classList.toggle('is-empty', !entry.transcript);
    text.title = entry.transcript || '语音原声';
  }

  function ensureAudio() {
    if (state.audio) return state.audio;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.addEventListener('ended', () => {
      state.playingId = null;
      updatePlaybackUi();
    });
    audio.addEventListener('error', () => {
      if (!state.playingId) return;
      state.playingId = null;
      updatePlaybackUi();
      showToast('这段语音无法播放', true);
    });
    state.audio = audio;
    return audio;
  }

  function playVoice(id) {
    const entry = state.voices.get(id);
    if (!entry || !entry.blobUrl) {
      showToast('这段语音没有可播放的原声');
      return;
    }

    const audio = ensureAudio();
    if (state.playingId === id) {
      audio.pause();
      state.playingId = null;
      updatePlaybackUi();
      return;
    }

    audio.pause();
    audio.src = entry.blobUrl;
    audio.currentTime = 0;
    state.playingId = id;
    updatePlaybackUi();

    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        if (state.playingId === id) {
          state.playingId = null;
          updatePlaybackUi();
        }
        showToast('浏览器阻止了播放，请再点击一次播放按钮', true);
      });
    }
  }

  function updatePlaybackUi() {
    dom.voiceHistory.querySelectorAll('.voice-item').forEach((item) => {
      const id = item.dataset.voiceId;
      const playing = state.playingId === id;
      item.classList.toggle('is-playing', playing);
      const button = item.querySelector('.play-button');
      if (!button) return;
      button.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
      button.setAttribute('aria-label', playing ? '暂停播放语音' : '播放语音');
    });
  }

  function handleVoiceHistoryClick(event) {
    const button = event.target.closest('.play-button');
    if (!button || button.disabled) return;
    playVoice(button.dataset.playId);
  }

  // ---------------------------------------------------------------------------
  // Feed
  // ---------------------------------------------------------------------------

  function addFeed(kind, title, detail, timestamp = Date.now()) {
    const empty = dom.feedList.querySelector('.empty-block');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = `feed-item feed-item--${kind}`;

    const dot = document.createElement('span');
    dot.className = 'feed-dot';

    const main = document.createElement('div');
    main.className = 'feed-main';

    const top = document.createElement('div');
    top.className = 'feed-top';

    const titleElement = document.createElement('span');
    titleElement.className = 'feed-title';
    titleElement.textContent = title;

    const time = document.createElement('span');
    time.className = 'feed-time';
    time.textContent = formatClock(timestamp);

    top.append(titleElement, time);

    const detailElement = document.createElement('div');
    detailElement.className = 'feed-detail';
    detailElement.textContent = detail;

    main.append(top, detailElement);
    item.append(dot, main);

    dom.feedList.prepend(item);
    while (dom.feedList.children.length > MAX_FEED_ITEMS) {
      dom.feedList.lastElementChild.remove();
    }
  }

  function clearFeed() {
    dom.feedList.innerHTML = feedEmptyMarkup;
    showToast('事件流已清空');
  }

  // ---------------------------------------------------------------------------
  // Config drawer
  // ---------------------------------------------------------------------------

  async function loadConfigOnce() {
    try {
      const response = await fetch('/api/config', {
        cache: 'no-store',
        headers: { 'X-Bridge-Token': state.token }
      });
      if (!response.ok) throw new Error('读取配置失败');
      const config = await response.json();
      if (!state.configLoaded) applyServerConfig(config);
    } catch {
      // The websocket's ready message also carries config. Keep the local defaults.
    }
  }

  function applyServerConfig(config) {
    if (!config || typeof config !== 'object' || !config.keys) return;
    const normalized = normalizeClientConfig(config);
    const changed = !sameKeyMappings(state.config, normalized);
    state.config = normalized;
    state.configLoaded = true;
    state.voiceTrigger = normalized.voiceTrigger;
    applyMiniLayout(normalized.layout, normalized.customKeys);
    applyMiniHiddenKeys(normalized.hiddenKeys);

    if (!state.dirty && !state.saving) {
      state.draft = clone(normalized);
      dom.voiceTriggerSelect.value = normalized.voiceTrigger;
      syncConfigControls();
      if (isDrawerOpen() && changed) {
        renderConfigRows();
        setConfigStatus('clean', '未修改');
      }
    }
  }

  function actionsEqual(a, b) {
    const left = a || { type: 'none' };
    const right = b || { type: 'none' };
    if (left.type !== right.type) return false;
    if (left.type === 'keys') {
      return (left.code || '') === (right.code || '')
        && (left.modifiers || []).join(',') === (right.modifiers || []).join(',');
    }
    if (left.type === 'media') return left.command === right.command;
    return true;
  }

  function sameKeyMappings(a, b) {
    if (!a?.keys || !b?.keys) return false;
    if ((a.voiceTrigger || 'fn') !== (b.voiceTrigger || 'fn')) return false;
    if (
      JSON.stringify(normalizePhoneLayout(a.layout, a.customKeys))
      !== JSON.stringify(normalizePhoneLayout(b.layout, b.customKeys))
    ) {
      return false;
    }
    if (JSON.stringify(a.customKeys || []) !== JSON.stringify(b.customKeys || [])) {
      return false;
    }
    if (JSON.stringify(a.hiddenKeys || []) !== JSON.stringify(b.hiddenKeys || [])) {
      return false;
    }
    return KEY_ORDER.every((id) => {
      return (a.keys[id]?.label || '') === (b.keys[id]?.label || '')
        && (a.keys[id]?.meaning || '') === (b.keys[id]?.meaning || '')
        && actionsEqual(a.keys[id]?.action, b.keys[id]?.action);
    });
  }

  function openConfigDrawer() {
    if (isDrawerOpen()) return;
    state.previousFocus = document.activeElement;
    state.draft = clone(state.config);
    state.dirty = false;
    state.saving = false;
    state.configLoaded = true;
    state.capturingActionKey = null;
    dom.voiceTriggerSelect.value = state.draft.voiceTrigger || 'fn';
    renderConfigRows();
    syncConfigControls();
    setConfigStatus('clean', '未修改');

    dom.configDrawer.classList.add('is-open');
    dom.configDrawer.setAttribute('aria-hidden', 'false');
    if ('inert' in dom.configDrawer) dom.configDrawer.inert = false;
    dom.drawerBackdrop.hidden = false;
    document.body.classList.add('drawer-open');

    setTimeout(() => {
      const firstInput = dom.configList.querySelector('input');
      if (firstInput) firstInput.focus();
      else dom.closeConfigButton.focus();
    }, 80);
  }

  function requestCloseConfigDrawer() {
    if (!isDrawerOpen()) return;
    if (state.dirty && !window.confirm('还有未保存的按键设置，确定关闭吗？')) {
      return;
    }
    closeConfigDrawer();
  }

  function closeConfigDrawer() {
    dom.configDrawer.classList.remove('is-open');
    dom.configDrawer.setAttribute('aria-hidden', 'true');
    if ('inert' in dom.configDrawer) dom.configDrawer.inert = true;
    dom.drawerBackdrop.hidden = true;
    document.body.classList.remove('drawer-open');
    state.dirty = false;
    state.saving = false;
    state.capturingActionKey = null;

    if (state.previousFocus && typeof state.previousFocus.focus === 'function') {
      state.previousFocus.focus();
    } else {
      dom.openConfigButton.focus();
    }
    state.previousFocus = null;
  }

  function isDrawerOpen() {
    return dom.configDrawer.classList.contains('is-open');
  }

  function configVisibleKeys() {
    const hidden = new Set(normalizeHiddenKeys(state.config?.hiddenKeys));
    const order = Array.isArray(state.config?.layout?.order)
      ? state.config.layout.order
      : KEY_ORDER;
    const ids = order.filter((id) => KEY_ORDER.includes(id) && !hidden.has(id));
    for (const id of KEY_ORDER) {
      if (!hidden.has(id) && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  function renderConfigRows() {
    const fragment = document.createDocumentFragment();

    for (const id of configVisibleKeys()) {
      const info = state.draft?.keys?.[id] || FALLBACK_KEYS[id];
      const row = document.createElement('div');
      row.className = 'config-row';
      row.dataset.key = id;

      const icon = document.createElement('span');
      icon.className = 'config-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = KEY_ICONS[id] || '';

      const fields = document.createElement('div');
      fields.className = 'config-fields';

      const head = document.createElement('div');
      head.className = 'config-row-head';

      const keyLabel = document.createElement('span');
      keyLabel.className = 'config-key-label';
      keyLabel.textContent = info.label || '未命名';

      const code = document.createElement('code');
      code.className = 'config-code';
      code.textContent = id;

      head.append(keyLabel, code);

      const inputs = document.createElement('div');
      inputs.className = 'config-inputs';

      const labelField = createConfigField('名称', 'label', info.label, 24, '按键名称');
      const meaningField = createConfigField('含义', 'meaning', info.meaning, 160, '在电脑端的含义');
      inputs.append(labelField, meaningField);

      fields.append(head, inputs, createConfigActionRow(id, info.action));
      row.append(icon, fields);
      fragment.appendChild(row);
    }

    dom.configList.replaceChildren(fragment);
  }

  function createConfigActionRow(id, action) {
    const wrapper = document.createElement('div');
    wrapper.className = 'config-action-row';

    const label = document.createElement('span');
    label.className = 'config-action-label';
    label.textContent = '单击动作';

    if (id === 'voice') {
      const note = document.createElement('span');
      note.className = 'config-action-disabled';
      note.textContent = '语音键由语音会话处理，不参与普通动作映射';
      wrapper.append(label, note);
      return wrapper;
    }

    const controls = document.createElement('div');
    controls.className = 'config-action-controls';

    const select = document.createElement('select');
    select.className = 'config-select config-action-select';
    select.dataset.actionSelect = '';
    select.setAttribute('aria-label', '单击动作');
    for (const optionInfo of ACTION_OPTIONS) {
      const option = document.createElement('option');
      option.value = optionInfo.value;
      option.textContent = optionInfo.label;
      select.appendChild(option);
    }
    select.value = actionPresetValue(action);

    const shortcutButton = document.createElement('button');
    shortcutButton.type = 'button';
    shortcutButton.className = 'shortcut-button';
    shortcutButton.dataset.shortcutButton = '';
    shortcutButton.textContent = action?.code ? formatShortcut(action) : '点击录制';
    shortcutButton.hidden = select.value !== 'custom';
    shortcutButton.classList.toggle('needs-recording', !action?.code);
    shortcutButton.title = '点击后按下要发送到电脑的组合键';

    controls.append(select, shortcutButton);
    wrapper.append(label, controls);
    return wrapper;
  }

  function refreshActionRow(row) {
    const id = row.dataset.key;
    const action = state.draft?.keys?.[id]?.action;
    const select = row.querySelector('select[data-action-select]');
    if (!select || !action) return;
    const preset = actionPresetValue(action);
    select.value = preset;
    const button = row.querySelector('[data-shortcut-button]');
    if (!button) return;
    button.hidden = preset !== 'custom';
    button.textContent = action.code ? formatShortcut(action) : '点击录制';
    button.classList.toggle('needs-recording', preset === 'custom' && !action.code);
    button.classList.remove('is-invalid');
  }

  function handleConfigActionChange(event) {
    const select = event.target.closest('select[data-action-select]');
    if (!select) return;
    const row = select.closest('.config-row');
    if (!row || !state.draft) return;
    const key = row.dataset.key;
    const info = state.draft.keys[key];
    if (!info || key === 'voice') return;

    const value = select.value;
    let action = { type: 'none' };
    if (value === 'focusInput') {
      action = { type: 'focusInput' };
    } else if (value.startsWith('media:')) {
      action = { type: 'media', command: value.slice('media:'.length) };
    } else if (value.startsWith('keys:')) {
      action = { type: 'keys', code: value.slice('keys:'.length), modifiers: [] };
    } else if (value === 'custom') {
      const current = info.action;
      const currentIsCustom = current?.type === 'keys'
        && current.code
        && !(
          (!current.modifiers || current.modifiers.length === 0)
          && ACTION_PRESET_CODES.has(current.code)
        );
      action = currentIsCustom
        ? current
        : { type: 'keys', code: '', modifiers: [] };
    }

    info.action = action;
    refreshActionRow(row);
    markConfigDirty();
    if (value === 'custom' && !action.code) {
      startShortcutCapture(key, row);
    }
  }

  function handleConfigActionClick(event) {
    const button = event.target.closest('[data-shortcut-button]');
    if (!button) return;
    const row = button.closest('.config-row');
    if (!row || !state.draft) return;
    const key = row.dataset.key;
    const info = state.draft.keys[key];
    if (!info) return;
    if (!info.action || info.action.type !== 'keys') {
      info.action = { type: 'keys', code: '', modifiers: [] };
    }
    refreshActionRow(row);
    startShortcutCapture(key, row);
  }

  function startShortcutCapture(key, row) {
    state.capturingActionKey = key;
    const button = row.querySelector('[data-shortcut-button]');
    if (button) {
      button.hidden = false;
      button.classList.add('is-capturing');
      button.textContent = '请按下组合键…';
      button.focus();
    }
    showToast('按下要发送到电脑的快捷键，按 Esc 取消');
  }

  function cancelShortcutCapture() {
    if (!state.capturingActionKey) return;
    const key = state.capturingActionKey;
    state.capturingActionKey = null;
    const row = dom.configList.querySelector(`.config-row[data-key="${key}"]`);
    if (row) {
      const button = row.querySelector('[data-shortcut-button]');
      button?.classList.remove('is-capturing');
      refreshActionRow(row);
    }
  }

  function finishShortcutCapture(code, modifiers) {
    if (!state.capturingActionKey) return;
    const key = state.capturingActionKey;
    state.capturingActionKey = null;
    const info = state.draft?.keys?.[key];
    if (!info) return;
    info.action = {
      type: 'keys',
      code,
      modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier))
    };
    const row = dom.configList.querySelector(`.config-row[data-key="${key}"]`);
    if (row) {
      const button = row.querySelector('[data-shortcut-button]');
      button?.classList.remove('is-capturing');
      refreshActionRow(row);
      button?.focus();
    }
    markConfigDirty();
  }

  function captureShortcutKeydown(event) {
    if (!state.capturingActionKey) return false;
    event.preventDefault();
    event.stopPropagation();

    const modifierOnly = new Set([
      'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight',
      'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight',
      'CapsLock', 'Fn'
    ]);
    if (
      event.key === 'Escape'
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    ) {
      cancelShortcutCapture();
      return true;
    }
    if (modifierOnly.has(event.code)) return true;
    if (!ACTION_CODES.has(event.code)) {
      showToast('这个按键暂时不能作为自定义快捷键', true);
      return true;
    }

    const modifiers = [];
    if (event.ctrlKey) modifiers.push('control');
    if (event.altKey) modifiers.push('option');
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey) modifiers.push('cmd');
    finishShortcutCapture(event.code, modifiers);
    return true;
  }

  function createConfigField(caption, field, value, maxLength, placeholder) {
    const label = document.createElement('label');
    label.className = 'config-field';

    const span = document.createElement('span');
    span.textContent = caption;

    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.field = field;
    input.maxLength = maxLength;
    input.value = value || '';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;

    label.append(span, input);
    return label;
  }

  function handleConfigInput(event) {
    const input = event.target.closest('input[data-field]');
    if (!input) return;
    const row = input.closest('.config-row');
    if (!row || !state.draft) return;
    const key = row.dataset.key;
    const field = input.dataset.field;
    if (!state.draft.keys[key] || (field !== 'label' && field !== 'meaning')) return;

    state.draft.keys[key][field] = input.value;
    input.classList.remove('is-invalid');

    if (field === 'label') {
      const heading = row.querySelector('.config-key-label');
      if (heading) heading.textContent = input.value.trim() || '未命名';
    }

    markConfigDirty();
  }

  function markConfigDirty() {
    state.dirty = computeDirty();
    syncConfigControls();
    setConfigStatus(state.dirty ? 'dirty' : 'clean', state.dirty ? '有未保存的修改' : '未修改');
  }

  function computeDirty() {
    if (!state.draft || !state.config) return false;
    if ((state.draft.voiceTrigger || 'fn') !== (state.config.voiceTrigger || 'fn')) {
      return true;
    }
    return KEY_ORDER.some((id) => {
      const a = state.draft.keys?.[id] || {};
      const b = state.config.keys?.[id] || {};
      return (a.label || '') !== (b.label || '')
        || (a.meaning || '') !== (b.meaning || '')
        || !actionsEqual(a.action, b.action);
    });
  }

  function syncConfigControls() {
    dom.saveConfigButton.disabled = !state.dirty || state.saving;
    dom.revertConfigButton.disabled = !state.dirty || state.saving;
  }

  function setConfigStatus(kind, text) {
    dom.configStatus.className = 'save-state';
    if (kind === 'dirty') dom.configStatus.classList.add('is-dirty');
    else if (kind === 'saved') dom.configStatus.classList.add('is-saved');
    else if (kind === 'error') dom.configStatus.classList.add('is-error');
    dom.configStatus.textContent = text;
  }

  async function saveConfig() {
    if (state.saving) return;

    const keys = {};
    let firstInvalid = null;

    for (const id of KEY_ORDER) {
      const row = dom.configList.querySelector(`.config-row[data-key="${id}"]`);
      const labelInput = row?.querySelector('input[data-field="label"]');
      const meaningInput = row?.querySelector('input[data-field="meaning"]');
      const label = (state.draft.keys[id]?.label || '').trim();
      const meaning = (state.draft.keys[id]?.meaning || '').trim();

      labelInput?.classList.remove('is-invalid');
      meaningInput?.classList.remove('is-invalid');

      if (!label) {
        labelInput?.classList.add('is-invalid');
        firstInvalid = firstInvalid || labelInput;
      }
      if (!meaning) {
        meaningInput?.classList.add('is-invalid');
        firstInvalid = firstInvalid || meaningInput;
      }

      const rawAction = state.draft.keys[id]?.action;
      const shortcutButton = row?.querySelector('[data-shortcut-button]');
      shortcutButton?.classList.remove('is-invalid');
      if (
        id !== 'voice'
        && rawAction?.type === 'keys'
        && (!rawAction.code || !ACTION_CODES.has(rawAction.code))
      ) {
        shortcutButton?.classList.add('is-invalid');
        firstInvalid = firstInvalid || shortcutButton;
      }
      const action = normalizeClientAction(rawAction, defaultActionForKey(id));
      keys[id] = { label, meaning, action };
    }

    if (firstInvalid) {
      setConfigStatus('error', '名称、含义或自定义快捷键不完整');
      firstInvalid.focus();
      return;
    }

    state.saving = true;
    syncConfigControls();
    setConfigStatus('dirty', '正在保存…');

    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': state.token
        },
        body: JSON.stringify({
          keys,
          voiceTrigger: state.draft.voiceTrigger || 'fn'
        })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload?.error || '保存失败');
      }

      state.config = normalizeClientConfig(payload);
      state.draft = clone(state.config);
      state.voiceTrigger = state.config.voiceTrigger;
      state.saving = false;
      state.dirty = false;
      dom.voiceTriggerSelect.value = state.voiceTrigger;
      renderConfigRows();
      syncConfigControls();
      setConfigStatus('saved', '已保存');
      showToast('按键与系统动作设置已保存');
    } catch (error) {
      state.saving = false;
      state.dirty = computeDirty();
      syncConfigControls();
      setConfigStatus('error', error.message || '保存失败');
      showToast(error.message || '保存设置失败', true);
    }
  }

  function revertConfig() {
    if (!state.dirty || state.saving) return;
    state.draft = clone(state.config);
    state.capturingActionKey = null;
    dom.voiceTriggerSelect.value = state.draft.voiceTrigger || 'fn';
    renderConfigRows();
    syncConfigControls();
    setConfigStatus('clean', '未修改');
    showToast('已撤销尚未保存的修改');
  }

  function handleDrawerKeydown(event) {
    if (!isDrawerOpen()) return;
    if (captureShortcutKeydown(event)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      requestCloseConfigDrawer();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = dom.configDrawer.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), [href], select, textarea'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }


  // ---------------------------------------------------------------------------
  // Layout designer
  // ---------------------------------------------------------------------------

  function allLayoutKeys() {
    if (!state.designerDraftLayout) return [];
    return state.designerDraftLayout.order || [];
  }

  function keyLabelFor(keyId) {
    const custom = state.designerDraftCustomKeys.find((entry) => entry.id === keyId);
    if (custom) return custom.label || keyId;
    return state.config?.keys?.[keyId]?.label
      || FALLBACK_KEYS[keyId]?.label
      || keyId;
  }

  function keyIconFor(keyId) {
    if (state.designerDraftCustomKeys.some((entry) => entry.id === keyId)) {
      return CUSTOM_KEY_ICON;
    }
    return KEY_ICONS[keyId] || '';
  }

  function designerKeyInfo(keyId) {
    const custom = state.designerDraftCustomKeys.find((entry) => entry.id === keyId);
    if (custom) {
      return {
        label: custom.label || keyId,
        meaning: custom.meaning || '自定义快捷键',
        custom: true
      };
    }
    return {
      ...(state.config?.keys?.[keyId] || FALLBACK_KEYS[keyId] || { label: keyId, meaning: '' }),
      custom: false
    };
  }

  function remoteDesignerKeys() {
    const hidden = new Set(state.designerDraftHiddenKeys);
    return allLayoutKeys().filter((keyId) => !hidden.has(keyId));
  }

  function layoutColumns() {
    const raw = Number(state.designerDraftLayout?.columns);
    return Number.isInteger(raw) && raw >= MIN_LAYOUT_COLUMNS && raw <= MAX_LAYOUT_COLUMNS
      ? raw
      : DEFAULT_LAYOUT_COLUMNS;
  }

  function layoutPositionLabel(keyId) {
    const index = allLayoutKeys().indexOf(keyId);
    if (index < 0) return '';
    const columns = layoutColumns();
    const row = Math.floor(index / columns) + 1;
    const column = (index % columns) + 1;
    return `第 ${row} 行 · 第 ${column} 列`;
  }

  /**
   * Moves `sourceKey` next to `targetKey` (before or after it). Unlike a swap,
   * this keeps the relative order of the remaining keys, which is what a free
   * grid layout expects.
   */
  function moveLayoutKey(sourceKey, targetKey, placeAfter = false) {
    const order = state.designerDraftLayout?.order;
    if (!order) return false;
    const from = order.indexOf(sourceKey);
    let to = order.indexOf(targetKey);
    if (from < 0 || to < 0 || from === to) return false;
    if (placeAfter) to += 1;
    order.splice(from, 1);
    if (from < to) to -= 1;
    order.splice(to, 0, sourceKey);
    return true;
  }

  function openDesigner() {
    if (state.designerSaving) return;
    if (!state.ready || !state.configLoaded) {
      showToast('接收端配置尚未加载，请稍候再试', true);
      return;
    }
    if (isDrawerOpen()) {
      requestCloseConfigDrawer();
      if (isDrawerOpen()) return;
    }
    state.designerPreviousFocus = document.activeElement;
    state.designerDraftCustomKeys = normalizeCustomKeys(state.config?.customKeys);
    state.designerDraftLayout = normalizePhoneLayout(
      state.config?.layout,
      state.designerDraftCustomKeys
    );
    state.designerDraftHiddenKeys = normalizeHiddenKeys(state.config?.hiddenKeys);
    state.designerGestureActions = buildGestureDraft(state.config);
    state.designerTab = 'layout';
    state.functionSelection = null;
    state.designerCapturingGesture = null;
    state.designerCapturingCustomId = null;
    state.designerDirty = false;
    setDesignerTab('layout');
    state.designerSaving = false;
    state.designerOpen = true;
    renderDesignerOrderList();
    renderColumnControls();
    renderDesignerCustomKeys();
    renderDefaultKeyVisibility();
    renderFunctionKeyList();
    dom.functionEditor.hidden = true;
    updateDesignerStatus();
    dom.designerOverlay.hidden = false;
    document.body.classList.add('drawer-open');
    ensurePreviewFrame();
    sendPreviewConfig();
    setTimeout(() => {
      const firstMove = dom.layoutOrderList.querySelector('.layout-order-move:not(:disabled)');
      if (firstMove) firstMove.focus();
      else dom.closeDesignerButton.focus();
    }, 60);
  }

  function ensurePreviewFrame() {
    if (!dom.phonePreview.getAttribute('src')) {
      state.previewReady = false;
      dom.phonePreview.src = '/preview';
    }
  }

  function applyMiniLayout(layout, customKeys = []) {
    if (!dom.miniKeyGrid) return;
    const { columns, order } = normalizePhoneLayout(layout, customKeys);
    const customIds = new Set(
      (Array.isArray(customKeys) ? customKeys : []).map((entry) => entry?.id)
    );
    dom.miniKeyGrid.style.setProperty('--mini-columns', String(columns));

    const fragment = document.createDocumentFragment();
    for (const keyId of order) {
      const element = document.createElement('span');
      element.className = 'mini-key';
      element.dataset.rkey = keyId;
      element.classList.toggle('mini-voice-key', keyId === 'voice');
      if (customIds.has(keyId)) {
        element.classList.add('is-custom');
        element.innerHTML = CUSTOM_KEY_ICON;
      } else {
        element.innerHTML = KEY_ICONS[keyId] || '';
      }
      fragment.appendChild(element);
    }
    dom.miniKeyGrid.replaceChildren(fragment);
  }

  function applyMiniHiddenKeys(hiddenKeys) {
    const hidden = new Set(normalizeHiddenKeys(hiddenKeys));
    dom.miniKeyGrid?.querySelectorAll('[data-rkey]').forEach((element) => {
      element.style.display = hidden.has(element.dataset.rkey) ? 'none' : '';
    });
  }

  function createDragHandle(className = 'layout-drag-handle') {
    const handle = document.createElement('span');
    handle.className = className;
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '⠿';
    return handle;
  }

  function renderDesignerOrderList() {
    if (!state.designerDraftLayout || !dom.layoutOrderList) return;
    const order = allLayoutKeys();
    const fragment = document.createDocumentFragment();

    order.forEach((key, index) => {
      const row = document.createElement('div');
      row.className = 'layout-order-row';
      row.dataset.orderKey = key;
      row.dataset.orderIndex = String(index);
      row.classList.toggle(
        'is-key-hidden',
        state.designerDraftHiddenKeys.includes(key)
      );

      const dragHandle = createDragHandle();

      const position = document.createElement('span');
      position.className = 'layout-order-index';
      position.textContent = String(index + 1);

      const icon = document.createElement('span');
      icon.className = 'layout-order-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = keyIconFor(key);

      const label = document.createElement('span');
      label.className = 'layout-order-label';
      label.textContent = keyLabelFor(key);

      const meta = document.createElement('span');
      meta.className = 'layout-order-meta';
      meta.textContent = layoutPositionLabel(key);

      const controls = document.createElement('span');
      controls.className = 'layout-order-controls';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'layout-order-move';
      up.dataset.orderMove = 'up';
      up.setAttribute('aria-label', `上移 ${keyLabelFor(key)}`);
      up.textContent = '↑';
      up.disabled = index === 0;
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'layout-order-move';
      down.dataset.orderMove = 'down';
      down.setAttribute('aria-label', `下移 ${keyLabelFor(key)}`);
      down.textContent = '↓';
      down.disabled = index === order.length - 1;
      controls.append(up, down);

      row.append(dragHandle, position, icon, label, meta, controls);
      fragment.appendChild(row);
    });

    dom.layoutOrderList.replaceChildren(fragment);
  }

  function renderColumnControls() {
    if (!dom.layoutColumns) return;
    const columns = layoutColumns();
    dom.layoutColumns.querySelectorAll('[data-columns]').forEach((button) => {
      const active = Number(button.dataset.columns) === columns;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function handleColumnControlClick(event) {
    const button = event.target.closest('[data-columns]');
    if (!button || !state.designerDraftLayout) return;
    const columns = Number(button.dataset.columns);
    if (
      !Number.isInteger(columns)
      || columns < MIN_LAYOUT_COLUMNS
      || columns > MAX_LAYOUT_COLUMNS
    ) {
      return;
    }
    state.designerDraftLayout.columns = columns;
    commitDesignerOrderChange();
  }

  function handleOrderMoveClick(event) {
    const button = event.target.closest('[data-order-move]');
    if (!button) return;
    const row = button.closest('[data-order-key]');
    if (!row) return;
    const order = allLayoutKeys();
    const index = order.indexOf(row.dataset.orderKey);
    if (index < 0) return;
    const targetIndex = button.dataset.orderMove === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    order.splice(index, 1);
    order.splice(targetIndex, 0, row.dataset.orderKey);
    commitDesignerOrderChange();
    const moved = dom.layoutOrderList.querySelector(
      `[data-order-key="${row.dataset.orderKey}"] [data-order-move="${button.dataset.orderMove}"]`
    );
    moved?.focus();
  }

  function commitDesignerOrderChange() {
    renderDesignerOrderList();
    renderDesignerCustomKeys();
    renderColumnControls();
    updateDesignerStatus();
    sendPreviewConfig();
  }

  function moveDesignerLayoutKey(sourceKey, targetKey, placeAfter) {
    if (!moveLayoutKey(sourceKey, targetKey, placeAfter)) return;
    commitDesignerOrderChange();
  }

  // Pointer-based dragging works with mouse, pen and touch. Native HTML5
  // drag-and-drop is intentionally not used because it does not fire on touch
  // devices and behaves inconsistently inside scrollable panels.
  function handleDesignerDragPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const row = event.target.closest('[data-order-key]');
    if (!row || !row.dataset.orderKey) return;
    const onHandle = Boolean(event.target.closest('.layout-drag-handle'));
    const onControl = Boolean(event.target.closest('button, input, select, textarea, a'));
    if (!onHandle && onControl) return;
    // On touch screens the row body must remain scrollable, so only the
    // explicit handle starts a drag there.
    if (!onHandle && event.pointerType !== 'mouse') return;
    event.preventDefault();
    startDesignerKeyDrag(row, event);
  }

  function startDesignerKeyDrag(row, startEvent) {
    const key = row.dataset.orderKey;
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    let ghost = null;
    let active = false;
    let targetRow = null;
    let targetAfter = false;
    let pointerX = startX;
    let pointerY = startY;
    let scrollFrame = null;

    const scrollerBounds = () => dom.designerSide?.getBoundingClientRect() || null;

    const clearTarget = () => {
      targetRow?.classList.remove('is-drag-over', 'is-drop-before', 'is-drop-after');
      targetRow = null;
    };

    const updateTarget = () => {
      const element = document.elementFromPoint(pointerX, pointerY);
      const next = element?.closest?.('[data-order-key]') || null;
      const valid = next
        && next !== row
        && next.dataset.orderKey
        && next.dataset.orderKey !== key;

      if (!valid) {
        clearTarget();
        return;
      }

      const rect = next.getBoundingClientRect();
      const after = pointerY > rect.top + rect.height / 2;
      if (next === targetRow && after === targetAfter) return;
      clearTarget();
      targetRow = next;
      targetAfter = after;
      targetRow.classList.add('is-drag-over', after ? 'is-drop-after' : 'is-drop-before');
    };

    const autoScrollStep = () => {
      scrollFrame = null;
      const scroller = dom.designerSide;
      const rect = scrollerBounds();
      if (active && scroller && rect) {
        let delta = 0;
        if (pointerY < rect.top + 58) {
          delta = -Math.max(4, (rect.top + 58 - pointerY) / 3.2);
        } else if (pointerY > rect.bottom - 58) {
          delta = Math.max(4, (pointerY - (rect.bottom - 58)) / 3.2);
        }
        if (delta) {
          scroller.scrollTop += delta;
          updateTarget();
        }
      }
      scrollFrame = requestAnimationFrame(autoScrollStep);
    };

    const onMove = (event) => {
      if (!active) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < 4) return;
        active = true;
        ghost = row.cloneNode(true);
        ghost.classList.add('designer-drag-ghost');
        ghost.removeAttribute('data-order-key');
        ghost.style.width = `${row.getBoundingClientRect().width}px`;
        document.body.appendChild(ghost);
        row.classList.add('is-dragging');
        document.body.classList.add('is-designer-dragging');
      }

      event.preventDefault();
      pointerX = event.clientX;
      pointerY = event.clientY;
      ghost.style.transform = `translate(${pointerX + 12}px, ${pointerY - 18}px)`;
      updateTarget();
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
      clearTarget();
      row.classList.remove('is-dragging');
      document.body.classList.remove('is-designer-dragging');
      ghost?.remove();
      ghost = null;
    };

    const onUp = () => {
      const targetKey = targetRow?.dataset.orderKey || '';
      const placeAfter = targetAfter;
      cleanup();
      if (targetKey) moveDesignerLayoutKey(key, targetKey, placeAfter);
    };

    const onCancel = () => cleanup();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    scrollFrame = requestAnimationFrame(autoScrollStep);
  }

  function updateDesignerStatus(mode = null) {
    state.designerDirty = Boolean(
      state.designerDraftLayout
      && (
        JSON.stringify(state.designerDraftLayout) !== JSON.stringify(
          normalizePhoneLayout(state.config?.layout, normalizeCustomKeys(state.config?.customKeys))
        )
        || JSON.stringify(state.designerDraftCustomKeys) !== JSON.stringify(normalizeCustomKeys(state.config?.customKeys))
        || JSON.stringify(state.designerDraftHiddenKeys) !== JSON.stringify(normalizeHiddenKeys(state.config?.hiddenKeys))
        || JSON.stringify(state.designerGestureActions) !== JSON.stringify(buildGestureDraft(state.config))
      )
    );
    const canSave = state.designerDirty && !state.designerSaving;
    dom.saveDesignerButton.disabled = !canSave;
    dom.resetLayoutButton.disabled = state.designerSaving
      || JSON.stringify(state.designerDraftLayout) === JSON.stringify(
        defaultPhoneLayout(state.designerDraftCustomKeys)
      );
    dom.designerStatus.className = 'save-state';

    if (mode === 'saving') {
      dom.designerStatus.textContent = '正在保存布局…';
    } else if (mode === 'saved') {
      dom.designerStatus.classList.add('is-saved');
      dom.designerStatus.textContent = '已保存并同步到手机';
    } else if (mode === 'error') {
      dom.designerStatus.classList.add('is-error');
      dom.designerStatus.textContent = '布局保存失败';
    } else if (state.designerDirty) {
      dom.designerStatus.classList.add('is-dirty');
      dom.designerStatus.textContent = '有未保存的修改';
    } else {
      dom.designerStatus.textContent = '布局未修改';
    }
  }

  function sendPreviewConfig() {
    if (!state.designerOpen || !state.previewReady || !state.designerDraftLayout) return;
    const target = dom.phonePreview.contentWindow;
    if (!target) return;
    const config = clone(state.config || fallbackConfig());
    config.layout = clone(state.designerDraftLayout);
    config.customKeys = clone(state.designerDraftCustomKeys);
    config.hiddenKeys = [...state.designerDraftHiddenKeys];
    target.postMessage({ type: 'remote-preview-config', config }, location.origin);
  }

  function handlePreviewMessage(event) {
    if (event.origin !== location.origin) return;
    if (event.source !== dom.phonePreview.contentWindow) return;
    if (!event.data || event.data.type !== 'remote-preview-ready') return;
    state.previewReady = true;
    if (state.designerOpen) sendPreviewConfig();
  }

  function resetDesignerLayout() {
    state.designerDraftLayout = defaultPhoneLayout(state.designerDraftCustomKeys);
    renderDesignerOrderList();
    renderColumnControls();
    renderDesignerCustomKeys();
    updateDesignerStatus();
    sendPreviewConfig();
  }


  function buildGestureDraft(config) {
    const source = config?.keys || FALLBACK_KEYS;
    const result = {};
    for (const id of KEY_ORDER) {
      const entry = source[id] || FALLBACK_KEYS[id] || {};
      result[id] = {
        action: normalizeClientAction(entry.action, defaultActionForKey(id)),
        doubleAction: normalizeOptionalClientAction(entry.doubleAction),
        longAction: normalizeOptionalClientAction(entry.longAction)
      };
    }
    for (const entry of config?.customKeys || []) {
      if (!entry || typeof entry.id !== 'string') continue;
      result[entry.id] = {
        action: normalizeClientAction(entry.action, { type: 'none' }),
        doubleAction: normalizeOptionalClientAction(entry.doubleAction),
        longAction: normalizeOptionalClientAction(entry.longAction)
      };
    }
    return result;
  }

  function setDesignerTab(tab) {
    state.designerTab = tab === 'functions' ? 'functions' : 'layout';
    const isFunctions = state.designerTab === 'functions';
    dom.designerLayoutPane.hidden = isFunctions;
    dom.designerFunctionPane.hidden = !isFunctions;
    dom.designerLayoutTab.classList.toggle('is-active', !isFunctions);
    dom.designerFunctionTab.classList.toggle('is-active', isFunctions);
    dom.designerLayoutTab.setAttribute('aria-selected', String(!isFunctions));
    dom.designerFunctionTab.setAttribute('aria-selected', String(isFunctions));
    dom.designerDescription.textContent = isFunctions
      ? '为每个按键设计单击、双击、长按动作，保存后同步到手机。'
      : '拖动任意按键调整位置，右侧预览会实时同步。';
    if (isFunctions) {
      renderFunctionKeyList();
      renderFunctionEditor();
    } else {
      closeFunctionEditor();
    }
  }

  const FUNCTION_GESTURES = [
    { id: 'action', label: '单击' },
    { id: 'doubleAction', label: '双击' },
    { id: 'longAction', label: '长按' }
  ];

  function functionActionSummary(action, gesture) {
    if (!action) return gesture === 'action' ? '未设置' : '未设置';
    if (action.type === 'keys' && !action.code) return '未录制';
    return describeAction(action);
  }

  function renderFunctionKeyList() {
    if (!dom.functionKeyList) return;
    const fragment = document.createDocumentFragment();
    const keyIds = remoteDesignerKeys();
    if (keyIds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'function-fixed-note';
      empty.textContent = '当前遥控器上没有可见按键。请先在「布局」视图中显示按键。';
      dom.functionKeyList.replaceChildren(empty);
      return;
    }
    for (const id of keyIds) {
      const info = designerKeyInfo(id);
      const card = document.createElement('div');
      card.className = 'function-key-card';
      card.dataset.functionKey = id;

      const head = document.createElement('div');
      head.className = 'function-key-head';
      const icon = document.createElement('span');
      icon.className = 'function-key-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = keyIconFor(id);
      const name = document.createElement('span');
      name.className = 'function-key-name';
      name.textContent = info.label || id;
      head.append(icon, name);

      if (id === 'voice') {
        const note = document.createElement('span');
        note.className = 'function-fixed-note';
        note.textContent = '固定语音会话 · 单击/双击/长按不适用';
        head.appendChild(note);
        card.appendChild(head);
        fragment.appendChild(card);
        continue;
      }

      const grid = document.createElement('div');
      grid.className = 'function-gesture-grid';
      for (const gesture of FUNCTION_GESTURES) {
        const action = state.designerGestureActions?.[id]?.[gesture.id];
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'function-cell';
        cell.dataset.functionKey = id;
        cell.dataset.functionGesture = gesture.id;
        const selected = state.functionSelection?.key === id
          && state.functionSelection?.gesture === gesture.id;
        cell.classList.toggle('is-selected', selected);
        cell.classList.toggle('is-unset', !action);
        cell.setAttribute(
          'aria-label',
          `${info.label || id} 的${gesture.label}动作：${functionActionSummary(action, gesture.id)}`
        );
        const label = document.createElement('span');
        label.className = 'function-cell-label';
        label.textContent = gesture.label;
        const value = document.createElement('span');
        value.className = 'function-cell-value';
        value.textContent = functionActionSummary(action, gesture.id);
        cell.append(label, value);
        grid.appendChild(cell);
      }
      card.append(head, grid);
      fragment.appendChild(card);
    }
    dom.functionKeyList.replaceChildren(fragment);
  }

  function handleFunctionCellClick(event) {
    const cell = event.target.closest('[data-function-gesture]');
    if (!cell) return;
    const key = cell.dataset.functionKey;
    const gesture = cell.dataset.functionGesture;
    if (!key || !gesture) return;
    state.designerCapturingGesture = null;
    state.functionSelection = { key, gesture };
    renderFunctionKeyList();
    renderFunctionEditor();
    dom.functionActionSelect.focus();
  }

  function renderFunctionEditor() {
    if (!dom.functionEditor) return;
    const selection = state.functionSelection;
    if (!selection) {
      dom.functionEditor.hidden = true;
      return;
    }
    const info = designerKeyInfo(selection.key);
    const gesture = FUNCTION_GESTURES.find((item) => item.id === selection.gesture);
    if (!gesture) {
      dom.functionEditor.hidden = true;
      return;
    }
    const action = state.designerGestureActions?.[selection.key]?.[selection.gesture];
    dom.functionEditorTitle.textContent = `${info.label} · ${gesture.label}`;
    dom.functionActionSelect.replaceChildren();

    if (selection.gesture !== 'action') {
      const unset = document.createElement('option');
      unset.value = 'unset';
      unset.textContent = '不设置';
      dom.functionActionSelect.appendChild(unset);
    }

    for (const option of ACTION_OPTIONS) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      dom.functionActionSelect.appendChild(element);
    }

    const preset = !action && selection.gesture !== 'action'
      ? 'unset'
      : actionPresetValue(action);
    dom.functionActionSelect.value = preset;
    updateFunctionShortcutButton(action);
    dom.functionEditor.hidden = false;
  }

  function updateFunctionShortcutButton(action) {
    if (!dom.functionShortcutButton) return;
    const isCustom = action?.type === 'keys'
      && ((action.modifiers?.length || 0) > 0 || !ACTION_PRESET_CODES.has(action.code));
    dom.functionShortcutButton.hidden = !isCustom;
    if (!isCustom) return;
    dom.functionShortcutButton.textContent = action.code ? formatShortcut(action) : '录制快捷键';
    dom.functionShortcutButton.classList.toggle('needs-recording', !action.code);
    dom.functionShortcutButton.classList.remove('is-capturing');
  }

  function syncCustomGestureAction(key, gesture, action) {
    if (gesture !== 'action') return;
    const entry = state.designerDraftCustomKeys.find((item) => item.id === key);
    if (!entry) return;
    entry.action = action || { type: 'none' };
    renderDesignerCustomKeys();
  }

  function handleFunctionActionChange() {
    const selection = state.functionSelection;
    if (!selection || !state.designerGestureActions?.[selection.key]) return;
    const value = dom.functionActionSelect.value;
    let action = null;
    if (value === 'unset') action = null;
    else if (value === 'none') action = { type: 'none' };
    else if (value === 'focusInput') action = { type: 'focusInput' };
    else if (value.startsWith('media:')) action = { type: 'media', command: value.slice('media:'.length) };
    else if (value.startsWith('keys:')) action = { type: 'keys', code: value.slice('keys:'.length), modifiers: [] };
    else if (value === 'custom') {
      const current = state.designerGestureActions[selection.key][selection.gesture];
      const currentCustom = current?.type === 'keys'
        && current.code
        && ((current.modifiers?.length || 0) > 0 || !ACTION_PRESET_CODES.has(current.code));
      action = currentCustom
        ? current
        : { type: 'keys', code: '', modifiers: [] };
    }

    state.designerGestureActions[selection.key][selection.gesture] = action;
    syncCustomGestureAction(selection.key, selection.gesture, action);
    renderFunctionKeyList();
    renderFunctionEditor();
    updateDesignerStatus();
    if (value === 'custom' && (!action?.code)) {
      beginFunctionShortcutCapture();
    }
  }

  function beginFunctionShortcutCapture() {
    const selection = state.functionSelection;
    if (!selection) return;
    state.designerCapturingGesture = { ...selection };
    dom.functionShortcutButton.classList.add('is-capturing');
    dom.functionShortcutButton.textContent = '请按下组合键…';
    dom.functionShortcutButton.focus();
    showToast('按下要发送的快捷键，按 Esc 取消');
  }

  function cancelFunctionShortcutCapture() {
    state.designerCapturingGesture = null;
    renderFunctionEditor();
  }

  function handleFunctionCaptureKeydown(event) {
    if (!state.designerCapturingGesture) return false;
    event.preventDefault();
    event.stopPropagation();
    const modifierOnly = new Set([
      'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight',
      'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight',
      'CapsLock', 'Fn'
    ]);
    if (
      event.key === 'Escape'
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    ) {
      cancelFunctionShortcutCapture();
      return true;
    }
    if (modifierOnly.has(event.code)) return true;
    if (!ACTION_CODES.has(event.code)) {
      showToast('这个按键暂时不能作为自定义快捷键', true);
      return true;
    }
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('control');
    if (event.altKey) modifiers.push('option');
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey) modifiers.push('cmd');
    const { key, gesture } = state.designerCapturingGesture;
    state.designerCapturingGesture = null;
    state.designerGestureActions[key][gesture] = {
      type: 'keys',
      code: event.code,
      modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier))
    };
    syncCustomGestureAction(key, gesture, state.designerGestureActions[key][gesture]);
    renderFunctionKeyList();
    renderFunctionEditor();
    updateDesignerStatus();
    return true;
  }

  function closeFunctionEditor() {
    state.functionSelection = null;
    state.designerCapturingGesture = null;
    if (dom.functionEditor) dom.functionEditor.hidden = true;
    if (dom.functionKeyList) {
      dom.functionKeyList.querySelectorAll('.function-cell.is-selected').forEach((cell) => {
        cell.classList.remove('is-selected');
      });
    }
  }

  function renderDefaultKeyVisibility() {

    const fragment = document.createDocumentFragment();
    for (const id of KEY_ORDER) {
      const hidden = state.designerDraftHiddenKeys.includes(id);
      const info = state.config?.keys?.[id] || FALLBACK_KEYS[id];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'visibility-chip';
      chip.dataset.visibilityKey = id;
      chip.classList.toggle('is-hidden', hidden);
      chip.setAttribute('aria-pressed', String(!hidden));
      chip.title = hidden ? `恢复 ${info?.label || id}` : `从手机端移除 ${info?.label || id}`;

      const icon = document.createElement('span');
      icon.className = 'visibility-chip-icon';
      icon.innerHTML = KEY_ICONS[id] || '';
      const label = document.createElement('span');
      label.className = 'visibility-chip-label';
      label.textContent = info?.label || id;
      const action = document.createElement('span');
      action.className = 'visibility-chip-action';
      action.textContent = hidden ? '＋' : '×';
      chip.append(icon, label, action);
      fragment.appendChild(chip);
    }
    dom.defaultKeyVisibility.replaceChildren(fragment);
  }

  function handleVisibilityClick(event) {
    const chip = event.target.closest('[data-visibility-key]');
    if (!chip) return;
    const key = chip.dataset.visibilityKey;
    const index = state.designerDraftHiddenKeys.indexOf(key);
    if (index === -1) state.designerDraftHiddenKeys.push(key);
    else state.designerDraftHiddenKeys.splice(index, 1);
    renderDefaultKeyVisibility();
    renderDesignerOrderList();
    updateDesignerStatus();
    sendPreviewConfig();
  }

  function createCustomKeyId() {
    if (typeof crypto.randomUUID === 'function') {
      return `custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    return `custom_${Math.random().toString(36).slice(2, 12)}`;
  }

  function renderDesignerCustomKeys() {
    const fragment = document.createDocumentFragment();
    state.designerDraftCustomKeys.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'custom-key-row';
      row.dataset.customKeyId = entry.id;

      const main = document.createElement('div');
      main.className = 'custom-key-main';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'custom-key-label-input';
      labelInput.value = entry.label;
      labelInput.maxLength = 24;
      labelInput.dataset.customLabelId = entry.id;
      labelInput.setAttribute('aria-label', `自定义按键 ${index + 1} 名称`);

      const placement = document.createElement('span');
      placement.className = 'custom-key-placement';
      placement.textContent = layoutPositionLabel(entry.id) || '未放置';

      main.append(labelInput, placement);

      const gestureAction = state.designerGestureActions?.[entry.id]?.action || entry.action;
      const shortcutButton = document.createElement('button');
      shortcutButton.type = 'button';
      shortcutButton.className = 'shortcut-button custom-key-shortcut';
      shortcutButton.dataset.customShortcutId = entry.id;
      shortcutButton.textContent = gestureAction?.type === 'keys' && gestureAction.code
        ? formatShortcut(gestureAction)
        : '录制快捷键';
      shortcutButton.classList.toggle('needs-recording', !(gestureAction?.type === 'keys' && gestureAction.code));
      shortcutButton.setAttribute('aria-label', `为 ${entry.label} 录制快捷键`);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'custom-key-delete';
      removeButton.dataset.removeCustomId = entry.id;
      removeButton.setAttribute('aria-label', `删除 ${entry.label}`);
      removeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';

      row.append(main, shortcutButton, removeButton);
      fragment.appendChild(row);
    });

    dom.customKeyList.replaceChildren(fragment);
    dom.customKeyEmpty.hidden = state.designerDraftCustomKeys.length > 0;
    dom.addCustomKeyButton.disabled = state.designerDraftCustomKeys.length >= MAX_CUSTOM_KEYS;
  }

  function addCustomKey() {
    if (state.designerDraftCustomKeys.length >= MAX_CUSTOM_KEYS) return;
    const number = state.designerDraftCustomKeys.length + 1;
    const entry = {
      id: createCustomKeyId(),
      label: `快捷键 ${number}`,
      meaning: '自定义快捷键',
      action: { type: 'none' },
      doubleAction: null,
      longAction: null
    };
    state.designerDraftCustomKeys.push(entry);
    if (state.designerGestureActions) {
      state.designerGestureActions[entry.id] = {
        action: { type: 'none' },
        doubleAction: null,
        longAction: null
      };
    }
    if (state.designerDraftLayout?.order) {
      state.designerDraftLayout.order.push(entry.id);
    }
    renderDesignerOrderList();
    renderDesignerCustomKeys();
    renderFunctionKeyList();
    updateDesignerStatus();
    sendPreviewConfig();
    const inputs = dom.customKeyList.querySelectorAll('.custom-key-label-input');
    const last = inputs[inputs.length - 1];
    last?.focus();
    last?.select();
  }

  function updateCustomKeyDraft(input) {
    const id = input.dataset.customLabelId;
    const entry = state.designerDraftCustomKeys.find((item) => item.id === id);
    if (!entry) return;
    entry.label = input.value;
    const row = input.closest('.custom-key-row');
    const shortcut = row?.querySelector('[data-custom-shortcut-id]');
    shortcut?.setAttribute('aria-label', `为 ${input.value || '自定义按键'} 录制快捷键`);
    renderDesignerOrderList();
    updateDesignerStatus();
    sendPreviewConfig();
  }

  function handleCustomKeyClick(event) {
    const shortcut = event.target.closest('[data-custom-shortcut-id]');
    if (shortcut) {
      startCustomShortcutCapture(shortcut.dataset.customShortcutId);
      return;
    }
    const remove = event.target.closest('[data-remove-custom-id]');
    if (remove) removeCustomKey(remove.dataset.removeCustomId);
  }

  function removeCustomKey(id) {
    const index = state.designerDraftCustomKeys.findIndex((item) => item.id === id);
    if (index === -1) return;
    state.designerDraftCustomKeys.splice(index, 1);
    if (state.designerGestureActions) delete state.designerGestureActions[id];
    if (state.functionSelection?.key === id) {
      state.functionSelection = null;
      state.designerCapturingGesture = null;
    }
    const order = state.designerDraftLayout?.order;
    if (order) {
      const orderIndex = order.indexOf(id);
      if (orderIndex >= 0) order.splice(orderIndex, 1);
    }
    renderDesignerOrderList();
    renderDesignerCustomKeys();
    renderFunctionKeyList();
    renderFunctionEditor();
    updateDesignerStatus();
    sendPreviewConfig();
  }

  function startCustomShortcutCapture(id) {
    const entry = state.designerDraftCustomKeys.find((item) => item.id === id);
    if (!entry) return;
    state.designerCapturingCustomId = id;
    const button = dom.customKeyList.querySelector(`[data-custom-shortcut-id="${id}"]`);
    if (button) {
      button.classList.add('is-capturing');
      button.textContent = '请按下组合键…';
      button.focus();
    }
    showToast('按下要发送的快捷键，按 Esc 取消');
  }

  function cancelCustomShortcutCapture() {
    if (!state.designerCapturingCustomId) return;
    const id = state.designerCapturingCustomId;
    state.designerCapturingCustomId = null;
    const button = dom.customKeyList.querySelector(`[data-custom-shortcut-id="${id}"]`);
    button?.classList.remove('is-capturing');
    renderDesignerCustomKeys();
  }

  function finishCustomShortcutCapture(code, modifiers) {
    if (!state.designerCapturingCustomId) return false;
    const entry = state.designerDraftCustomKeys.find(
      (item) => item.id === state.designerCapturingCustomId
    );
    state.designerCapturingCustomId = null;
    if (!entry) return true;
    entry.action = {
      type: 'keys',
      code,
      modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier))
    };
    if (state.designerGestureActions?.[entry.id]) {
      state.designerGestureActions[entry.id].action = entry.action;
    }
    renderDesignerCustomKeys();
    renderFunctionKeyList();
    renderFunctionEditor();
    updateDesignerStatus();
    sendPreviewConfig();
    return true;
  }

  function handleDesignerCustomKeydown(event) {
    if (!state.designerCapturingCustomId) return false;
    event.preventDefault();
    event.stopPropagation();
    const modifierOnly = new Set([
      'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight',
      'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight',
      'CapsLock', 'Fn'
    ]);
    if (
      event.key === 'Escape'
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    ) {
      cancelCustomShortcutCapture();
      return true;
    }
    if (modifierOnly.has(event.code)) return true;
    if (!ACTION_CODES.has(event.code)) {
      showToast('这个按键暂时不能作为自定义快捷键', true);
      return true;
    }
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('control');
    if (event.altKey) modifiers.push('option');
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey) modifiers.push('cmd');
    finishCustomShortcutCapture(event.code, modifiers);
    return true;
  }

  async function saveDesignerLayout() {
    if (state.designerSaving) return;
    const layout = normalizePhoneLayout(
      state.designerDraftLayout,
      state.designerDraftCustomKeys
    );

    const keys = clone(state.config.keys);
    for (const id of KEY_ORDER) {
      if (id === 'voice') {
        keys[id].action = { type: 'none' };
        keys[id].doubleAction = null;
        keys[id].longAction = null;
        continue;
      }
      const gestureActions = state.designerGestureActions?.[id];
      if (!gestureActions) continue;
      for (const [prop, label] of [['action', '单击'], ['doubleAction', '双击'], ['longAction', '长按']]) {
        const action = gestureActions[prop];
        if (action?.type === 'keys' && !action.code) {
          setDesignerError(`请先为「${keys[id].label} · ${label}」录制快捷键`);
          return;
        }
      }
      keys[id].action = gestureActions.action || { type: 'none' };
      keys[id].doubleAction = gestureActions.doubleAction || null;
      keys[id].longAction = gestureActions.longAction || null;
    }

    const customKeys = [];
    for (const entry of state.designerDraftCustomKeys) {
      const label = (entry.label || '').trim();
      if (!label) {
        setDesignerError('自定义按键名称不能为空');
        return;
      }
      const gestureActions = state.designerGestureActions?.[entry.id] || {};
      for (const [prop, gestureLabel] of [['action', '单击'], ['doubleAction', '双击'], ['longAction', '长按']]) {
        const action = gestureActions[prop];
        if (action?.type === 'keys' && !action.code) {
          setDesignerError(`请先为「${label} · ${gestureLabel}」录制快捷键`);
          const button = dom.customKeyList.querySelector(`[data-custom-shortcut-id="${entry.id}"]`);
          button?.focus();
          return;
        }
      }
      customKeys.push({
        id: entry.id,
        label,
        meaning: entry.meaning || '自定义快捷键',
        action: gestureActions.action || { type: 'none' },
        doubleAction: gestureActions.doubleAction || null,
        longAction: gestureActions.longAction || null
      });
    }

    state.designerSaving = true;
    updateDesignerStatus('saving');
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': state.token
        },
        body: JSON.stringify({
          keys,
          voiceTrigger: state.config.voiceTrigger,
          layout,
          customKeys,
          hiddenKeys: state.designerDraftHiddenKeys
        })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) throw new Error(payload?.error || '布局保存失败');

      const sentColumns = layout.columns;
      state.config = normalizeClientConfig(payload);
      const columnsPersisted = state.config.layout.columns === sentColumns;
      state.designerDraftLayout = clone(state.config.layout);
      if (!columnsPersisted) {
        // An older server process drops the new columns field. Keep the user's
        // choice visible and tell them why it was not persisted instead of
        // silently snapping the grid back to three columns.
        state.designerDraftLayout.columns = sentColumns;
      }
      state.designerDraftCustomKeys = clone(state.config.customKeys || []);
      state.designerDraftHiddenKeys = normalizeHiddenKeys(state.config.hiddenKeys);
      state.designerGestureActions = buildGestureDraft(state.config);
      state.designerSaving = false;
      state.designerDirty = !columnsPersisted;
      renderDesignerOrderList();
      renderColumnControls();
      renderDesignerCustomKeys();
      renderDefaultKeyVisibility();
      renderFunctionKeyList();
      renderFunctionEditor();
      sendPreviewConfig();
      if (!columnsPersisted) {
        updateDesignerStatus();
        setDesignerError('服务端未保存每行按键数，请重启服务后重试');
      } else {
        updateDesignerStatus('saved');
        showToast('布局已保存，手机端连接后会使用相同布局');
      }
    } catch (error) {
      state.designerSaving = false;
      updateDesignerStatus('error');
      showToast(error.message || '保存布局失败', true);
    }
  }

  function setDesignerError(message) {
    dom.designerStatus.className = 'save-state is-error';
    dom.designerStatus.textContent = message;
    showToast(message, true);
  }

  function requestCloseDesigner() {
    if (state.designerSaving) {
      showToast('布局正在保存，请稍候');
      return;
    }
    if (state.designerDirty && !window.confirm('还有未保存的布局修改，确定关闭吗？')) {
      return;
    }
    closeDesigner();
  }

  function closeDesigner() {
    dom.designerOverlay.hidden = true;
    state.designerOpen = false;
    state.designerDirty = false;
    state.designerSaving = false;
    document.body.classList.remove('drawer-open');
    if (state.designerPreviousFocus && typeof state.designerPreviousFocus.focus === 'function') {
      state.designerPreviousFocus.focus();
    } else {
      dom.openDesignerButton.focus();
    }
    state.designerPreviousFocus = null;
  }

  function handleDesignerKeydown(event) {
    if (!state.designerOpen) return;
    if (handleFunctionCaptureKeydown(event)) return;
    if (handleDesignerCustomKeydown(event)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      requestCloseDesigner();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dom.designerOverlay.querySelectorAll(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), [href]'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function editKeySettingsFromDesigner() {
    if (state.designerDirty && !window.confirm('当前布局修改尚未保存，仍要去编辑按键名称和动作吗？')) {
      return;
    }
    closeDesigner();
    openConfigDrawer();
  }

  // ---------------------------------------------------------------------------
  // Connect panel
  // ---------------------------------------------------------------------------

  async function loadConnectInfo() {
    try {
      const response = await fetch('/api/connect-info', {
        cache: 'no-store',
        headers: { 'X-Bridge-Token': state.token }
      });
      if (!response.ok) throw new Error('无法读取连接信息');
      const info = await response.json();
      if (!info || !info.primaryUrl) throw new Error('连接信息不完整');
      state.connectInfo = info;
      renderConnectInfo(info);
    } catch {
      const label = dom.qrLoading.querySelector('span:last-child');
      if (label) label.textContent = '暂时无法生成二维码';
      showToast('无法读取手机端连接地址，请刷新页面重试', true);
    }
  }

  function renderConnectInfo(info) {
    const endpoints = Array.isArray(info.endpoints) && info.endpoints.length
      ? info.endpoints
      : [{
        address: info.primaryUrl,
        label: '当前地址',
        bluetooth: false,
        primaryUrl: info.primaryUrl,
        primaryProtocol: info.primaryProtocol,
        urls: info.urls,
        qrDataUrl: info.qrDataUrl
      }];

    const httpsAvailable = Boolean(info.httpsAvailable);
    dom.securityBadge.textContent = httpsAvailable ? 'HTTPS' : 'HTTP';
    dom.securityBadge.classList.toggle('is-http', !httpsAvailable);

    dom.serverMeta.textContent = [
      `HTTP :${info.httpPort}`,
      httpsAvailable ? `HTTPS :${info.httpsPort}` : ''
    ].filter(Boolean).join(' · ');

    const previousAddress = state.connectEndpoint?.address;
    let selected = endpoints.find((endpoint) => endpoint.address === previousAddress);
    if (!selected) selected = endpoints[0];

    const fragment = document.createDocumentFragment();
    endpoints.forEach((endpoint, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      const kind = endpoint.bluetooth ? '蓝牙' : endpoint.label;
      option.textContent = `${kind} · ${endpoint.address}`;
      fragment.appendChild(option);
    });
    dom.connectAddressSelect.replaceChildren(fragment);
    dom.connectAddressSelect.value = String(endpoints.indexOf(selected));
    dom.connectAddressSelect.disabled = endpoints.length <= 1;

    applyConnectEndpoint(info, selected);
  }

  function applyConnectEndpoint(info, endpoint) {
    state.connectEndpoint = endpoint;
    const httpsAvailable = Boolean(info.httpsAvailable);

    dom.connectUrl.textContent = endpoint.primaryUrl;

    const httpUrl = endpoint.urls?.find((item) => item.protocol === 'http')?.url || '';
    dom.httpUrl.textContent = httpUrl || '当前没有 HTTP 地址';
    dom.toggleHttpButton.hidden = !httpUrl;
    if (!httpUrl) {
      dom.httpRow.hidden = true;
      dom.toggleHttpButton.setAttribute('aria-expanded', 'false');
      dom.toggleHttpButton.textContent = 'HTTP 备用地址';
    }

    const addressKind = endpoint.bluetooth ? '蓝牙网络' : (endpoint.label || '当前地址');
    dom.connectNote.textContent = httpsAvailable
      ? `${info.note || '手机和电脑连接同一个 Wi-Fi 或蓝牙网络'} 当前地址：${addressKind}（${endpoint.address}）。首次打开 HTTPS 时，请在手机上选择继续访问。`
      : '当前只能使用 HTTP 连接，手机端将无法录音。请查看 README 配置 HTTPS。';

    dom.qrImage.onload = () => {
      dom.qrLoading.hidden = true;
      dom.qrImage.hidden = false;
    };
    dom.qrImage.onerror = () => {
      dom.qrImage.hidden = true;
      dom.qrLoading.hidden = false;
      const label = dom.qrLoading.querySelector('span:last-child');
      if (label) label.textContent = '二维码加载失败';
    };
    dom.qrImage.hidden = true;
    dom.qrLoading.hidden = false;
    const loadingLabel = dom.qrLoading.querySelector('span:last-child');
    if (loadingLabel) loadingLabel.textContent = '正在生成二维码';
    dom.qrImage.src = endpoint.qrDataUrl;
  }

  function copyText(text, successMessage) {
    if (!text) return;
    const fallbackCopy = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
      return ok;
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast(successMessage),
        () => {
          if (fallbackCopy()) showToast(successMessage);
          else showToast('复制失败，请手动选择地址', true);
        }
      );
      return;
    }

    if (fallbackCopy()) showToast(successMessage);
    else showToast('复制失败，请手动选择地址', true);
  }

  // ---------------------------------------------------------------------------
  // Utilities and bindings
  // ---------------------------------------------------------------------------

  function bindUi() {
    dom.openConfigButton.addEventListener('click', openConfigDrawer);
    dom.openGestureEditorButton.addEventListener('click', () => {
      requestCloseConfigDrawer();
      if (isDrawerOpen()) return;
      openDesigner();
      if (state.designerOpen) setDesignerTab('functions');
    });
    dom.openDesignerButton.addEventListener('click', openDesigner);
    dom.closeDesignerButton.addEventListener('click', requestCloseDesigner);
    dom.cancelDesignerButton.addEventListener('click', requestCloseDesigner);
    dom.designerBackdrop.addEventListener('click', requestCloseDesigner);
    dom.saveDesignerButton.addEventListener('click', saveDesignerLayout);
    dom.resetLayoutButton.addEventListener('click', resetDesignerLayout);
    dom.editKeySettingsButton.addEventListener('click', editKeySettingsFromDesigner);
    dom.designerLayoutTab.addEventListener('click', () => setDesignerTab('layout'));
    dom.designerFunctionTab.addEventListener('click', () => setDesignerTab('functions'));
    dom.layoutOrderList.addEventListener('pointerdown', handleDesignerDragPointerDown);
    dom.layoutOrderList.addEventListener('click', handleOrderMoveClick);
    dom.layoutColumns.addEventListener('click', handleColumnControlClick);
    dom.functionKeyList.addEventListener('click', handleFunctionCellClick);
    dom.functionActionSelect.addEventListener('change', handleFunctionActionChange);
    dom.functionShortcutButton.addEventListener('click', beginFunctionShortcutCapture);
    dom.functionEditorClose.addEventListener('click', closeFunctionEditor);
    dom.addCustomKeyButton.addEventListener('click', addCustomKey);
    dom.defaultKeyVisibility.addEventListener('click', handleVisibilityClick);
    dom.customKeyList.addEventListener('input', (event) => {
      const input = event.target.closest('[data-custom-label-id]');
      if (input) updateCustomKeyDraft(input);
    });
    dom.customKeyList.addEventListener('click', handleCustomKeyClick);
    window.addEventListener('message', handlePreviewMessage);
    dom.closeConfigButton.addEventListener('click', requestCloseConfigDrawer);
    dom.drawerBackdrop.addEventListener('click', requestCloseConfigDrawer);
    dom.configList.addEventListener('input', handleConfigInput);
    dom.configList.addEventListener('change', handleConfigActionChange);
    dom.configList.addEventListener('click', handleConfigActionClick);
    dom.voiceTriggerSelect.addEventListener('change', () => {
      if (!state.draft) return;
      state.draft.voiceTrigger = dom.voiceTriggerSelect.value;
      markConfigDirty();
    });
    dom.saveConfigButton.addEventListener('click', saveConfig);
    dom.revertConfigButton.addEventListener('click', revertConfig);
    document.addEventListener('keydown', handleDrawerKeydown);
    document.addEventListener('keydown', handleDesignerKeydown);

    dom.voiceHistory.addEventListener('click', handleVoiceHistoryClick);
    dom.autoplayToggle.addEventListener('click', toggleAutoplay);
    dom.clearFeedButton.addEventListener('click', clearFeed);

    dom.copyUrlButton.addEventListener('click', () => {
      copyText(state.connectEndpoint?.primaryUrl, '已复制手机端地址');
    });
    dom.refreshConnectInfoButton.addEventListener('click', () => {
      showToast('正在刷新连接地址…');
      void loadConnectInfo();
    });
    dom.connectAddressSelect.addEventListener('change', () => {
      const endpoints = state.connectInfo?.endpoints || [];
      const endpoint = endpoints[Number(dom.connectAddressSelect.value)];
      if (!endpoint) return;
      applyConnectEndpoint(state.connectInfo, endpoint);
      showToast(`正在使用 ${endpoint.bluetooth ? '蓝牙网络' : endpoint.label} · ${endpoint.address}`);
    });
    dom.copyHttpButton.addEventListener('click', () => {
      const httpUrl = state.connectEndpoint?.urls
        ?.find((item) => item.protocol === 'http')?.url;
      copyText(httpUrl, '已复制 HTTP 地址');
    });
    dom.toggleHttpButton.addEventListener('click', () => {
      const expanded = dom.toggleHttpButton.getAttribute('aria-expanded') === 'true';
      dom.toggleHttpButton.setAttribute('aria-expanded', String(!expanded));
      dom.toggleHttpButton.textContent = expanded ? 'HTTP 备用地址' : '收起 HTTP 地址';
      dom.httpRow.hidden = expanded;
    });
    dom.systemEnableButton.addEventListener('click', toggleSystemBridge);
    dom.requestAccessButton.addEventListener('click', () => {
      if (!sendJson({ type: 'system-request-accessibility' })) {
        showToast('服务未连接，无法请求权限', true);
        return;
      }
      showToast('已请求辅助功能权限，请在系统设置中允许本机桥接');
      clearInterval(state.systemAccessPollTimer);
      let polls = 0;
      state.systemAccessPollTimer = setInterval(() => {
        polls += 1;
        sendJson({ type: 'system-refresh' });
        if (polls >= 10) {
          clearInterval(state.systemAccessPollTimer);
          state.systemAccessPollTimer = null;
        }
      }, 2500);
      setTimeout(() => sendJson({ type: 'system-refresh' }), 1000);
    });
    dom.refreshSystemButton.addEventListener('click', () => {
      if (!sendJson({ type: 'system-refresh' })) {
        showToast('服务未连接', true);
      } else {
        showToast('正在重新检测系统桥接');
      }
    });
    dom.systemDeviceSelect.addEventListener('change', () => {
      const device = dom.systemDeviceSelect.value;
      if (!device) return;
      if (!sendJson({ type: 'system-select-device', device })) {
        showToast('服务未连接', true);
      } else {
        showToast('正在切换虚拟声卡…');
      }
    });
    dom.copyBlackholeCommand.addEventListener('click', () => {
      copyText('brew install blackhole-2ch', '已复制 BlackHole 安装命令');
    });
    dom.copyCoreaudiodCommand.addEventListener('click', () => {
      copyText('sudo killall coreaudiod', '已复制重启音频服务命令');
    });
    dom.copyDoubaoCommand.addEventListener('click', () => {
      copyText('brew install --cask doubaoime', '已复制豆包输入法安装命令');
    });
    dom.redetectAudioButton.addEventListener('click', () => {
      if (!sendJson({ type: 'system-refresh' })) {
        showToast('服务未连接', true);
      } else {
        showToast('正在重新检测虚拟声卡');
      }
    });
    dom.openAccessibilityButton.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/system/open-accessibility', {
          method: 'POST',
          headers: { 'X-Bridge-Token': state.token }
        });
        if (!response.ok) throw new Error();
      } catch {
        showToast('无法打开辅助功能设置', true);
      }
    });
    dom.openConnectButton.addEventListener('click', () => {
      dom.connectPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dom.connectPanel.classList.remove('is-highlighted');
      void dom.connectPanel.offsetWidth;
      dom.connectPanel.classList.add('is-highlighted');
      clearTimeout(connectHighlightTimer);
      connectHighlightTimer = setTimeout(() => {
        dom.connectPanel.classList.remove('is-highlighted');
      }, 1300);
    });

    window.addEventListener('pagehide', () => {
      state.closing = true;
      clearTimeout(state.reconnectTimer);
      if (state.audio) {
        state.audio.pause();
        state.audio.src = '';
      }
      for (const entry of state.voices.values()) {
        if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      }
      try {
        state.ws?.close();
      } catch {
        // The page is going away.
      }
    });

    window.addEventListener('online', () => {
      if (!state.wsOpen) connect();
    });
  }

  function toggleAutoplay() {
    state.autoplay = !state.autoplay;
    updateAutoplayButton();
    try {
      localStorage.setItem('remoteBridge.autoplay', state.autoplay ? '1' : '0');
    } catch {
      // Local storage may be unavailable in private browsing contexts.
    }
    showToast(state.autoplay ? '自动播放已开启' : '自动播放已关闭');
  }

  function updateAutoplayButton() {
    dom.autoplayToggle.setAttribute('aria-pressed', String(state.autoplay));
  }

  function readAutoplayPreference() {
    try {
      return localStorage.getItem('remoteBridge.autoplay') === '1';
    } catch {
      return false;
    }
  }

  function updateClock() {
    dom.liveClock.textContent = formatClock(Date.now());
  }

  function showToast(text, isError = false) {
    dom.pcToast.textContent = text;
    dom.pcToast.classList.toggle('is-error', Boolean(isError));
    dom.pcToast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.pcToast.classList.remove('is-visible');
    }, 2400);
  }

  function normalizeHiddenKeys(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const id of value) {
      if (typeof id !== 'string' || !KEY_ORDER.includes(id) || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  function normalizeCustomKeys(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const entry of value) {
      if (result.length >= MAX_CUSTOM_KEYS) break;
      if (
        !entry
        || typeof entry !== 'object'
        || typeof entry.id !== 'string'
        || !CUSTOM_KEY_ID_PATTERN.test(entry.id)
        || KEY_ORDER.includes(entry.id)
        || seen.has(entry.id)
      ) {
        continue;
      }
      const label = cleanDisplayText(entry.label, 24);
      if (!label) continue;
      const meaning = cleanDisplayText(entry.meaning, 160) || '自定义快捷键';
      const action = normalizeClientAction(entry.action, { type: 'none' });
      const doubleAction = normalizeOptionalClientAction(entry.doubleAction);
      const longAction = normalizeOptionalClientAction(entry.longAction);
      seen.add(entry.id);
      result.push({ id: entry.id, label, meaning, action, doubleAction, longAction });
    }
    return result;
  }

  function defaultPhoneLayout(customKeys = []) {
    const customIds = (Array.isArray(customKeys) ? customKeys : [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === 'string' && id);
    return {
      columns: DEFAULT_LAYOUT_COLUMNS,
      order: [...DEFAULT_LAYOUT_ORDER, ...customIds]
    };
  }

  function normalizePhoneLayout(layout, customKeys = []) {
    const customIds = (Array.isArray(customKeys) ? customKeys : [])
      .map((entry) => entry?.id)
      .filter((id) => typeof id === 'string' && id);
    const required = [...DEFAULT_LAYOUT_ORDER, ...customIds];
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
      candidate = [...DEFAULT_LAYOUT_ORDER, ...customIds];
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

  function fallbackConfig() {
    return {
      version: 1,
      revision: 0,
      updatedAt: null,
      voiceTrigger: 'fn',
      audioDevice: '',
      layout: defaultPhoneLayout(),
      customKeys: [],
      hiddenKeys: [...DEFAULT_HIDDEN_KEYS],
      keys: clone(FALLBACK_KEYS)
    };
  }

  function normalizeClientConfig(config) {
    const normalized = fallbackConfig();
    if (!config || typeof config !== 'object') return normalized;
    normalized.revision = Number.isInteger(config.revision) ? config.revision : 0;
    normalized.updatedAt = typeof config.updatedAt === 'string' ? config.updatedAt : null;
    normalized.audioDevice = typeof config.audioDevice === 'string' ? config.audioDevice : '';
    if (['fn', 'rightOption', 'rightCommand', 'none'].includes(config.voiceTrigger)) {
      normalized.voiceTrigger = config.voiceTrigger;
    }
    normalized.customKeys = normalizeCustomKeys(config.customKeys);
    normalized.layout = normalizePhoneLayout(config.layout, normalized.customKeys);
    normalized.hiddenKeys = normalizeHiddenKeys(config.hiddenKeys);
    if (config.keys && typeof config.keys === 'object') {
      for (const id of KEY_ORDER) {
        const entry = config.keys[id];
        if (!entry || typeof entry !== 'object') continue;
        const label = cleanDisplayText(entry.label, 24);
        const meaning = cleanDisplayText(entry.meaning, 160);
        if (label) normalized.keys[id].label = label;
        if (meaning) normalized.keys[id].meaning = meaning;
        normalized.keys[id].action = normalizeClientAction(
          entry.action,
          defaultActionForKey(id)
        );
        normalized.keys[id].doubleAction = normalizeOptionalClientAction(entry.doubleAction);
        normalized.keys[id].longAction = normalizeOptionalClientAction(entry.longAction);
      }
    }
    return normalized;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildWavBlob(chunks, sampleRate, channels) {
    const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeString = (offset, text) => {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, byteLength, true);

    return new Blob([header, ...chunks], { type: 'audio/wav' });
  }

  function cleanDisplayText(value, maxLength, collapseWhitespace = true) {
    if (typeof value !== 'string') return '';
    const text = collapseWhitespace
      ? value.replace(/\s+/g, ' ').trim()
      : value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    return Array.from(text).slice(0, maxLength).join('');
  }

  function truncate(text, maxLength) {
    const chars = Array.from(typeof text === 'string' ? text : '');
    return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}…` : chars.join('');
  }

  function formatClock(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatShortTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDuration(ms) {
    if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return '—';
    const seconds = Math.max(1, Math.round(Number(ms) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isValidVoiceId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  }
})();
