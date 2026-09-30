/*
 * 检测 Worker：在后台线程用 OffscreenCanvas 执行渲染测量，
 * 避免主线程卡顿。不支持 OffscreenCanvas 时主线程会自动降级为同步检测。
 */
importScripts("emoji-data.js", "detector.js");

let measurer = null;

function getMeasurer() {
  if (!measurer) {
    const canvas = new OffscreenCanvas(640, 128);
    measurer = EmojiDetector.createMeasurer(canvas.getContext("2d"));
  }
  return measurer;
}

self.onmessage = (e) => {
  const { type } = e.data;
  if (type === "detect") {
    const M = getMeasurer();
    const results = e.data.entries.map((entry) => EmojiDetector.analyzeEntry(entry, M));
    self.postMessage({ type: "result", results });
  } else if (type === "probes") {
    const M = getMeasurer();
    const probes = e.data.probes.map((p) => ({
      key: p.key,
      ...EmojiDetector.analyzeProbe(p, M),
    }));
    self.postMessage({ type: "probes", probes, font: M.font });
  }
};
