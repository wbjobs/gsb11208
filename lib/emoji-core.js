// 纯逻辑模块：不依赖 DOM / Canvas，可在页面、Web Worker、Node 测试中共用。

export const ZWJ = '‍';
export const VS15 = '︎';
export const VS16 = '️';
export const SKIN_TONES = ['🏻', '🏼', '🏽', '🏾', '🏿'];

export function codePointsOf(str) {
  return [...str].map((ch) => ch.codePointAt(0));
}

export function formatCodePoints(str) {
  return codePointsOf(str)
    .map((cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'))
    .join(' ');
}

export function codePointDetails(str) {
  return [...str].map((ch) => {
    const cp = ch.codePointAt(0);
    return {
      char: ch,
      hex: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
      cp,
      kind: classifyCodePoint(cp),
    };
  });
}

export function classifyCodePoint(cp) {
  if (cp === 0x200d) return 'ZWJ';
  if (cp === 0xfe0f) return 'VS16 表情变体选择符';
  if (cp === 0xfe0e) return 'VS15 文本变体选择符';
  if (cp >= 0xfe00 && cp <= 0xfe0f) return '变体选择符';
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return '肤色修饰符';
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return '区域指示符(旗帜)';
  if (cp === 0x20e3) return '键帽组合符';
  if (cp >= 0xe0020 && cp <= 0xe007f) return '标签字符(细分旗帜)';
  if (cp >= 0x1f000) return '表情符号(补充平面)';
  return '基础字符';
}

export function isRegionalIndicator(cp) {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

export function isSkinTone(cp) {
  return cp >= 0x1f3fb && cp <= 0x1f3ff;
}

export function isTagChar(cp) {
  return cp >= 0xe0020 && cp <= 0xe007f;
}

// 从旗帜序列提取 ISO 两字母代码，如 🇨🇳 -> "CN"。
export function flagToIsoCode(str) {
  const cps = codePointsOf(str);
  if (cps.length === 2 && cps.every(isRegionalIndicator)) {
    return cps.map((cp) => String.fromCharCode(0x41 + (cp - 0x1f1e6))).join('');
  }
  return null;
}

// 去掉肤色修饰符，得到语义等价的基础 Emoji。
export function stripSkinTones(str) {
  return [...str].filter((ch) => !isSkinTone(ch.codePointAt(0))).join('');
}

// 把 ZWJ 序列拆成组成成员（去掉 ZWJ 与变体选择符之外的成员保留）。
export function zwjComponents(str) {
  return str
    .split(ZWJ)
    .map((part) => part)
    .filter((part) => part.length > 0);
}

export function hasZWJ(str) {
  return str.includes(ZWJ);
}

export function hasSkinTone(str) {
  return codePointsOf(str).some(isSkinTone);
}

export function hasFlagSequence(str) {
  const cps = codePointsOf(str);
  return cps.length >= 2 && cps.every((cp) => isRegionalIndicator(cp) || isTagChar(cp) || cp === 0xfe0f || cp === 0x200d);
}

// ---- 字素簇分割：优先 Intl.Segmenter，缺失时使用内置降级实现 ----

export function segmentGraphemes(str) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    return [...seg.segment(str)].map((s) => s.segment);
  }
  return fallbackSegmentGraphemes(str);
}

// 简化版 grapheme 分割：处理 ZWJ 序列、变体选择符、肤色、键帽、区域指示符对、标签字符。
export function fallbackSegmentGraphemes(str) {
  const chars = [...str];
  const clusters = [];
  let current = '';
  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    const isExtend =
      cp === 0x200d ||
      (cp >= 0xfe00 && cp <= 0xfe0f) ||
      isSkinTone(cp) ||
      cp === 0x20e3 ||
      isTagChar(cp) ||
      (cp >= 0x1f3fb && cp <= 0x1f3ff);
    if (current === '') {
      current = ch;
      continue;
    }
    const prevCp = current.codePointAt(current.length === 1 ? 0 : [...current].pop().length > 1 ? current.length - 2 : current.length - 1);
    const prevIsZWJ = current.endsWith(ZWJ);
    if (isExtend || prevIsZWJ) {
      current += ch;
      continue;
    }
    // 区域指示符两两成对
    if (isRegionalIndicator(cp)) {
      const curCps = codePointsOf(current);
      const riCount = curCps.filter(isRegionalIndicator).length;
      if (riCount % 2 === 1 && curCps.every(isRegionalIndicator)) {
        current += ch;
        continue;
      }
    }
    clusters.push(current);
    current = ch;
  }
  if (current) clusters.push(current);
  return clusters;
}

// ---- 搜索 ----

export function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase();
}

export function matchesEntry(entry, query) {
  const q = normalizeQuery(query);
  if (!q) return true;
  if (entry.emoji.includes(query.trim())) return true;
  const haystacks = [entry.name, entry.nameEn, ...(entry.keywords || []), formatCodePoints(entry.emoji)];
  return haystacks.some((h) => String(h).toLowerCase().includes(q));
}

// ---- 降级方案：保证语义一致 ----

// detection: { tofu, split, vsIgnored, flagUnsupported, skinUnsupported, widthAnomaly }
// 返回 { mode: 'native' | 'degraded', text, reason } —— text 为降级时展示/复制的文本。
export function buildFallbackPlan(entry, detection) {
  if (!detection) return { mode: 'native', text: entry.emoji, reason: '' };
  const e = entry.emoji;

  if (detection.tofu) {
    return {
      mode: 'degraded',
      text: `[${entry.name} ${formatCodePoints(e)}]`,
      reason: '当前环境缺少可显示该字符的字体（渲染为豆腐块），以名称+码点代替，语义不变。',
    };
  }
  if (detection.flagUnsupported) {
    const iso = flagToIsoCode(e);
    if (iso) {
      return {
        mode: 'degraded',
        text: iso,
        reason: `当前平台不支持旗帜序列，降级为 ISO 国家/地区代码 "${iso}"。`,
      };
    }
    return {
      mode: 'degraded',
      text: `[${entry.name}]`,
      reason: '当前平台不支持该旗帜标签序列，降级为名称文本。',
    };
  }
  if (detection.skinUnsupported) {
    const base = stripSkinTones(e);
    return {
      mode: 'degraded',
      text: base,
      reason: '肤色修饰符未被合并渲染，降级为基础 Emoji（去掉肤色），语义保持一致。',
    };
  }
  if (detection.split && hasZWJ(e)) {
    const parts = zwjComponents(e).map(stripSkinTones);
    return {
      mode: 'degraded',
      text: parts.join(' + '),
      reason: 'ZWJ 序列被拆成多个独立字符，降级为成员组合展示，语义保持一致。',
    };
  }
  if (detection.vsIgnored) {
    const base = [...e].filter((ch) => ch !== VS16 && ch !== VS15).join('');
    return {
      mode: 'degraded',
      text: base,
      reason: '变体选择符被忽略，无法切换到期望的呈现样式，降级为基础字符。',
    };
  }
  return { mode: 'native', text: e, reason: '' };
}

export const CATEGORY_LABELS = {
  base: '基础 Emoji',
  variant: '变体选择符',
  skin: '肤色修饰符',
  zwj: 'ZWJ 序列',
  flag: '旗帜序列',
};
