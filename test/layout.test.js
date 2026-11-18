'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_LAYOUT_ORDER,
  normalizeLayout,
  normalizeStoredConfig
} = require('../lib/default-config');

const CUSTOM_KEYS = [
  { id: 'custom_shot01', label: '截图', meaning: '自定义快捷键', action: { type: 'none' } }
];

test('default layout covers every default key', () => {
  const stored = normalizeStoredConfig({});
  assert.deepEqual(stored.layout.order, [...DEFAULT_LAYOUT_ORDER]);
  assert.equal(stored.layout.columns, 2);
  assert.equal(new Set(stored.layout.order).size, 14);
});

test('legacy left/right layouts migrate into the full order', () => {
  const stored = normalizeStoredConfig({
    layout: {
      left: ['voice', 'home', 'menu', 'back'],
      right: ['mute', 'delete']
    },
    customKeys: CUSTOM_KEYS
  });

  assert.deepEqual(stored.layout.order, [
    'power', 'up', 'left', 'down', 'right', 'ok',
    'voice', 'home', 'menu', 'back',
    'volup', 'voldown', 'mute', 'delete', 'custom_shot01'
  ]);
  assert.equal(stored.layout.columns, 2);
});

test('order layouts can place custom keys anywhere in the grid', () => {
  const order = [
    'custom_shot01', 'up', 'down', 'left', 'right', 'ok',
    'power', 'home', 'menu', 'voice',
    'volup', 'voldown', 'mute', 'delete', 'back'
  ];
  const normalized = normalizeLayout({ columns: 4, order }, CUSTOM_KEYS, true);
  assert.deepEqual(normalized.order, order);
  assert.equal(normalized.columns, 4);
});

test('strict normalization rejects incomplete, duplicate, or unknown layouts', () => {
  assert.throws(
    () => normalizeLayout({ order: ['power'] }, [], true),
    /必须包含所有/
  );
  assert.throws(
    () => normalizeLayout({ order: ['power', 'power'] }, ['back'], true),
    /必须包含所有/
  );
  assert.throws(
    () => normalizeLayout({
      order: [...DEFAULT_LAYOUT_ORDER.slice(0, 13), 'not-a-key']
    }, [], true),
    /未知按键/
  );
});

test('stored configs heal missing or stale order entries', () => {
  const stored = normalizeStoredConfig({
    layout: { order: ['power', 'ghost_key', 'power'] },
    customKeys: CUSTOM_KEYS
  });
  assert.equal(stored.layout.order.length, 15);
  assert.equal(new Set(stored.layout.order).size, 15);
  assert.equal(stored.layout.columns, 2);
  assert.equal(stored.layout.order[0], 'power');
  assert.ok(!stored.layout.order.includes('ghost_key'));
  assert.ok(stored.layout.order.includes('custom_shot01'));
});
