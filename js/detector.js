/*
 * Emoji 渲染检测核心（纯逻辑，无 DOM 依赖，可同时用于主线程与 Web Worker）。
 * 原理：把文本绘制到 Canvas 上，通过三类信号判断渲染结果——
 *   1. 宽度：序列合并为单一字形时宽度 ≈ 单个 emoji，被拆开时 ≈ 各分量之和；
 *   2. 颜色：彩色 emoji 字体产生彩色像素，文本样式/缺字形为单色；
 *   3. 豆腐块：与已知不支持的码点（U+10FFFE）渲染指纹比对，一致即为缺字形。
 */
(function (global) {
  "use strict";

  const FONT_SIZE = 64;
  const FONT =
    FONT_SIZE + 'px "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol",' +
    '"Noto Color Emoji","EmojiOne Color","Android Emoji",sans-serif';
  const TOFU_CP = "\u{10FFFE}"; // 非字符码点，任何字体都应渲染为 .notdef 豆腐块
  const ZWJ = "‍";

  function createMeasurer(ctx) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    function measure(text) {
      ctx.font = FONT;
      return ctx.measureText(text).width;
    }

    function draw(text) {
      ctx.clearRect(0, 0, W, H);
      ctx.font = FONT;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#000";
      ctx.fillText(text, 8, H - 20);
      return ctx.getImageData(0, 0, W, H).data;
    }

    /* 渲染指纹：抽样混合像素值，用于豆腐块比对 */
    function hash(text) {
      const d = draw(text);
      let h = 0;
      for (let i = 0; i < d.length; i += 16) {
        h = (h * 31 + d[i] + (d[i + 1] << 3) + (d[i + 2] << 5) + (d[i + 3] << 7)) >>> 0;
      }
      return h;
    }

    /* 颜色统计：彩色 emoji 字形忽略 fillStyle，会留下彩色像素 */
    function stats(text) {
      const d = draw(text);
      let ink = 0;
      let colored = false;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 40) {
          ink++;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) > 24) colored = true;
        }
      }
      return { ink, colored };
    }

    return { measure, hash, stats, font: FONT, fontSize: FONT_SIZE };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* 分析单条 emoji 条目，返回状态与降级方案 */
  function analyzeEntry(entry, M) {
    const seq = entry.seq;
    const cps = [...seq];
    const width = M.measure(seq);
    const st = M.stats(seq);
    const tofu = M.hash(seq) === M.hash(TOFU_CP.repeat(cps.length));

    const r = {
      seq,
      cat: entry.cat,
      width: round1(width),
      emWidth: round1((width / M.fontSize) * 100) / 100,
      colored: st.colored,
      ink: st.ink,
      tofu,
      status: "ok",
      reason: "",
      fallback: null,
    };

    if (tofu) {
      r.status = "fail";
      r.reason = "渲染为豆腐块（缺字形），当前系统字体不支持该码点";
      r.fallback = "「" + entry.name + "」";
      return r;
    }

    switch (entry.cat) {
      case "base":
        if (st.colored) {
          r.reason = "正常彩色渲染";
        } else {
          r.status = "warn";
          r.reason = "以单色字形渲染（缺少彩色 emoji 字体）";
        }
        break;

      case "variant":
        if (entry.variant === "emoji") {
          if (st.colored) {
            r.reason = "VS16 生效：以表情样式渲染";
          } else {
            r.status = "warn";
            r.reason = "VS16 被忽略：仍渲染为文本样式";
            r.fallback = entry.baseName + "（表情）";
          }
        } else if (entry.variant === "text") {
          if (!st.colored) {
            r.reason = "VS15 生效：以文本样式渲染";
          } else {
            r.status = "warn";
            r.reason = "VS15 被忽略：仍渲染为彩色表情";
            r.fallback = entry.baseName + "（文本）";
          }
        } else {
          r.reason = st.colored ? "默认呈现为表情样式" : "默认呈现为文本样式";
        }
        break;

      case "skin": {
        if (!entry.tone) {
          // 无肤色基准项：按基础 emoji 判定
          if (st.colored) {
            r.reason = "正常彩色渲染（默认肤色基准）";
          } else {
            r.status = "warn";
            r.reason = "以单色字形渲染（缺少彩色 emoji 字体）";
          }
          break;
        }
        const wBase = M.measure(entry.base);
        const wTone = M.measure(entry.tone);
        const joined = width < (wBase + wTone) * 0.8;
        if (joined) {
          r.reason = "肤色修饰符与基础 emoji 合并成功";
        } else {
          r.status = "warn";
          r.reason = "肤色修饰符未合并，被渲染为独立色块";
          r.fallback = entry.base + "（" + entry.toneName + "）";
        }
        break;
      }

      case "zwj": {
        const parts = seq.split(ZWJ);
        const sum = parts.reduce((s, p) => s + M.measure(p), 0);
        const joined = width < sum * 0.8;
        r.partsWidth = round1(sum);
        if (joined) {
          r.reason = "ZWJ 序列合并为单一字形";
        } else {
          r.status = "warn";
          r.reason = "ZWJ 序列被拆开，显示为 " + parts.length + " 个独立 emoji";
          r.fallback = parts.join(" ") + "（" + entry.name + "）";
        }
        break;
      }

      case "flag": {
        if (entry.tag) {
          const wBase = M.measure("\u{1F3F4}");
          const joined = width <= wBase * 1.3;
          if (joined) {
            r.reason = "Tag 序列旗帜渲染成功";
          } else {
            r.status = "warn";
            r.reason = "Tag 序列不支持，显示为黑旗加标签字符";
            r.fallback = entry.code;
          }
        } else {
          const firstRI = [...seq][0];
          const wSingle = M.measure(firstRI);
          const merged = width < wSingle * 1.6;
          if (merged) {
            r.reason = "两个区域指示符合并为旗帜";
          } else {
            r.status = "warn";
            r.reason = "旗帜不支持，显示为两个字母 " + entry.code;
            r.fallback = entry.code;
          }
        }
        break;
      }
    }
    return r;
  }

  /* 能力探针评估：返回 { supported, note } */
  function analyzeProbe(probe, M) {
    const st = M.stats(probe.seq);
    const w = M.measure(probe.seq);
    switch (probe.kind) {
      case "colored":
        return { supported: st.colored, note: st.colored ? "检测到彩色像素" : "仅单色渲染" };
      case "mono":
        return { supported: !st.colored, note: st.colored ? "VS15 被忽略" : "文本样式生效" };
      case "joined": {
        const sum = probe.seq.split(ZWJ).reduce((s, p) => s + M.measure(p), 0);
        const ok = w < sum * 0.8;
        return { supported: ok, note: ok ? "合并为单一字形" : "序列被拆开" };
      }
      case "skin": {
        const wb = M.measure("\u{1F44B}");
        const wt = M.measure("\u{1F3FD}");
        const ok = w < (wb + wt) * 0.8;
        return { supported: ok, note: ok ? "修饰符合并" : "修饰符独立显示" };
      }
      case "flag": {
        const ws = M.measure("\u{1F1E8}");
        const ok = w < ws * 1.6;
        return { supported: ok, note: ok ? "合并为旗帜" : "显示为字母 CN" };
      }
      case "tagflag": {
        const wb = M.measure("\u{1F3F4}");
        const ok = w <= wb * 1.3;
        return { supported: ok, note: ok ? "Tag 序列生效" : "不支持 Tag 序列" };
      }
    }
    return { supported: false, note: "未知探针" };
  }

  global.EmojiDetector = { FONT, FONT_SIZE, createMeasurer, analyzeEntry, analyzeProbe };
})(typeof self !== "undefined" ? self : this);
