'use strict';

const { pinyin } = require('pinyin-pro');

const DEFAULT_MAX_LENGTH = 1500;

const PUNCTUATION_MAP = new Map([
  ['，', ','],
  ['。', '.'],
  ['！', '!'],
  ['？', '?'],
  ['；', ';'],
  ['：', ':'],
  ['、', ','],
  ['（', '('],
  ['）', ')'],
  ['【', '['],
  ['】', ']'],
  ['《', '<'],
  ['》', '>'],
  ['「', '"'],
  ['」', '"'],
  ['『', "'"],
  ['』', "'"],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['—', '-'],
  ['–', '-'],
  ['…', '...'],
  ['·', '.'],
  ['～', '~'],
  ['￥', '$']
]);

const KEEP_ASCII = /^[\x20-\x7e\n\t]$/;

function normalizeNonChinese(part) {
  let result = '';
  for (const character of part) {
    if (character === '\n' || character === '\t') {
      result += character;
      continue;
    }
    if (KEEP_ASCII.test(character)) {
      result += character;
      continue;
    }
    const mapped = PUNCTUATION_MAP.get(character);
    if (!mapped) continue;
    for (const candidate of mapped) {
      if (KEEP_ASCII.test(candidate)) result += candidate;
    }
  }
  return result;
}

/**
 * Converts Chinese text into tone-less pinyin key characters.
 *
 * The result is intentionally plain ASCII so it can be injected as normal
 * keyboard events and forwarded by remote-desktop tools such as RustDesk.
 * Chinese punctuation is mapped to its ASCII equivalent; emoji and other
 * unsupported symbols are dropped.
 */
function textToPinyin(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const maxLength = Number.isFinite(Number(options.maxLength))
    ? Math.max(1, Math.min(4000, Math.floor(Number(options.maxLength))))
    : DEFAULT_MAX_LENGTH;

  let parts;
  try {
    parts = pinyin(text, {
      toneType: 'none',
      type: 'array',
      nonZh: 'consecutive'
    });
  } catch {
    return '';
  }

  let result = '';
  for (const part of parts) {
    // pinyin-pro emits one lowercase syllable per Chinese character.
    if (/^[a-z]+$/.test(part)) {
      if (result && !/[\s([{<]$/.test(result)) result += ' ';
      result += part;
      continue;
    }

    const normalized = normalizeNonChinese(part).replace(/^ +/, '');
    if (!normalized) continue;

    if (/^[A-Za-z0-9]/.test(normalized)) {
      if (result && !/[\s([{<]$/.test(result)) result += ' ';
      result += normalized;
      continue;
    }

    // Punctuation and newlines attach without a leading space so each
    // Chinese syllable remains separated by exactly one space.
    result += normalized;
    if (result.length >= maxLength) break;
  }

  return result
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/ +([,.;:!?%)\]}>'"])/g, '$1')
    .replace(/([(\[{<]) +/g, '$1')
    .trim()
    .slice(0, maxLength)
    .trim();
}

module.exports = {
  DEFAULT_MAX_LENGTH,
  textToPinyin
};
