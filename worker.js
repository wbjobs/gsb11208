// 检测 Worker：在 OffscreenCanvas 中执行宽度测量与像素分析，避免阻塞主线程。
import { analyzeEmoji, detectEnvironment, FONT_SIZE } from './lib/detect-core.js';

function makeCtx() {
  const canvas = new OffscreenCanvas(256, 64);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return ctx;
}

self.onmessage = (event) => {
  const { type, id, payload } = event.data || {};
  try {
    if (type === 'detect-env') {
      const ctx = makeCtx();
      const env = detectEnvironment(ctx, payload.ua);
      self.postMessage({ type: 'env-result', id, payload: env });
      return;
    }
    if (type === 'detect-batch') {
      const ctx = makeCtx();
      const env = detectEnvironment(ctx, payload.ua);
      const results = payload.entries.map((entry) => ({
        id: entry.id,
        result: analyzeEmoji(ctx, entry.emoji, {
          baseChar: entry.baseChar,
          tofuSignature: env.tofuSignature,
          size: FONT_SIZE,
        }),
      }));
      self.postMessage({ type: 'batch-result', id, payload: { env, results } });
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, payload: String((err && err.message) || err) });
  }
};
