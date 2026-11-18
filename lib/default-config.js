'use strict';

const KEY_DEFINITIONS = Object.freeze([
  { id: 'power', label: '电源', meaning: '切换设备开关' },
  { id: 'voice', label: '语音', meaning: '按住说话，把语音发送到电脑' },
  { id: 'up', label: '上', meaning: '向上移动 / 切换上一个' },
  { id: 'down', label: '下', meaning: '向下移动 / 切换下一个' },
  { id: 'left', label: '左', meaning: '向左移动' },
  { id: 'right', label: '右', meaning: '向右移动' },
  { id: 'ok', label: '确认', meaning: '确认 / 播放或暂停' },
  { id: 'back', label: '返回', meaning: '返回上一级' },
  { id: 'home', label: '主页', meaning: '回到主页' },
  { id: 'menu', label: '菜单', meaning: '打开菜单' },
  { id: 'delete', label: '删除', meaning: '删除 / 退格' },
  { id: 'volup', label: '音量 +', meaning: '调高音量' },
  { id: 'voldown', label: '音量 −', meaning: '调低音量' },
  { id: 'mute', label: '静音', meaning: '切换静音状态' }
]);

const KEY_IDS = Object.freeze(KEY_DEFINITIONS.map((item) => item.id));
const KEY_ID_SET = new Set(KEY_IDS);

// The phone remote is a free grid. `order` lists every key in display order and
// `columns` controls how many keys fit on each row. Nothing is pinned to a
// fixed physical position.
const DEFAULT_LAYOUT_COLUMNS = 2;
const MIN_LAYOUT_COLUMNS = 2;
const MAX_LAYOUT_COLUMNS = 4;
const DEFAULT_LAYOUT_ORDER = Object.freeze([
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
]);
const DEFAULT_HIDDEN_KEYS = Object.freeze([
  'power',
  'home',
  'menu',
  'volup',
  'voldown',
  'mute'
]);

// Kept for callers that still reason about the six column positions. The
// layout is no longer restricted to these keys.
const MOVABLE_KEY_IDS = Object.freeze(['back', 'home', 'menu', 'voice', 'mute', 'delete']);
const MOVABLE_KEY_SET = new Set(MOVABLE_KEY_IDS);
const MAX_CUSTOM_KEYS = 8;
const CUSTOM_KEY_ID_PATTERN = /^custom_[A-Za-z0-9_-]{4,48}$/;

function defaultOrder(customKeys = []) {
  const customIds = Array.isArray(customKeys)
    ? customKeys.map((entry) => entry?.id).filter((id) => typeof id === 'string' && id)
    : [];
  return [...DEFAULT_LAYOUT_ORDER, ...customIds];
}

function defaultLayout(customKeys = []) {
  return {
    columns: DEFAULT_LAYOUT_COLUMNS,
    order: defaultOrder(customKeys)
  };
}

function normalizeLayoutColumns(value, strict = false) {
  if (value === undefined || value === null) return DEFAULT_LAYOUT_COLUMNS;
  const columns = Number(value);
  if (
    Number.isInteger(columns)
    && columns >= MIN_LAYOUT_COLUMNS
    && columns <= MAX_LAYOUT_COLUMNS
  ) {
    return columns;
  }
  if (strict) throw new Error('每行按键数必须为 2 到 4');
  return DEFAULT_LAYOUT_COLUMNS;
}

/**
 * Accepts both the legacy `{ left, right }` shape and the current
 * `{ order }` shape, then returns a complete `{ order }` permutation of the
 * default keys plus every custom key.
 */
function normalizeLayout(value, customKeys = [], strict = false) {
  const customIds = Array.isArray(customKeys)
    ? customKeys.map((entry) => entry?.id).filter((id) => typeof id === 'string' && id)
    : [];
  const required = [...DEFAULT_LAYOUT_ORDER, ...customIds];
  const requiredSet = new Set(required);
  const columns = normalizeLayoutColumns(value?.columns, strict);

  let order = null;

  if (value && typeof value === 'object' && Array.isArray(value.order)) {
    order = value.order;
  } else if (
    value
    && typeof value === 'object'
    && Array.isArray(value.left)
    && Array.isArray(value.right)
  ) {
    const movable = [...value.left, ...value.right];
    if (
      value.left.length === 4
      && value.right.length === 2
      && new Set(movable).size === MOVABLE_KEY_IDS.length
      && movable.every((id) => MOVABLE_KEY_SET.has(id))
    ) {
      // Legacy layout only described the six column positions. Keep the other
      // positions at their defaults and append custom keys to the tray.
      order = [...DEFAULT_LAYOUT_ORDER, ...customIds];
      order[6] = value.left[0];
      order[7] = value.left[1];
      order[8] = value.left[2];
      order[9] = value.left[3];
      order[12] = value.right[0];
      order[13] = value.right[1];
    } else if (strict) {
      throw new Error('按键布局必须完整包含且仅包含可移动按键');
    }
  } else if (value !== undefined && value !== null && strict) {
    throw new Error('按键布局格式无效');
  }

  if (!order) order = [];

  if (strict) {
    if (order.length !== required.length) {
      throw new Error('按键布局必须包含所有默认按键与自定义按键');
    }
    const seen = new Set();
    for (const id of order) {
      if (typeof id !== 'string' || !requiredSet.has(id)) {
        throw new Error('按键布局包含未知按键');
      }
      if (seen.has(id)) throw new Error('按键布局包含重复按键');
      seen.add(id);
    }
    return { columns, order: [...order] };
  }

  const result = [];
  const seen = new Set();
  for (const id of order) {
    if (typeof id !== 'string' || !requiredSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  for (const id of required) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return { columns, order: result };
}

const ACTION_MODIFIERS = Object.freeze(['control', 'option', 'shift', 'cmd', 'fn']);
const MEDIA_COMMANDS = Object.freeze([
  'volumeUp',
  'volumeDown',
  'mute',
  'playPause',
  'nextTrack',
  'previousTrack'
]);
const VOICE_TRIGGERS = Object.freeze(['fn', 'rightOption', 'rightCommand', 'rightControl', 'none', 'custom']);

const KEY_CODES = Object.freeze([
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'NumpadEnter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  ...Array.from({ length: 20 }, (_, index) => `F${index + 1}`),
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
  'Backquote'
]);
const KEY_CODE_SET = new Set(KEY_CODES);

const LIMITS = Object.freeze({
  label: 24,
  meaning: 160,
  transcript: 4000,
  voiceMime: 120,
  fileName: 160,
  voiceId: 64,
  audioDevice: 160
});

function keyAction(code, modifiers = []) {
  return { type: 'keys', code, modifiers };
}

function defaultActionForKey(id) {
  switch (id) {
    case 'up':
      return keyAction('ArrowUp');
    case 'down':
      return keyAction('ArrowDown');
    case 'left':
      return keyAction('ArrowLeft');
    case 'right':
      return keyAction('ArrowRight');
    case 'ok':
      return keyAction('Enter');
    case 'back':
      return keyAction('Escape');
    case 'delete':
      return keyAction('Backspace');
    case 'volup':
      return { type: 'media', command: 'volumeUp' };
    case 'voldown':
      return { type: 'media', command: 'volumeDown' };
    case 'mute':
      return { type: 'media', command: 'mute' };
    default:
      return { type: 'none' };
  }
}

function defaultConfig() {
  return {
    version: 1,
    revision: 1,
    updatedAt: null,
    voiceTrigger: 'fn',
    voiceTriggerShortcut: null,
    audioDevice: '',
    layout: defaultLayout(),
    customKeys: [],
    hiddenKeys: [...DEFAULT_HIDDEN_KEYS],
    keys: Object.fromEntries(
      KEY_DEFINITIONS.map(({ id, label, meaning }) => [
        id,
        {
          label,
          meaning,
          action: defaultActionForKey(id),
          doubleAction: null,
          longAction: null
        }
      ])
    )
  };
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeModifiers(value, strict = false) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error('快捷键修饰键格式无效');
    return [];
  }
  const unique = new Set();
  for (const modifier of value) {
    if (!ACTION_MODIFIERS.includes(modifier)) {
      if (strict) throw new Error(`不支持的修饰键：${modifier}`);
      continue;
    }
    unique.add(modifier);
  }
  return ACTION_MODIFIERS.filter((modifier) => unique.has(modifier));
}

function normalizeOptionalAction(value, strict = false) {
  if (value === undefined || value === null) return null;
  return normalizeAction(value, null, strict);
}

function normalizeVoiceTriggerShortcut(value, strict = false) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'object'
    || value.type !== 'keys'
    || typeof value.code !== 'string'
    || !KEY_CODE_SET.has(value.code)
  ) {
    if (strict) throw new Error('语音触发快捷键无效');
    return null;
  }
  return {
    type: 'keys',
    code: value.code,
    modifiers: normalizeModifiers(value.modifiers, strict)
  };
}

function normalizeAction(value, fallback, strict = false) {
  if (value === undefined || value === null) {
    return fallback ? structuredClone(fallback) : null;
  }
  if (typeof value !== 'object' || typeof value.type !== 'string') {
    if (strict) throw new Error('按键动作格式无效');
    return structuredClone(fallback);
  }

  if (value.type === 'none') return { type: 'none' };
  if (value.type === 'focusInput') return { type: 'focusInput' };

  if (value.type === 'media') {
    if (!MEDIA_COMMANDS.includes(value.command)) {
      if (strict) throw new Error('不支持的媒体动作');
      return structuredClone(fallback);
    }
    return { type: 'media', command: value.command };
  }

  if (value.type === 'keys') {
    if (typeof value.code !== 'string' || !KEY_CODE_SET.has(value.code)) {
      if (strict) throw new Error('不支持的快捷键代码');
      return structuredClone(fallback);
    }
    return {
      type: 'keys',
      code: value.code,
      modifiers: normalizeModifiers(value.modifiers, strict)
    };
  }

  if (strict) throw new Error('不支持的按键动作类型');
  return structuredClone(fallback);
}

function normalizeVoiceTrigger(value, strict = false) {
  if (value === undefined) return 'fn';
  if (VOICE_TRIGGERS.includes(value)) return value;
  if (strict) throw new Error('不支持的语音触发方式');
  return 'fn';
}

function normalizeHiddenKeys(value, strict = false) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error('隐藏按键格式无效');
    return [];
  }
  const result = [];
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== 'string' || !KEY_ID_SET.has(id) || seen.has(id)) {
      if (strict) throw new Error('隐藏按键列表包含无效按键');
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeCustomKeys(value, strict = false) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new Error('自定义按键格式无效');
    return [];
  }
  if (strict && value.length > MAX_CUSTOM_KEYS) {
    throw new Error(`最多只能添加 ${MAX_CUSTOM_KEYS} 个自定义按键`);
  }

  const result = [];
  const seen = new Set();
  for (const entry of value) {
    if (result.length >= MAX_CUSTOM_KEYS) break;
    if (
      !entry
      || typeof entry !== 'object'
      || typeof entry.id !== 'string'
      || !CUSTOM_KEY_ID_PATTERN.test(entry.id)
      || KEY_ID_SET.has(entry.id)
      || seen.has(entry.id)
    ) {
      if (strict) throw new Error('自定义按键 ID 无效或重复');
      continue;
    }
    const label = cleanText(entry.label, LIMITS.label);
    if (!label) {
      if (strict) throw new Error('自定义按键名称不能为空');
      continue;
    }
    const meaning = cleanText(entry.meaning, LIMITS.meaning) || '自定义快捷键';
    const action = normalizeAction(entry.action, { type: 'none' }, strict);
    const doubleAction = normalizeOptionalAction(entry.doubleAction, strict);
    const longAction = normalizeOptionalAction(entry.longAction, strict);
    seen.add(entry.id);
    result.push({ id: entry.id, label, meaning, action, doubleAction, longAction });
  }
  return result;
}

/**
 * Normalizes a config loaded from disk. Invalid entries fall back to defaults so
 * a partially corrupt config can never stop the server from starting.
 */
function normalizeStoredConfig(raw) {
  const config = defaultConfig();
  if (!raw || typeof raw !== 'object') return config;

  config.voiceTrigger = normalizeVoiceTrigger(raw.voiceTrigger, false);
  config.voiceTriggerShortcut = normalizeVoiceTriggerShortcut(raw.voiceTriggerShortcut, false);
  if (config.voiceTrigger === 'custom' && !config.voiceTriggerShortcut) {
    config.voiceTrigger = 'fn';
  }
  config.audioDevice = cleanText(raw.audioDevice, LIMITS.audioDevice);
  config.customKeys = normalizeCustomKeys(raw.customKeys, false);
  config.layout = normalizeLayout(raw.layout, config.customKeys, false);
  config.hiddenKeys = normalizeHiddenKeys(raw.hiddenKeys, false);

  for (const { id } of KEY_DEFINITIONS) {
    const entry = raw.keys && typeof raw.keys === 'object' ? raw.keys[id] : null;
    if (!entry || typeof entry !== 'object') continue;
    const label = cleanText(entry.label, LIMITS.label);
    const meaning = cleanText(entry.meaning, LIMITS.meaning);
    if (label) config.keys[id].label = label;
    if (meaning) config.keys[id].meaning = meaning;
    config.keys[id].action = normalizeAction(
      entry.action,
      config.keys[id].action,
      false
    );
    config.keys[id].doubleAction = normalizeOptionalAction(entry.doubleAction, false);
    config.keys[id].longAction = normalizeOptionalAction(entry.longAction, false);
  }

  if (Number.isInteger(raw.revision) && raw.revision > 0) {
    config.revision = raw.revision;
  }
  if (typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))) {
    config.updatedAt = raw.updatedAt;
  }
  return config;
}

/**
 * Normalizes a config received from a PC. Missing keys keep their current
 * values, while malformed or empty values are rejected instead of silently
 * overwriting a user's mapping.
 */
function normalizeConfigUpdate(input, current) {
  if (!input || typeof input !== 'object' || !input.keys || typeof input.keys !== 'object') {
    throw new Error('配置格式无效');
  }

  const base = current && current.keys ? current : defaultConfig();
  const keys = {};

  for (const { id, label, meaning } of KEY_DEFINITIONS) {
    const source = Object.prototype.hasOwnProperty.call(input.keys, id)
      ? input.keys[id]
      : base.keys[id];
    if (!source || typeof source !== 'object') {
      throw new Error(`按键 ${id} 的配置无效`);
    }

    const nextLabel = cleanText(source.label, LIMITS.label);
    const nextMeaning = cleanText(source.meaning, LIMITS.meaning);
    if (!nextLabel) throw new Error(`按键 ${id} 的名称不能为空`);
    if (!nextMeaning) throw new Error(`按键 ${id} 的含义不能为空`);

    const fallbackAction = base.keys[id]?.action || defaultActionForKey(id);
    const baseEntry = base.keys[id] || {};
    const action = normalizeAction(source.action, fallbackAction, true);
    const doubleAction = Object.prototype.hasOwnProperty.call(source, 'doubleAction')
      ? normalizeOptionalAction(source.doubleAction, true)
      : (baseEntry.doubleAction || null);
    const longAction = Object.prototype.hasOwnProperty.call(source, 'longAction')
      ? normalizeOptionalAction(source.longAction, true)
      : (baseEntry.longAction || null);

    if (id === 'voice') {
      // The voice key drives a dedicated push-to-talk session. It should not
      // also inject an arbitrary keyboard action.
      keys[id] = {
        label: nextLabel,
        meaning: nextMeaning,
        action: { type: 'none' },
        doubleAction: null,
        longAction: null
      };
      continue;
    }

    keys[id] = {
      label: nextLabel || label,
      meaning: nextMeaning || meaning,
      action,
      doubleAction,
      longAction
    };
  }

  const voiceTrigger = normalizeVoiceTrigger(
    input.voiceTrigger === undefined ? base.voiceTrigger : input.voiceTrigger,
    true
  );
  const voiceTriggerShortcut = normalizeVoiceTriggerShortcut(
    input.voiceTriggerShortcut === undefined
      ? base.voiceTriggerShortcut
      : input.voiceTriggerShortcut,
    true
  );
  if (voiceTrigger === 'custom' && !voiceTriggerShortcut) {
    throw new Error('请先录制自定义语音触发键');
  }
  const audioDevice = cleanText(
    input.audioDevice === undefined ? base.audioDevice : input.audioDevice,
    LIMITS.audioDevice
  );
  const customKeys = normalizeCustomKeys(
    input.customKeys === undefined ? base.customKeys : input.customKeys,
    true
  );
  const layoutInput = input.layout === undefined
    ? normalizeLayout(base.layout, customKeys, false)
    : input.layout;
  const layout = normalizeLayout(layoutInput, customKeys, true);
  const hiddenKeys = normalizeHiddenKeys(
    input.hiddenKeys === undefined ? base.hiddenKeys : input.hiddenKeys,
    true
  );

  return {
    version: 1,
    revision: 1,
    updatedAt: null,
    voiceTrigger,
    voiceTriggerShortcut,
    audioDevice,
    layout,
    customKeys,
    hiddenKeys,
    keys
  };
}

module.exports = {
  ACTION_MODIFIERS,
  KEY_CODE_SET,
  KEY_CODES,
  KEY_DEFINITIONS,
  DEFAULT_HIDDEN_KEYS,
  DEFAULT_LAYOUT_COLUMNS,
  DEFAULT_LAYOUT_ORDER,
  KEY_IDS,
  KEY_ID_SET,
  MAX_CUSTOM_KEYS,
  MAX_LAYOUT_COLUMNS,
  MIN_LAYOUT_COLUMNS,
  MOVABLE_KEY_IDS,
  LIMITS,
  MEDIA_COMMANDS,
  VOICE_TRIGGERS,
  cleanText,
  defaultActionForKey,
  defaultConfig,
  defaultLayout,
  normalizeLayout,
  normalizeAction,
  normalizeConfigUpdate,
  normalizeCustomKeys,
  normalizeHiddenKeys,
  normalizeStoredConfig,
  normalizeVoiceTriggerShortcut
};
