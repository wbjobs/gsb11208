import { EMOJI_DATA } from './lib/emoji-data.js';
import {
  formatCodePoints, codePointDetails, segmentGraphemes, matchesEntry,
  buildFallbackPlan, CATEGORY_LABELS, flagToIsoCode,
} from './lib/emoji-core.js';
import { analyzeEmoji, detectEnvironment, EMOJI_FONT_STACK, FONT_SIZE } from './lib/detect-core.js';
import { EmojiStorage } from './lib/storage.js';

const state = {
  detections: new Map(),
  overrides: new Map(),
  env: null,
  query: '',
  category: 'all',
  status: 'all',
  selectedId: null,
  storageDegraded: false,
};

const storage = new EmojiStorage();
const $ = (sel) => document.querySelector(sel);

// ---------- 检测调度：优先 Worker(OffscreenCanvas)，失败回退主线程 ----------

function runDetectionInWorker() {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker('worker.js', { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('worker timeout')); }, 15000);
    worker.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === 'batch-result') {
        clearTimeout(timer);
        worker.terminate();
        resolve(payload);
      } else if (type === 'error') {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(payload));
      }
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    };
    worker.postMessage({
      type: 'detect-batch',
      id: 1,
      payload: { ua: navigator.userAgent, entries: EMOJI_DATA.map(({ id, emoji, baseChar }) => ({ id, emoji, baseChar })) },
    });
  });
}

function runDetectionOnMainThread() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const env = detectEnvironment(ctx, navigator.userAgent);
  const results = EMOJI_DATA.map((entry) => ({
    id: entry.id,
    result: analyzeEmoji(ctx, entry.emoji, { baseChar: entry.baseChar, tofuSignature: env.tofuSignature, size: FONT_SIZE }),
  }));
  return Promise.resolve({ env, results });
}

async function detectAll(force = false) {
  const envTag = `${navigator.userAgent}|${EMOJI_FONT_STACK}|${FONT_SIZE}`;
  const key = `run::${envTag}`;
  if (!force) {
    const cached = await storage.getCache(key);
    if (cached && cached.env && Array.isArray(cached.results)) return cached;
  }
  let payload;
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      payload = await runDetectionInWorker();
    } catch {
      payload = runDetectionOnMainThread();
    }
  } else {
    payload = runDetectionOnMainThread();
  }
  await storage.setCache(key, payload);
  return payload;
}

// ---------- 展示状态计算 ----------

function manualFallback(entry) {
  const synthetic = {
    tofu: entry.category === 'base',
    split: entry.category === 'zwj',
    vsIgnored: entry.category === 'variant',
    flagUnsupported: entry.category === 'flag',
    skinUnsupported: entry.category === 'skin',
  };
  return buildFallbackPlan(entry, synthetic);
}

function effectiveView(entry) {
  const detection = state.detections.get(entry.id) || null;
  const override = state.overrides.get(entry.id) || null;
  let plan = detection ? buildFallbackPlan(entry, detection) : { mode: 'native', text: entry.emoji, reason: '' };
  let overridden = false;
  if (override === 'force-fallback') {
    plan = plan.mode === 'degraded' ? plan : manualFallback(entry);
    plan = { ...plan, mode: 'degraded' };
    overridden = true;
  } else if (override === 'force-native') {
    plan = { mode: 'native', text: entry.emoji, reason: '' };
    overridden = true;
  }
  const uncertain = detection && detection.confidence === 'low' && plan.mode === 'native';
  return { detection, plan, override, overridden, status: uncertain ? 'uncertain' : plan.mode };
}

// ---------- 渲染 ----------

function renderEnv() {
  const env = state.env;
  const box = $('#env-chips');
  if (!env) { box.innerHTML = '<span class="chip">环境检测中…</span>'; return; }
  const chip = (label, ok, title) =>
    `<span class="chip ${ok === true ? 'ok' : ok === false ? 'bad' : ''}" title="${title || ''}">${label}</span>`;
  const fontLabel = { color: '彩色 Emoji 字体', monochrome: '单色 Emoji 字体', missing: '缺少 Emoji 字体' }[env.emojiFont];
  box.innerHTML = [
    chip(`${env.ua.browser} · ${env.ua.os}`, null),
    chip(fontLabel, env.emojiFont === 'color' ? true : env.emojiFont === 'monochrome' ? null : false),
    chip(`Intl.Segmenter ${env.segmenter ? '✓' : '✗(内置降级)'}`, env.segmenter ? true : null),
    chip(`OffscreenCanvas ${env.offscreenCanvas ? '✓' : '✗(主线程检测)'}`, env.offscreenCanvas ? true : null),
    chip(`变体选择符 ${env.vs16 ? '✓' : '✗'}`, env.vs16),
    chip(`ZWJ 序列 ${env.zwj ? '✓' : '✗'}`, env.zwj),
    chip(`肤色修饰符 ${env.skin ? '✓' : '✗'}`, env.skin),
    chip(`旗帜序列 ${env.flag ? '✓' : '✗'}`, env.flag),
  ].join('');
  if (env.emojiFont === 'missing') {
    $('#font-banner').classList.remove('hidden');
  } else {
    $('#font-banner').classList.add('hidden');
  }
}

function statusBadge(view) {
  if (view.status === 'degraded') return '<span class="badge degraded">已降级</span>';
  if (view.status === 'uncertain') return '<span class="badge uncertain">存疑</span>';
  return '<span class="badge ok">原生渲染</span>';
}

function renderGrid() {
  const grid = $('#grid');
  const frag = document.createDocumentFragment();
  let visible = 0;
  for (const entry of EMOJI_DATA) {
    if (state.category !== 'all' && entry.category !== state.category) continue;
    if (!matchesEntry(entry, state.query)) continue;
    const view = effectiveView(entry);
    if (state.status !== 'all' && view.status !== state.status) continue;
    visible += 1;

    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.dataset.id = entry.id;
    const det = view.detection;
    const widthText = det ? `${det.width}px` : '—';
    const display = view.plan.mode === 'degraded' ? view.plan.text : entry.emoji;
    const isTextFallback = view.plan.mode === 'degraded';
    card.innerHTML = `
      <div class="emoji-box ${isTextFallback ? 'fallback-text' : ''}">${escapeHtml(display)}</div>
      <div class="card-name">${escapeHtml(entry.name)}</div>
      <div class="card-cps">${escapeHtml(formatCodePoints(entry.emoji))}</div>
      <div class="card-meta">
        ${statusBadge(view)}
        <span class="width-tag" title="Emoji 字体栈下的渲染宽度">宽 ${widthText}</span>
      </div>`;
    card.addEventListener('click', () => openDetail(entry.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(entry.id); });
    frag.appendChild(card);
  }
  grid.replaceChildren(frag);
  $('#empty-hint').classList.toggle('hidden', visible > 0);
  $('#stat-line').textContent = `共 ${EMOJI_DATA.length} 个样本，当前显示 ${visible} 个`;
}

function renderDetail(entry) {
  const view = effectiveView(entry);
  const det = view.detection;
  const clusters = segmentGraphemes(entry.emoji);
  const cps = codePointDetails(entry.emoji);
  const iso = flagToIsoCode(entry.emoji);

  $('#detail-title').textContent = entry.name;
  $('#detail-emoji').textContent = entry.emoji;
  $('#detail-emoji').style.fontFamily = EMOJI_FONT_STACK;
  $('#detail-fallback').textContent = view.plan.mode === 'degraded' ? view.plan.text : '（无需降级）';

  $('#detail-cps').innerHTML = cps
    .map((c) => `<li><code>${c.hex}</code> <span class="cp-char">${escapeHtml(c.char)}</span> ${escapeHtml(c.kind)}</li>`)
    .join('');
  $('#detail-seq').textContent = clusters.map((c) => `[${c}]`).join(' → ') + `（${clusters.length} 个字素簇）`;

  $('#detail-width').innerHTML = det
    ? `<li>Emoji 字体栈：<strong>${det.width}px</strong>（墨迹宽 ${det.inkWidth}px）</li>
       <li>sans-serif：${det.widthSans}px ／ monospace：${det.widthMono}px</li>
       <li>彩色渲染：${det.colored ? `是（彩色像素占比 ${(det.coloredRatio * 100).toFixed(1)}%）` : '否（单色）'}</li>
       <li>检测置信度：${det.confidence === 'low' ? '低（多信号不一致，建议人工确认）' : '高'}</li>`
    : '<li>尚未检测</li>';

  const issues = det && det.issues.length ? det.issues : ['未发现渲染异常'];
  $('#detail-issues').innerHTML = issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  $('#detail-reason').textContent = view.plan.reason || (iso ? `旗帜对应 ISO 代码：${iso}` : '');

  const ov = view.override || 'auto';
  document.querySelectorAll('input[name="override"]').forEach((r) => { r.checked = r.value === ov; });

  $('#copy-emoji').dataset.value = entry.emoji;
  $('#copy-cps').dataset.value = formatCodePoints(entry.emoji);
  $('#copy-fallback').dataset.value = view.plan.text;
  $('#copy-fallback').disabled = view.plan.mode !== 'degraded';
}

function openDetail(id) {
  const entry = EMOJI_DATA.find((e) => e.id === id);
  if (!entry) return;
  state.selectedId = id;
  renderDetail(entry);
  $('#detail').showModal();
}

// ---------- 复制 ----------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板');
    return;
  } catch { /* 继续降级 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) { toast('已复制到剪贴板'); return; }
  } catch { /* 继续降级 */ }
  $('#copy-manual-text').value = text;
  $('#copy-manual').showModal();
  $('#copy-manual-text').select();
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

// ---------- 事件 ----------

function bindEvents() {
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderGrid(); });
  $('#category').addEventListener('change', (e) => { state.category = e.target.value; renderGrid(); });
  $('#status-filter').addEventListener('change', (e) => { state.status = e.target.value; renderGrid(); });

  $('#redetect').addEventListener('click', async () => {
    $('#redetect').disabled = true;
    await storage.clearStore('cache');
    await boot(true);
    $('#redetect').disabled = false;
    toast('已重新检测');
  });

  $('#detail-close').addEventListener('click', () => $('#detail').close());
  $('#copy-manual-close').addEventListener('click', () => $('#copy-manual').close());

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyText(btn.dataset.value || ''));
  });

  document.querySelectorAll('input[name="override"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      const value = radio.value;
      const id = state.selectedId;
      if (!id) return;
      if (value === 'auto') {
        state.overrides.delete(id);
        await storage.setOverride(id, null);
      } else {
        state.overrides.set(id, value);
        await storage.setOverride(id, value);
      }
      const entry = EMOJI_DATA.find((e) => e.id === id);
      renderDetail(entry);
      renderGrid();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 启动 ----------

async function boot(force = false) {
  $('#grid').setAttribute('aria-busy', 'true');
  const { env, results } = await detectAll(force);
  state.env = env;
  state.detections = new Map(results.map(({ id, result }) => [id, result]));
  renderEnv();
  renderGrid();
  $('#grid').removeAttribute('aria-busy');
}

async function main() {
  const catSel = $('#category');
  for (const [value, label] of Object.entries(CATEGORY_LABELS)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    catSel.appendChild(opt);
  }
  bindEvents();
  await storage.open();
  state.storageDegraded = storage.degraded;
  if (storage.degraded) $('#storage-banner').classList.remove('hidden');
  state.overrides = await storage.getAllOverrides();
  renderEnv();
  renderGrid();
  await boot(false);
}

main().catch((err) => {
  console.error(err);
  $('#grid').innerHTML = `<p class="error">初始化失败：${escapeHtml(err.message || err)}</p>`;
});
