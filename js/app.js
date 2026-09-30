/* 主逻辑：能力检测调度（Worker 优先，主线程兜底）、列表渲染、搜索分类、复制、详情 */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const STATUS_LABEL = { ok: "正常", warn: "降级可用", fail: "不支持" };
  const results = {}; // seq -> 检测结果
  const probeResults = {}; // key -> { supported, note }
  const filter = { cat: "all", status: "all", q: "" };
  let detectMode = "主线程";

  /* ---------- 工具 ---------- */

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function codepoints(seq) {
    return [...seq].map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"));
  }

  function cpAnnotation(cp) {
    const n = cp.codePointAt(0);
    if (n === 0xfe0f) return "变体选择符 VS16（表情样式）";
    if (n === 0xfe0e) return "变体选择符 VS15（文本样式）";
    if (n === 0x200d) return "零宽连接符 ZWJ";
    if (n >= 0x1f3fb && n <= 0x1f3ff) return "肤色修饰符";
    if (n >= 0x1f1e6 && n <= 0x1f1ff) return "区域指示符（旗帜分量）";
    if (n >= 0xe0020 && n <= 0xe007f) return "标签字符（Tag 序列）";
    return "";
  }

  function graphemeCount(seq) {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const seg = new Intl.Segmenter("zh", { granularity: "grapheme" });
      return [...seg.segment(seq)].length;
    }
    return null;
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制" + (label ? "：" + label : ""));
    } catch (e) {
      $("#manualCopyText").value = text;
      $("#manualCopyModal").hidden = false;
      $("#manualCopyText").select();
    }
  }

  /* ---------- 检测调度 ---------- */

  function cacheKey(seq) {
    return seq + "|" + EmojiDetector.FONT + "|" + navigator.userAgent;
  }

  function detectInWorker(entries, probes) {
    return new Promise((resolve, reject) => {
      const worker = new Worker("js/detect-worker.js");
      const out = { results: [], probes: [] };
      const timer = setTimeout(() => { worker.terminate(); reject(new Error("worker timeout")); }, 15000);
      worker.onmessage = (e) => {
        if (e.data.type === "result") {
          out.results = e.data.results;
          worker.postMessage({ type: "probes", probes });
        } else if (e.data.type === "probes") {
          out.probes = e.data.probes;
          clearTimeout(timer);
          worker.terminate();
          resolve(out);
        }
      };
      worker.onerror = (err) => { clearTimeout(timer); worker.terminate(); reject(err); };
      worker.postMessage({ type: "detect", entries });
    });
  }

  async function detectOnMain(entries, probes) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 128;
    const M = EmojiDetector.createMeasurer(canvas.getContext("2d"));
    const out = { results: [], probes: [] };
    for (let i = 0; i < entries.length; i++) {
      out.results.push(EmojiDetector.analyzeEntry(entries[i], M));
      if (i % 10 === 9) await new Promise((r) => setTimeout(r)); // 让出主线程
    }
    out.probes = probes.map((p) => ({ key: p.key, ...EmojiDetector.analyzeProbe(p, M) }));
    return out;
  }

  async function runDetection(force) {
    if (force) await EmojiDB.clear().catch(() => {});

    let cached = [];
    try { cached = await EmojiDB.getAll(); } catch (e) { /* 隐私模式下 IndexedDB 可能不可用 */ }
    const cacheMap = new Map(cached.map((r) => [r.key, r.result]));
    for (const p of CAPABILITY_PROBES) {
      const hit = cacheMap.get(cacheKey("probe:" + p.key));
      if (hit) probeResults[p.key] = hit;
    }

    const missing = EMOJI_DATA.filter((e) => !cacheMap.has(cacheKey(e.seq)));
    const needProbes = CAPABILITY_PROBES.some((p) => !probeResults[p.key]);

    if (missing.length || needProbes) {
      $("#detecting").hidden = false;
      let out;
      if (typeof Worker === "function" && typeof OffscreenCanvas === "function") {
        try {
          out = await detectInWorker(missing, CAPABILITY_PROBES);
          detectMode = "Web Worker + OffscreenCanvas";
        } catch (e) {
          out = await detectOnMain(missing, CAPABILITY_PROBES);
          detectMode = "主线程 Canvas（Worker 不可用，已降级）";
        }
      } else {
        out = await detectOnMain(missing, CAPABILITY_PROBES);
        detectMode = "主线程 Canvas（无 OffscreenCanvas，已降级）";
      }

      for (const r of out.results) results[r.seq] = r;
      for (const p of out.probes) probeResults[p.key] = { supported: p.supported, note: p.note };

      const records = out.results.map((r) => ({ key: cacheKey(r.seq), result: r, ts: Date.now() }));
      for (const p of CAPABILITY_PROBES) {
        if (probeResults[p.key]) {
          records.push({ key: cacheKey("probe:" + p.key), result: probeResults[p.key], ts: Date.now() });
        }
      }
      try { await EmojiDB.putAll(records); } catch (e) { /* 缓存失败不影响功能 */ }
      $("#detecting").hidden = true;
    }

    for (const e of EMOJI_DATA) {
      if (!results[e.seq]) {
        const hit = cacheMap.get(cacheKey(e.seq));
        if (hit) results[e.seq] = hit;
      }
    }
  }

  /* ---------- 渲染 ---------- */

  function renderCapabilities() {
    const panel = $("#capList");
    panel.innerHTML = "";
    for (const p of CAPABILITY_PROBES) {
      const r = probeResults[p.key];
      const li = document.createElement("div");
      li.className = "cap-item";
      const ok = r && r.supported;
      li.innerHTML =
        '<span class="cap-dot ' + (r ? (ok ? "ok" : "fail") : "pending") + '"></span>' +
        '<span class="cap-label">' + p.label + "</span>" +
        '<span class="cap-note">' + (r ? r.note : "检测中…") + "</span>";
      panel.appendChild(li);
    }
    const env = [];
    env.push("Intl.Segmenter：" + (typeof Intl !== "undefined" && Intl.Segmenter ? "可用" : "不可用"));
    env.push("检测方式：" + detectMode);
    $("#envInfo").textContent = env.join("　·　");
  }

  function entryMatches(e) {
    if (filter.cat !== "all" && e.cat !== filter.cat) return false;
    const r = results[e.seq];
    if (filter.status !== "all") {
      if (!r) return false;
      if (filter.status === "ok" && r.status !== "ok") return false;
      if (filter.status === "bad" && r.status === "ok") return false;
    }
    if (filter.q) {
      const q = filter.q.toLowerCase();
      const hay = (e.name + " " + e.en + " " + codepoints(e.seq).join(" ") + " " + e.seq).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function renderGrid() {
    const grid = $("#grid");
    grid.innerHTML = "";
    let ok = 0, warn = 0, fail = 0, shown = 0;

    for (const e of EMOJI_DATA) {
      const r = results[e.seq];
      if (r) {
        if (r.status === "ok") ok++;
        else if (r.status === "warn") warn++;
        else fail++;
      }
      if (!entryMatches(e)) continue;
      shown++;

      const card = document.createElement("article");
      card.className = "card";
      card.tabIndex = 0;

      const box = document.createElement("div");
      box.className = "emoji-box";
      box.textContent = e.seq;
      if (r && r.emWidth) {
        // 宽度处理：按实测 em 宽度预留空间，避免被拆开的序列溢出遮挡
        box.style.minWidth = Math.min(6, Math.max(2.4, r.emWidth * 2 + 0.6)) + "rem";
      }

      const name = document.createElement("div");
      name.className = "card-name";
      name.textContent = e.name;

      const meta = document.createElement("div");
      meta.className = "card-meta";
      if (r) {
        meta.innerHTML =
          '<span class="badge ' + r.status + '">' + STATUS_LABEL[r.status] + "</span>" +
          '<span class="width-tag" title="Canvas 实测宽度 @64px">' + r.emWidth.toFixed(2) + "em</span>";
      }

      const cps = document.createElement("div");
      cps.className = "card-cps";
      cps.textContent = codepoints(e.seq).join(" ");

      card.append(box, name, meta, cps);

      if (r && r.fallback) {
        const fb = document.createElement("div");
        fb.className = "card-fallback";
        fb.textContent = "降级：" + r.fallback;
        card.appendChild(fb);
      }

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn btn-copy";
      copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        copyText(e.seq, e.name);
      });
      card.appendChild(copyBtn);

      card.addEventListener("click", () => openDetail(e));
      card.addEventListener("keydown", (ev) => { if (ev.key === "Enter") openDetail(e); });
      grid.appendChild(card);
    }

    $("#summary").textContent =
      "共 " + EMOJI_DATA.length + " 项 · 正常 " + ok + " · 降级 " + warn + " · 不支持 " + fail +
      (shown !== EMOJI_DATA.length ? " · 当前筛选 " + shown + " 项" : "");
    $("#emptyHint").hidden = shown > 0;
  }

  /* ---------- 详情弹窗 ---------- */

  function openDetail(e) {
    const r = results[e.seq] || {};
    $("#dEmoji").textContent = e.seq;
    $("#dName").textContent = e.name;
    $("#dEn").textContent = e.en;

    const badge = $("#dStatus");
    badge.className = "badge " + (r.status || "pending");
    badge.textContent = r.status ? STATUS_LABEL[r.status] : "未检测";
    $("#dReason").textContent = r.reason || "";

    const cpList = $("#dCodepoints");
    cpList.innerHTML = "";
    for (const c of [...e.seq]) {
      const li = document.createElement("li");
      const hex = "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
      const ann = cpAnnotation(c);
      li.innerHTML = "<code>" + hex + "</code> <span class='cp-char'>" + c + "</span>" +
        (ann ? " <span class='cp-ann'>" + ann + "</span>" : "");
      cpList.appendChild(li);
    }

    const gc = graphemeCount(e.seq);
    const rows = [
      ["码点数", [...e.seq].length + " 个"],
      ["字形簇（Intl.Segmenter）", gc === null ? "API 不可用" : gc + " 个"],
      ["实测宽度", r.width !== undefined ? r.width + " px @64px（" + r.emWidth.toFixed(2) + " em）" : "—"],
      ["渲染颜色", r.colored === undefined ? "—" : r.colored ? "彩色" : "单色"],
      ["豆腐块检测", r.tofu === undefined ? "—" : r.tofu ? "是（缺字形）" : "否"],
    ];
    if (r.partsWidth !== undefined) rows.push(["ZWJ 分量宽度合计", r.partsWidth + " px"]);
    $("#dMetrics").innerHTML = rows
      .map((kv) => "<tr><th>" + kv[0] + "</th><td>" + kv[1] + "</td></tr>")
      .join("");

    const fbWrap = $("#dFallbackWrap");
    if (r.fallback) {
      fbWrap.hidden = false;
      $("#dFallback").textContent = r.fallback;
    } else {
      fbWrap.hidden = true;
    }

    $("#dCopyEmoji").onclick = () => copyText(e.seq, "Emoji");
    $("#dCopyCps").onclick = () => copyText(codepoints(e.seq).join(" "), "码点");
    $("#dCopyJs").onclick = () =>
      copyText([...e.seq].map((c) => "\\u{" + c.codePointAt(0).toString(16) + "}").join(""), "JS 转义");
    $("#dCopyFallback").onclick = () => copyText(r.fallback || e.seq, "降级文本");

    $("#detailModal").hidden = false;
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    $("#searchInput").addEventListener("input", (ev) => {
      filter.q = ev.target.value.trim();
      renderGrid();
    });

    $("#catBar").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-cat]");
      if (!btn) return;
      filter.cat = btn.dataset.cat;
      document.querySelectorAll("#catBar button").forEach((b) =>
        b.classList.toggle("active", b === btn));
      renderGrid();
    });

    $("#statusFilter").addEventListener("change", (ev) => {
      filter.status = ev.target.value;
      renderGrid();
    });

    $("#redetectBtn").addEventListener("click", async () => {
      $("#redetectBtn").disabled = true;
      await runDetection(true);
      renderCapabilities();
      renderGrid();
      $("#redetectBtn").disabled = false;
      toast("已重新检测");
    });

    document.querySelectorAll("[data-close]").forEach((btn) =>
      btn.addEventListener("click", () => { $("#" + btn.dataset.close).hidden = true; }));
    document.querySelectorAll(".modal").forEach((m) =>
      m.addEventListener("click", (ev) => { if (ev.target === m) m.hidden = true; }));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
    });
  }

  function renderCatBar() {
    const bar = $("#catBar");
    for (const c of CATEGORIES) {
      const btn = document.createElement("button");
      btn.textContent = c.label;
      btn.dataset.cat = c.id;
      if (c.id === "all") btn.classList.add("active");
      bar.appendChild(btn);
    }
  }

  /* ---------- 启动 ---------- */

  async function init() {
    renderCatBar();
    bindEvents();
    renderGrid();
    await runDetection(false);
    renderCapabilities();
    renderGrid();
  }

  init();
})();
