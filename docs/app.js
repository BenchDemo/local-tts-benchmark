/* Renders the benchmark site from data.json. Vanilla JS + SVG, no deps.
   Chart rules (dataviz method): horizontal bars ≤24px, 4px rounded data-end
   square at baseline, hairline solid grid, direct value labels at bar tips in
   text ink, color = device identity (amber GPU / steel CPU), hover tooltip on
   every mark, table view carries everything. */
"use strict";

const C = {
  gpu: "#c48018", cpu: "#3f8dc4",
  ink: "#e8ebe6", ink2: "#9aa5a8", mute: "#6b7478",
  hairline: "#232a2e", baseline: "#2e363b", surface: "#12161a",
};
const NS = "http://www.w3.org/2000/svg";

const tip = document.createElement("div");
tip.className = "viz-tip";
document.body.appendChild(tip);

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function fmt(v, digits = 2) {
  if (v == null) return "—";
  if (v >= 1000) return Math.round(v).toLocaleString("en-US");
  return Number(v.toFixed(digits)).toString();
}

function showTip(evt, title, lines) {
  tip.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = title;
  tip.appendChild(strong);
  for (const line of lines) tip.appendChild(document.createTextNode(line)), tip.appendChild(document.createElement("br"));
  tip.style.visibility = "visible";
  const pad = 14;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
const hideTip = () => (tip.style.visibility = "hidden");

/* Horizontal bar chart. rows: [{name, value, device, detail}] */
function barChart(mount, rows, { unit = "", digits = 2, domainMax, desc = false, label = "" } = {}) {
  mount.replaceChildren();
  rows = rows.filter(r => r.value != null).sort((a, b) => desc ? b.value - a.value : a.value - b.value);
  if (!rows.length) return;
  const BAR = 18, GAP = 12, LABEL_W = 200, VAL_W = 78, TICK_H = 22;
  const W = 920, H = rows.length * (BAR + GAP) + TICK_H + 6;
  const plotW = W - LABEL_W - VAL_W;
  const max = domainMax || Math.max(...rows.map(r => r.value));
  const ticks = niceTicks(max, 5);
  const scale = v => (v / ticks[ticks.length - 1]) * plotW;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": label }, mount);

  for (const t of ticks) {
    const x = LABEL_W + scale(t);
    el("line", { x1: x, y1: 0, x2: x, y2: H - TICK_H, stroke: t === 0 ? C.baseline : C.hairline, "stroke-width": 1 }, svg);
    const lbl = el("text", { x, y: H - 6, "text-anchor": "middle", fill: C.mute, "font-size": 11, "aria-hidden": "true" }, svg);
    lbl.textContent = fmt(t, digits) + (t === ticks[ticks.length - 1] && unit ? " " + unit : "");
  }

  rows.forEach((r, i) => {
    const y = i * (BAR + GAP) + 2;
    const w = Math.max(scale(r.value), 2);
    const color = r.device === "cpu" ? C.cpu : C.gpu;

    const name = el("text", { x: LABEL_W - 12, y: y + BAR / 2 + 4, "text-anchor": "end", fill: C.ink, "font-size": 13, "font-weight": 600, "aria-hidden": "true" }, svg);
    name.textContent = r.name;

    // hit target first (renders under bar; CSS sibling selector lifts bar).
    // Carries the accessible name for the whole row.
    const hit = el("rect", {
      x: 0, y: y - GAP / 2, width: W, height: BAR + GAP, class: "bar-hit", tabindex: 0,
      role: "img", "aria-label": `${r.name}: ${fmt(r.value, digits)}${unit ? " " + unit : ""}, ${r.device === "cpu" ? "CPU" : "GPU"}`,
    }, svg);
    // 4px rounded data-end, square baseline: rounded rect clipped at the left
    const clipId = `c${mount.id}${i}`;
    const clip = el("clipPath", { id: clipId }, svg);
    el("rect", { x: LABEL_W, y, width: w, height: BAR }, clip);
    el("rect", {
      x: LABEL_W - 4, y, width: w + 4, height: BAR, rx: 4,
      fill: color, class: "bar", "clip-path": `url(#${clipId})`,
      style: `animation-delay:${i * 45}ms`,
    }, svg);

    const val = el("text", { x: LABEL_W + w + 8, y: y + BAR / 2 + 4, fill: C.ink2, "font-size": 12.5, class: "bar-val", "aria-hidden": "true" }, svg);
    val.textContent = fmt(r.value, digits) + (unit ? " " + unit : "");

    const lines = [`device: ${r.device || "?"}`, ...(r.detail || [])];
    hit.addEventListener("pointermove", e => showTip(e, `${r.name} — ${fmt(r.value, digits)}${unit ? " " + unit : ""}`, lines));
    hit.addEventListener("pointerleave", hideTip);
    hit.addEventListener("focus", () => {
      const b = hit.getBoundingClientRect();
      showTip({ clientX: b.x + LABEL_W, clientY: b.y }, `${r.name} — ${fmt(r.value, digits)}${unit ? " " + unit : ""}`, lines);
    });
    hit.addEventListener("blur", hideTip);
  });
}

function niceTicks(max, n) {
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
  const ticks = [];
  for (let t = 0; t <= Math.ceil(max / step) * step + 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

/* ---------------- KPI row ---------------- */
function kpi(label, value, small, note) {
  const d = document.createElement("div");
  d.className = "kpi";
  const l = document.createElement("div"); l.className = "k-label"; l.textContent = label;
  const v = document.createElement("div"); v.className = "k-value"; v.textContent = value;
  if (small) { const s = document.createElement("small"); s.textContent = " " + small; v.appendChild(s); }
  const n = document.createElement("div"); n.className = "k-note"; n.textContent = note || "";
  d.append(l, v, n);
  return d;
}

/* ---------------- ledger table ---------------- */
const COLS = [
  { key: "name", label: "Model", num: false },
  { key: "device", label: "Device", num: false },
  { key: "license", label: "License", num: false },
  { key: "params", label: "Params", num: false },
  { key: "rtf_median", label: "RTF (med)", num: true, digits: 3, bestMin: true },
  { key: "load_s", label: "Load s", num: true, digits: 1, bestMin: true },
  { key: "peak_rss_mb", label: "RSS MB", num: true, digits: 0, bestMin: true },
  { key: "gpu_mem_mb", label: "GPU MB", num: true, digits: 0 },
  { key: "mos", label: "MOS", num: true, digits: 2, bestMax: true },
  { key: "wer", label: "WER", num: true, digits: 3, bestMin: true },
];

function renderTable(models) {
  const thead = document.querySelector("#ledger thead");
  const tbody = document.querySelector("#ledger tbody");
  const state = { key: "rtf_median", dir: 1 };

  const draw = () => {
    thead.replaceChildren();
    tbody.replaceChildren();
    const hr = document.createElement("tr");
    for (const c of COLS) {
      const th = document.createElement("th");
      th.setAttribute("scope", "col");
      if (state.key === c.key) th.setAttribute("aria-sort", state.dir === 1 ? "ascending" : "descending");
      const btn = document.createElement("button");
      btn.className = "th-sort";
      btn.textContent = c.label + " ";
      if (state.key === c.key) {
        const a = document.createElement("span");
        a.className = "arrow";
        a.setAttribute("aria-hidden", "true");
        a.textContent = state.dir === 1 ? "▼" : "▲";
        btn.appendChild(a);
      }
      btn.addEventListener("click", () => {
        state.dir = state.key === c.key ? -state.dir : 1;
        state.key = c.key;
        draw();
      });
      th.appendChild(btn);
      hr.appendChild(th);
    }
    thead.appendChild(hr);

    const best = {};
    for (const c of COLS) {
      if (!c.bestMin && !c.bestMax) continue;
      const vals = models.map(m => m[c.key]).filter(v => v != null);
      if (vals.length) best[c.key] = c.bestMin ? Math.min(...vals) : Math.max(...vals);
    }

    const sorted = [...models].sort((a, b) => {
      const av = a[state.key], bv = b[state.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * state.dir;
    });

    for (const m of sorted) {
      const tr = document.createElement("tr");
      for (const c of COLS) {
        const td = document.createElement("td");
        const v = m[c.key];
        if (c.key === "name") {
          td.className = "model-cell";
          td.textContent = m.name;
          if (m.cloning) td.appendChild(cloneMark());
        } else if (c.key === "device") {
          const b = document.createElement("span");
          b.className = "dev-badge " + (v === "cpu" ? "cpu" : "gpu");
          b.textContent = (v || "?").toUpperCase();
          td.appendChild(b);
        } else if (!c.num) {
          td.textContent = v ?? "—";
        } else if (v == null) {
          td.textContent = "—";
          td.className = "na";
        } else {
          td.textContent = fmt(v, c.digits);
          if (best[c.key] === v) td.classList.add("best");
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  };
  draw();
}

/* ---------------- listening room ---------------- */
function cloneMark() {
  const mark = document.createElement("span");
  mark.className = "clone-mark";
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", "voice-cloning model");
  mark.textContent = " ◈";
  return mark;
}

let nowPlaying = null; // one clip at a time

function fmtTime(s) {
  if (!isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/* Compact device-colored player: play button, seek bar, time. */
function makePlayer(src, label) {
  const wrap = document.createElement("div");
  wrap.className = "mini-player";

  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = src;

  const btn = document.createElement("button");
  btn.className = "pp";
  btn.setAttribute("aria-label", "Play " + label);
  btn.appendChild(ppIcon(false));

  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "seek";
  seek.min = 0; seek.max = 1000; seek.value = 0;
  seek.setAttribute("aria-label", "Seek " + label);

  const time = document.createElement("span");
  time.className = "p-time";
  time.textContent = "0:00";

  const setIcon = playing => {
    btn.replaceChildren(ppIcon(playing));
    btn.setAttribute("aria-label", (playing ? "Pause " : "Play ") + label);
    wrap.classList.toggle("playing", playing);
  };

  btn.addEventListener("click", () => {
    if (audio.paused) {
      if (nowPlaying && nowPlaying !== audio) nowPlaying.pause();
      nowPlaying = audio;
      audio.play();
    } else audio.pause();
  });
  audio.addEventListener("play", () => setIcon(true));
  audio.addEventListener("pause", () => setIcon(false));
  audio.addEventListener("ended", () => { setIcon(false); seek.value = 0; time.textContent = fmtTime(audio.duration); });
  audio.addEventListener("loadedmetadata", () => (time.textContent = fmtTime(audio.duration)));
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
    time.textContent = fmtTime(audio.currentTime || audio.duration);
  });
  seek.addEventListener("input", () => {
    if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
  });

  wrap.append(btn, seek, time);
  return wrap;
}

function ppIcon(playing) {
  const svg = el("svg", { viewBox: "0 0 12 12", width: 12, height: 12, "aria-hidden": "true" });
  if (playing) {
    el("rect", { x: 1.5, y: 1, width: 3.2, height: 10, fill: "currentColor" }, svg);
    el("rect", { x: 7.3, y: 1, width: 3.2, height: 10, fill: "currentColor" }, svg);
  } else {
    el("path", { d: "M2 1 L11 6 L2 11 Z", fill: "currentColor" }, svg);
  }
  return svg;
}

function renderListening(data) {
  const mount = document.getElementById("listening");
  for (const utt of data.texts) {
    const block = document.createElement("div");
    block.className = "utt-block";
    const h = document.createElement("h3");
    h.textContent = utt.id.replaceAll("_", " ");
    const t = document.createElement("p");
    t.className = "utt-text";
    t.textContent = "“" + utt.text + "”";
    const grid = document.createElement("div");
    grid.className = "player-grid";
    for (const m of data.models) {
      const u = m.utterances[utt.id];
      const card = document.createElement("div");
      card.className = "player " + (m.device === "cpu" ? "cpu" : "gpu");
      const head = document.createElement("div");
      head.className = "p-head";
      const name = document.createElement("div");
      name.className = "p-name";
      name.textContent = m.name;
      if (m.cloning) name.appendChild(cloneMark());
      const dev = document.createElement("span");
      dev.className = "p-dev";
      dev.textContent = (m.device || "?").toUpperCase();
      head.append(name, dev);
      card.appendChild(head);
      if (u && !u.error) {
        card.appendChild(makePlayer(`audio/${m.id}/${utt.id}.mp3`, `${m.name} — ${utt.id}`));
      } else {
        card.classList.add("missing");
        card.appendChild(document.createTextNode(u?.error ? "failed: " + u.error.slice(0, 60) : "no sample"));
      }
      grid.appendChild(card);
    }
    block.append(h, t, grid);
    mount.appendChild(block);
  }
}

/* ---------------- boot ---------------- */
fetch("data.json").then(r => r.json()).then(data => {
  const M = data.models;
  document.getElementById("hardware-line").textContent =
    `${M.length} models · ${data.texts.length} utterances · median of ${data.repeat} runs · ${data.hardware}`;

  const fastest = M.filter(m => m.rtf_median != null).sort((a, b) => a.rtf_median - b.rtf_median)[0];
  const bestMos = M.filter(m => m.mos != null).sort((a, b) => b.mos - a.mos)[0];
  const lightest = M.filter(m => m.peak_rss_mb != null).sort((a, b) => a.peak_rss_mb - b.peak_rss_mb)[0];
  const kpis = document.getElementById("kpis");
  kpis.append(
    kpi("Models", String(M.length), null, M.filter(m => m.device === "cuda").length + " GPU · " + M.filter(m => m.device === "cpu").length + " CPU"),
    kpi("Fastest", fastest ? fmt(fastest.rtf_median, 3) : "—", "RTF", fastest ? fastest.name : ""),
    kpi("Best predicted MOS", bestMos ? fmt(bestMos.mos, 2) : "pending", bestMos ? "/ 5" : "", bestMos ? bestMos.name : "scoring run"),
    kpi("Lightest", lightest ? fmt(lightest.peak_rss_mb / 1024, 1) : "—", "GB RSS", lightest ? lightest.name : ""),
  );

  barChart(document.getElementById("chart-rtf"),
    M.map(m => ({ name: m.name, value: m.rtf_median, device: m.device, detail: [`load ${fmt(m.load_s, 1)}s`, `params ${m.params}`] })),
    { unit: "RTF", digits: 3, label: "Median real-time factor per model, lower is faster" });

  barChart(document.getElementById("chart-load"),
    M.map(m => ({ name: m.name, value: m.load_s, device: m.device })),
    { unit: "s", digits: 1, label: "Model load time in seconds" });

  barChart(document.getElementById("chart-rss"),
    M.map(m => ({ name: m.name, value: m.peak_rss_mb, device: m.device, detail: m.gpu_mem_mb ? [`+ ${fmt(m.gpu_mem_mb, 0)} MB GPU`] : [] })),
    { unit: "MB", digits: 0, label: "Peak resident memory in megabytes" });

  const hasQuality = M.some(m => m.mos != null);
  if (hasQuality) {
    document.getElementById("quality-panel").hidden = false;
    document.getElementById("table-index").textContent = "05";
    document.getElementById("listen-index").textContent = "06";
    barChart(document.getElementById("chart-mos"),
      M.map(m => ({ name: m.name, value: m.mos, device: m.device })),
      { unit: "MOS", digits: 2, domainMax: 5, desc: true, label: "Predicted mean opinion score out of 5, higher is better" });
    barChart(document.getElementById("chart-wer"),
      M.map(m => ({ name: m.name, value: m.wer, device: m.device })),
      { unit: "WER", digits: 3, label: "Word error rate, lower is better" });
  }

  renderTable(M);
  renderListening(data);

  document.getElementById("footer-meta").textContent =
    `Benchmarked on ${data.hardware} · ${data.texts.length} utterances × ${data.repeat} repeats per model`;
});
