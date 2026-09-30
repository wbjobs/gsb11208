import test from 'node:test';
import assert from 'node:assert/strict';
import { EMOJI_DATA } from '../lib/emoji-data.js';
import { CATEGORY_LABELS, segmentGraphemes, hasZWJ, hasSkinTone } from '../lib/emoji-core.js';

test('数据集 ID 唯一且字段完整', () => {
  const ids = new Set();
  for (const e of EMOJI_DATA) {
    assert.ok(e.id && !ids.has(e.id), `重复或缺失 id: ${e.id}`);
    ids.add(e.id);
    assert.ok(e.emoji && e.name && e.nameEn, `字段缺失: ${e.id}`);
    assert.ok(CATEGORY_LABELS[e.category], `未知分类: ${e.id} -> ${e.category}`);
    assert.ok(Array.isArray(e.keywords), `keywords 缺失: ${e.id}`);
  }
});

test('每个条目是单个字素簇', () => {
  for (const e of EMOJI_DATA) {
    const clusters = segmentGraphemes(e.emoji);
    assert.equal(clusters.length, 1, `${e.id} 不是单个字素簇: ${clusters}`);
  }
});

test('分类与序列结构一致', () => {
  for (const e of EMOJI_DATA) {
    if (e.category === 'zwj') assert.ok(hasZWJ(e.emoji), `${e.id} 应包含 ZWJ`);
    if (e.category === 'skin') assert.ok(hasSkinTone(e.emoji), `${e.id} 应包含肤色修饰符`);
    if (e.category === 'variant' && e.baseChar) {
      assert.ok(e.emoji.includes(e.baseChar), `${e.id} 应包含基础字符`);
    }
  }
});

test('分类覆盖完整', () => {
  const cats = new Set(EMOJI_DATA.map((e) => e.category));
  for (const c of Object.keys(CATEGORY_LABELS)) {
    assert.ok(cats.has(c), `缺少分类样本: ${c}`);
  }
});
