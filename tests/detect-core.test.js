import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMerge, isColorGlyph, isWidthAnomaly, parseUA } from '../lib/detect-core.js';

test('合并宽度分类：单字形', () => {
  assert.equal(classifyMerge(36, [36, 36]), 'merged');
  assert.equal(classifyMerge(36, [36, 36, 36]), 'merged');
});

test('合并宽度分类：被拆分', () => {
  assert.equal(classifyMerge(72, [36, 36]), 'split');
  assert.equal(classifyMerge(108, [36, 36, 36]), 'split');
});

test('合并宽度分类：不确定区间', () => {
  const r = classifyMerge(58, [36, 36]); // ratio ≈ 0.81
  assert.equal(r, 'uncertain');
});

test('合并宽度分类：异常输入', () => {
  assert.equal(classifyMerge(0, [36, 36]), 'unknown');
  assert.equal(classifyMerge(36, []), 'unknown');
  assert.equal(classifyMerge(36, [36]), 'unknown');
});

test('彩色字形判定', () => {
  assert.ok(isColorGlyph(0.5));
  assert.ok(!isColorGlyph(0.001));
});

test('宽度异常判定', () => {
  assert.ok(isWidthAnomaly(5, 36));
  assert.ok(isWidthAnomaly(200, 36));
  assert.ok(!isWidthAnomaly(36, 36));
  assert.ok(!isWidthAnomaly(0, 36));
});

test('UA 解析', () => {
  const chrome = parseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  assert.equal(chrome.browser, 'Chrome 120');
  assert.equal(chrome.os, 'Windows 10/11');
  const safari = parseUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
  assert.equal(safari.browser, 'Safari 17');
  assert.equal(safari.os, 'iOS');
  const unknown = parseUA('');
  assert.equal(unknown.browser, '未知浏览器');
});

test('analyzeEmoji / detectEnvironment：模拟 Canvas 冒烟', async () => {
  const { analyzeEmoji, detectEnvironment } = await import('../lib/detect-core.js');
  // 模拟：宽度按码点数线性增长；像素数据全透明（空渲染）
  const ctx = {
    canvas: { width: 256, height: 64 },
    font: '',
    textBaseline: '',
    fillStyle: '',
    clearRect() {},
    fillText() {},
    measureText(text) { return { width: [...text].length * 32 }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  };
  const env = detectEnvironment(ctx, 'Mozilla/5.0 Chrome/120.0');
  assert.equal(env.emojiFont, 'missing'); // 全透明 -> 签名 'empty'，与对照一致
  const r = analyzeEmoji(ctx, '👨‍👩‍👧', { baseChar: undefined, tofuSignature: env.tofuSignature });
  assert.equal(r.tofu, true);
  assert.ok(r.issues.length > 0);
  const r2 = analyzeEmoji(ctx, '👨‍👩‍👧', { tofuSignature: 'other-signature' });
  assert.equal(r2.tofu, false);
  assert.equal(r2.empty, true);
  assert.equal(r2.confidence, 'low');
});
