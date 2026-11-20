'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { textToPinyin } = require('../lib/pinyin');

test('converts Chinese text into space-separated tone-less pinyin', () => {
  assert.equal(textToPinyin('你好世界'), 'ni hao shi jie');
  assert.equal(textToPinyin('打开微信'), 'da kai wei xin');
  assert.equal(textToPinyin('重庆银行'), 'chong qing yin hang');
});

test('keeps ASCII words and maps Chinese punctuation', () => {
  assert.equal(textToPinyin('你好，世界！'), 'ni hao, shi jie!');
  assert.equal(textToPinyin('打开 RustDesk'), 'da kai RustDesk');
  assert.equal(textToPinyin('“测试”。《标题》'), '" ce shi".<biao ti>');
});

test('drops emoji and unsupported symbols', () => {
  assert.equal(textToPinyin('测试😀完成'), 'ce shi wan cheng');
  assert.equal(textToPinyin('你好✅'), 'ni hao');
});

test('returns an empty string for empty or non-text input', () => {
  assert.equal(textToPinyin(''), '');
  assert.equal(textToPinyin('   '), '');
  assert.equal(textToPinyin(null), '');
  assert.equal(textToPinyin(42), '');
});

test('limits the converted output length', () => {
  const result = textToPinyin('你好世界'.repeat(100), { maxLength: 20 });
  assert.equal(result.length, 20);
  assert.equal(result, 'ni hao shi jie ni ha');
});
