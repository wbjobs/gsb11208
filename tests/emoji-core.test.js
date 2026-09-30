import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCodePoints, codePointDetails, segmentGraphemes, fallbackSegmentGraphemes,
  flagToIsoCode, stripSkinTones, zwjComponents, matchesEntry, buildFallbackPlan,
  hasZWJ, hasSkinTone,
} from '../lib/emoji-core.js';

test('码点格式化', () => {
  assert.equal(formatCodePoints('😀'), 'U+1F600');
  assert.equal(formatCodePoints('✈️'), 'U+2708 U+FE0F');
  assert.equal(formatCodePoints('👨‍👩‍👧'), 'U+1F468 U+200D U+1F469 U+200D U+1F467');
  assert.equal(formatCodePoints('🇨🇳'), 'U+1F1E8 U+1F1F3');
});

test('码点分类标注', () => {
  const kinds = codePointDetails('👍🏽').map((d) => d.kind);
  assert.ok(kinds.includes('肤色修饰符'));
  const flagKinds = codePointDetails('🇨🇳').map((d) => d.kind);
  assert.ok(flagKinds.every((k) => k.includes('区域指示符')));
});

test('字素簇分割：ZWJ / 肤色 / 旗帜 / 键帽', () => {
  assert.deepEqual(segmentGraphemes('👨‍👩‍👧'), ['👨‍👩‍👧']);
  assert.deepEqual(segmentGraphemes('👍🏽'), ['👍🏽']);
  assert.deepEqual(segmentGraphemes('🇨🇳🇺🇸'), ['🇨🇳', '🇺🇸']);
  assert.deepEqual(segmentGraphemes('1️⃣'), ['1️⃣']);
  assert.deepEqual(segmentGraphemes('a👨‍👩‍👧b'), ['a', '👨‍👩‍👧', 'b']);
});

test('内置降级分割与 Intl.Segmenter 结果一致', () => {
  const samples = ['👨‍👩‍👧', '🇨🇳🇺🇸', '👍🏽x', '1️⃣2️⃣', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '❤️‍🔥'];
  for (const s of samples) {
    assert.deepEqual(fallbackSegmentGraphemes(s), segmentGraphemes(s), `mismatch: ${s}`);
  }
});

test('旗帜转 ISO 代码', () => {
  assert.equal(flagToIsoCode('🇨🇳'), 'CN');
  assert.equal(flagToIsoCode('🇺🇸'), 'US');
  assert.equal(flagToIsoCode('😀'), null);
});

test('肤色剥离与 ZWJ 拆分', () => {
  assert.equal(stripSkinTones('👍🏽'), '👍');
  assert.equal(stripSkinTones('🧑🏾'), '🧑');
  assert.deepEqual(zwjComponents('👨‍👩‍👧'), ['👨', '👩', '👧']);
  assert.ok(hasZWJ('👩‍💻'));
  assert.ok(hasSkinTone('👋🏿'));
  assert.ok(!hasSkinTone('👋'));
});

test('搜索匹配：名称 / 英文 / 关键词 / 码点 / 直接粘贴', () => {
  const entry = { emoji: '😀', name: '露齿笑脸', nameEn: 'grinning face', keywords: ['smile'] };
  assert.ok(matchesEntry(entry, '笑脸'));
  assert.ok(matchesEntry(entry, 'GRINNING'));
  assert.ok(matchesEntry(entry, 'smile'));
  assert.ok(matchesEntry(entry, 'u+1f600'));
  assert.ok(matchesEntry(entry, '😀'));
  assert.ok(!matchesEntry(entry, '火箭'));
  assert.ok(matchesEntry(entry, ''));
});

test('降级方案：豆腐块 → 名称+码点', () => {
  const plan = buildFallbackPlan({ emoji: '😀', name: '露齿笑脸' }, { tofu: true });
  assert.equal(plan.mode, 'degraded');
  assert.ok(plan.text.includes('U+1F600'));
  assert.ok(plan.text.includes('露齿笑脸'));
});

test('降级方案：旗帜 → ISO 代码', () => {
  const plan = buildFallbackPlan({ emoji: '🇨🇳', name: '旗帜: 中国' }, { flagUnsupported: true });
  assert.equal(plan.mode, 'degraded');
  assert.equal(plan.text, 'CN');
});

test('降级方案：肤色 → 基础 Emoji（语义一致）', () => {
  const plan = buildFallbackPlan({ emoji: '👍🏽', name: '点赞' }, { skinUnsupported: true });
  assert.equal(plan.mode, 'degraded');
  assert.equal(plan.text, '👍');
});

test('降级方案：ZWJ 拆分 → 成员组合', () => {
  const plan = buildFallbackPlan({ emoji: '👨‍👩‍👧', name: '家庭' }, { split: true });
  assert.equal(plan.mode, 'degraded');
  assert.equal(plan.text, '👨 + 👩 + 👧');
});

test('降级方案：变体选择符被忽略 → 基础字符', () => {
  const plan = buildFallbackPlan({ emoji: '✈️', name: '飞机' }, { vsIgnored: true });
  assert.equal(plan.mode, 'degraded');
  assert.equal(plan.text, '✈');
});

test('无异常时不降级', () => {
  const plan = buildFallbackPlan({ emoji: '😀', name: '笑脸' }, { tofu: false, split: false });
  assert.equal(plan.mode, 'native');
  assert.equal(plan.text, '😀');
});
