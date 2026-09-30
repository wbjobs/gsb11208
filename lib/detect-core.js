// 渲染能力检测：基于 Canvas 2D 的宽度测量与像素分析。
// 纯函数分类器单独导出，便于 Node 测试；Canvas 相关函数接收 ctx，主线程与
// Worker(OffscreenCanvas) 均可复用。

import { codePointsOf, isRegionalIndicator, isSkinTone, hasZWJ, zwjComponents, VS16, VS15 } from './emoji-core.js';

export const EMOJI_FONT_STACK =
  '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';

export const FONT_SIZE = 32;
// 用于豆腐块对照的未分配码点
export const TOFU_CONTROL = '\u{10FFFE}';

// ---- 纯分类器（可测试） ----

// 根据序列宽度与成员宽度之和判断序列是否被合并为单个字形。
// ratio = seqWidth / sum(componentWidths)
export function classifyMerge(seqWidth, componentWidths) {
  const sum = componentWidths.reduce((a, b) => a + b, 0);
  if (!seqWidth || !sum || componentWidths.length < 2) return 'unknown';
  const ratio = seqWidth / sum;
  if (ratio <= 0.72) return 'merged';
  if (ratio >= 0.88) return 'split';
  return 'uncertain';
}

// 彩色像素占比判定是否为彩色字形
export function isColorGlyph(coloredRatio) {
  return coloredRatio > 0.01;
}

// 宽度异常：相对参考 Emoji(😀) 的宽度比超出合理区间
export function isWidthAnomaly(width, refWidth) {
  if (!width || !refWidth) return false;
  const ratio = width / refWidth;
  return ratio < 0.35 || ratio > 3.2;
}

// ---- Canvas 测量 ----

export function makeFont(ctx, size = FONT_SIZE, family = EMOJI_FONT_STACK) {
  ctx.font = `${size}px ${family}`;
}

export function measureWidth(ctx, text, size = FONT_SIZE, family = EMOJI_FONT_STACK) {
  makeFont(ctx, size, family);
  return ctx.measureText(text).width;
}

// 渲染并分析像素：返回签名、彩色像素占比、不透明像素数、实际墨迹宽度。
export function rasterStats(ctx, text, size = FONT_SIZE) {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  makeFont(ctx, size);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(text, 4, h / 2);
  const data = ctx.getImageData(0, 0, w, h).data;
  let opaque = 0;
  let colored = 0;
  let minX = w;
  let maxX = -1;
  let hash = 2166136261 >>> 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a > 10) {
        opaque += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        if (mx - mn > 40) colored += 1;
        // 采样哈希：隔 4 个像素取一次，降低开销
        if ((x + y * w) % 4 === 0) {
          hash ^= (r << 16) ^ (g << 8) ^ b ^ a;
          hash = Math.imul(hash, 16777619) >>> 0;
        }
      }
    }
  }
  return {
    signature: opaque === 0 ? 'empty' : `${hash.toString(16)}:${opaque}`,
    opaque,
    coloredRatio: opaque === 0 ? 0 : colored / opaque,
    inkWidth: maxX >= minX ? maxX - minX + 1 : 0,
  };
}

// 判断文本是否渲染为豆腐块：与未分配码点的像素签名一致。
export function looksLikeTofu(ctx, text, tofuSignature) {
  const stats = rasterStats(ctx, text);
  return stats.signature === tofuSignature;
}

// ---- 单项检测 ----

// components: 用于合并判断的组成成员（单个字符数组）
export function analyzeEmoji(ctx, emoji, opts = {}) {
  const size = opts.size || FONT_SIZE;
  const tofuSignature = opts.tofuSignature || rasterStats(ctx, TOFU_CONTROL).signature;
  const refWidth = opts.refWidth || measureWidth(ctx, '😀', size);

  const stats = rasterStats(ctx, emoji, size);
  const width = measureWidth(ctx, emoji, size);
  const widthSans = measureWidth(ctx, emoji, size, 'sans-serif');
  const widthMono = measureWidth(ctx, emoji, size, 'monospace');

  const result = {
    emoji,
    width: round2(width),
    widthSans: round2(widthSans),
    widthMono: round2(widthMono),
    inkWidth: stats.inkWidth,
    colored: isColorGlyph(stats.coloredRatio),
    coloredRatio: round4(stats.coloredRatio),
    tofu: stats.signature === tofuSignature,
    empty: stats.opaque === 0,
    split: false,
    mergeState: 'unknown',
    vsIgnored: false,
    flagUnsupported: false,
    skinUnsupported: false,
    widthAnomaly: isWidthAnomaly(width, refWidth),
    confidence: 'high',
    issues: [],
  };

  if (result.tofu) {
    result.issues.push('渲染为豆腐块：缺少对应字形或字体');
    return result;
  }
  if (result.empty) {
    result.issues.push('未渲染出任何像素');
    result.confidence = 'low';
    return result;
  }

  const cps = codePointsOf(emoji);

  // 变体选择符：比较 基础字符 与 基础字符+VS 的渲染差异
  if (opts.baseChar && (emoji.includes(VS16) || emoji.includes(VS15))) {
    const baseStats = rasterStats(ctx, opts.baseChar, size);
    if (baseStats.signature === stats.signature) {
      result.vsIgnored = true;
      result.issues.push('变体选择符未改变渲染结果（被忽略或字体不支持切换）');
    }
  }

  // 旗帜：区域指示符对 —— 与两个字母分别渲染的拼接做像素对比
  if (cps.length === 2 && cps.every(isRegionalIndicator)) {
    const letters = cps.map((cp) => String.fromCodePoint(cp));
    const w1 = measureWidth(ctx, letters[0], size);
    const w2 = measureWidth(ctx, letters[1], size);
    const merge = classifyMerge(width, [w1, w2]);
    const sepStats = rasterStats(ctx, letters.join(''), size);
    const sameAsLetters = sepStats.signature === stats.signature;
    if (sameAsLetters || (merge === 'split' && !result.colored)) {
      result.flagUnsupported = true;
      result.issues.push('旗帜序列未合并为旗帜字形（显示为两个区域指示字母）');
    } else if (merge === 'uncertain' && !result.colored) {
      result.flagUnsupported = true;
      result.confidence = 'low';
      result.issues.push('旗帜渲染存疑：宽度与颜色信号不一致，按不支持处理');
    }
  }

  // 肤色：序列应合并为单字形
  if (cps.some(isSkinTone)) {
    const base = [...emoji].filter((ch) => !isSkinTone(ch.codePointAt(0))).join('');
    const baseW = measureWidth(ctx, base, size);
    const toneW = measureWidth(ctx, '🏽', size);
    const merge = classifyMerge(width, [baseW, toneW]);
    result.mergeState = merge;
    if (merge === 'split') {
      result.skinUnsupported = true;
      result.split = true;
      result.issues.push('肤色修饰符未与基础 Emoji 合并（被拆成两个字符）');
    } else if (merge === 'uncertain') {
      result.confidence = 'low';
      result.issues.push('肤色合并状态不确定：宽度介于合并与拆分之间');
    }
  }

  // ZWJ：序列宽度应远小于成员宽度之和
  if (hasZWJ(emoji)) {
    const parts = zwjComponents(emoji);
    const partWidths = parts.map((p) => measureWidth(ctx, p, size));
    const merge = classifyMerge(width, partWidths);
    result.mergeState = merge;
    if (merge === 'split') {
      result.split = true;
      result.issues.push('ZWJ 序列被拆分为多个独立字符渲染');
    } else if (merge === 'uncertain') {
      result.confidence = 'low';
      result.issues.push('ZWJ 合并状态不确定：宽度介于合并与拆分之间');
    }
  }

  if (result.widthAnomaly) {
    result.issues.push('渲染宽度异常：与参考 Emoji 宽度差异过大（可能是字体缺失或拆分）');
  }
  if (!result.colored && !result.tofu) {
    result.issues.push('非彩色渲染：当前字体以单色轮廓显示该 Emoji');
  }
  return result;
}

// ---- 环境能力总览 ----

export function detectEnvironment(ctx, ua = '') {
  const tofuSignature = rasterStats(ctx, TOFU_CONTROL).signature;
  const refStats = rasterStats(ctx, '😀');
  const emojiFont = refStats.signature === tofuSignature
    ? 'missing'
    : isColorGlyph(refStats.coloredRatio)
      ? 'color'
      : 'monochrome';

  const vsBase = rasterStats(ctx, '✈');
  const vsEmoji = rasterStats(ctx, '✈️');
  const vs16 = vsBase.signature !== vsEmoji.signature;

  const zwjW = measureWidth(ctx, '👨‍👩‍👧');
  const zwjParts = ['👨', '👩', '👧'].map((p) => measureWidth(ctx, p));
  const zwj = classifyMerge(zwjW, zwjParts) === 'merged';

  const skinW = measureWidth(ctx, '👍🏽');
  const skin = classifyMerge(skinW, [measureWidth(ctx, '👍'), measureWidth(ctx, '🏽')]) === 'merged';

  const flagStats = rasterStats(ctx, '🇨🇳');
  const flagLetters = rasterStats(ctx, [...'🇨🇳'].join(''));
  const flag = flagStats.signature !== flagLetters.signature && isColorGlyph(flagStats.coloredRatio);

  return {
    ua: parseUA(ua),
    segmenter: typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    emojiFont,
    vs16,
    zwj,
    skin,
    flag,
    tofuSignature,
  };
}

export function parseUA(ua) {
  const s = String(ua || '');
  let browser = '未知浏览器';
  let os = '未知系统';
  const b = [
    [/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Firefox\/([\d.]+)/, 'Firefox'], [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of b) {
    const m = s.match(re);
    if (m) { browser = `${name} ${m[1].split('.')[0]}`; break; }
  }
  const o = [
    [/Windows NT 10/, 'Windows 10/11'], [/Windows NT/, 'Windows'], [/iPhone|iPad/, 'iOS'],
    [/Android/, 'Android'], [/Mac OS X/, 'macOS'], [/Linux/, 'Linux'],
  ];
  for (const [re, name] of o) {
    if (re.test(s)) { os = name; break; }
  }
  return { browser, os };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
