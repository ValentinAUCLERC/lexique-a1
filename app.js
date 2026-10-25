(() => {
  "use strict";

  const WORDS = window.WORDS || [];
  const UNITS = window.UNITS || [];
  const KEY = "lexiqueA1.v1";
  // Exercices interactifs Talents : seul index.html est archivé (ni JS ni images) -> inutilisables, masqués.
  const SHOW_EXOS = false;

  const POS = {
    "n.m.": { zh: "阳性名词", fr: "n. m.", cls: "m" },
    "n.f.": { zh: "阴性名词", fr: "n. f.", cls: "f" },
    "n.mf.": { zh: "阴阳同形名词", fr: "n. m. ou f.", cls: "" },
    "n.m.pl.": { zh: "阳性复数", fr: "n. m. pl.", cls: "m" },
    "n.f.pl.": { zh: "阴性复数", fr: "n. f. pl.", cls: "f" },
    "v.": { zh: "动词", fr: "verbe", cls: "" },
    "adj.": { zh: "形容词", fr: "adj.", cls: "" },
    "adv.": { zh: "副词", fr: "adv.", cls: "" },
    "expr.": { zh: "表达", fr: "expr.", cls: "" },
    "prép.": { zh: "介词", fr: "prép.", cls: "" },
    "pron.": { zh: "代词", fr: "pron.", cls: "" },
    "conj.": { zh: "连词", fr: "conj.", cls: "" },
  };
  const LESSONS = ["L1", "L2", "L3", "L4", "Pr"];
  const LESSON_LABEL = { L1: "第1课 Leçon 1", L2: "第2课 Leçon 2", L3: "第3课 Leçon 3", L4: "第4课 Leçon 4", Pr: "项目 Projet" };

  // ---------- état persistant ----------
  const defaults = {
    mastered: {},
    view: "units",
    curUnit: 0,
    unit: "all",
    lesson: "all",
    status: "all",
    hideZh: false,
    hideFr: false,
    slow: false,
    voice: "f",
    shuffle: false,
  };
  let state;
  try {
    state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {
    state = Object.assign({}, defaults);
  }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* mode privé */ }
  };

  const shuffleRank = new Map();
  WORDS.forEach((w) => shuffleRank.set(w.id, Math.random()));
  const byId = new Map(WORDS.map((w) => [w.id, w]));

  const $ = (id) => document.getElementById(id);
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
  WORDS.forEach((w) => { w._search = norm(w.fr + " " + w.tts) + " " + w.zh; });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  // ---------- audio des mots ----------
  const audio = new Audio();
  audio.preload = "auto";
  let playingBtn = null;
  const stopUi = () => { if (playingBtn) playingBtn.classList.remove("playing"); playingBtn = null; };
  audio.addEventListener("ended", stopUi);
  audio.addEventListener("pause", stopUi);
  audio.addEventListener("error", stopUi);

  // un seul son à la fois (mots + lecteurs des leçons)
  document.addEventListener("play", (e) => {
    document.querySelectorAll("audio").forEach((a) => { if (a !== e.target) a.pause(); });
    if (e.target !== audio) audio.pause();
  }, true);

  function play(word, btn, source) {
    stopUi();
    audio.pause();
    const useNative = source ? source === "native" : !!word.native;
    audio.src = useNative && word.native ? word.native : (word.audio[state.voice] || word.audio.f);
    audio.playbackRate = state.slow ? 0.7 : 1;
    if ("preservesPitch" in audio) audio.preservesPitch = true;
    playingBtn = btn;
    btn.classList.add("playing");
    audio.play().catch(stopUi);
  }

  // ---------- composants ----------
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function chip(label, count, pressed, onClick) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.innerHTML = label + (count != null ? `<span class="n">${count}</span>` : "");
    b.addEventListener("click", onClick);
    return b;
  }

  function itemHtml(w, showMeta = true) {
    const p = POS[w.pos] || { zh: w.pos, fr: w.pos, cls: "" };
    const done = !!state.mastered[w.id];
    const fix = w.fix
      ? `<button type="button" class="fix-badge" data-act="fix" title="原文 / original : ${esc(w.zhOrig)}">已更正</button>`
      : "";
    const src = w.native
      ? `<span class="src native" title="教材原声 · enregistrement du manuel">原声</span><button type="button" class="src alt-play" data-act="play-ai" title="AI 发音 · écouter la synthèse vocale">AI ▶</button>`
      : `<span class="src" title="语音合成 · synthèse vocale">AI</span>`;
    return `<li class="item${done ? " done" : ""}" data-id="${w.id}">
      <button type="button" class="play" data-act="play" aria-label="Écouter ${esc(w.tts)} · 播放">${ICON_PLAY}</button>
      <div class="words">
        <div class="line1">
          <span class="fr-word${state.hideFr ? " hidden-text" : ""}" lang="fr" data-act="reveal">${esc(w.fr)}</span>
          <span class="pos ${p.cls}" title="${esc(p.fr)}">${p.zh}</span>
          ${showMeta ? `<span class="meta">U${w.unit} · ${w.lesson}</span>` : ""}
        </div>
        <div class="line2">
          <span class="zh-word${state.hideZh ? " hidden-text" : ""}" lang="zh-Hans" data-act="reveal">${esc(w.zh)}</span>
          ${fix}
          ${src}
        </div>
      </div>
      <label class="master">
        <input type="checkbox" data-act="master"${done ? " checked" : ""} aria-label="已掌握 · je maîtrise ${esc(w.fr)}">
        <span class="box">${ICON_CHECK}</span>
        <span class="lbl">掌握<br>maîtrisé</span>
      </label>
    </li>`;
  }

  function playerHtml(item, label) {
    if (!item.audio) return `<p class="player-label">${label} — 音频缺失 · audio indisponible</p>`;
    const tr = item.transcript && item.transcript.length
      ? `<details class="transcript"><summary>文字稿 · Transcription (${item.transcript.length})</summary>
           <div class="tr-lines">${item.transcript.map((s) =>
             `<button type="button" class="tr-line" data-s="${s.s}" data-e="${s.e}"><span class="ts">${fmt(s.s)}</span>${esc(s.t)}</button>`).join("")}</div>
         </details>`
      : "";
    return `<div class="player">
      <p class="player-label">🎧 ${label}${item.duration ? ` · ${fmt(item.duration)}` : ""}
        <span class="rates"><button type="button" data-rate="0.75">0.75×</button><button type="button" data-rate="1" class="on">1×</button></span></p>
      <audio controls preload="none" src="${esc(item.audio)}"></audio>
      ${tr}
    </div>`;
  }

  const filterStatus = (list) => list.filter((w) => state.status === "all" || (state.status === "done") === !!state.mastered[w.id]);
  const order = (list) => (state.shuffle ? list.slice().sort((a, b) => shuffleRank.get(a.id) - shuffleRank.get(b.id)) : list);

  function statusChips(scope) {
    const done = scope.filter((w) => state.mastered[w.id]).length;
    const s = $("status");
    s.innerHTML = "";
    s.append(chip("全部 Tous", scope.length, state.status === "all", () => setF("status", "all")));
    s.append(chip("要复习 À revoir", scope.length - done, state.status === "todo", () => setF("status", "todo")));
    s.append(chip("已掌握 Maîtrisés", done, state.status === "done", () => setF("status", "done")));
  }

  function keepActiveChipVisible() {
    document.querySelectorAll(".chips").forEach((row) => {
      const on = row.querySelector('[aria-pressed="true"]');
      if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 40);
    });
  }

  // ---------- vue lexique ----------
  function renderLexiqueFilters() {
    const units = [...new Set(WORDS.map((w) => w.unit))].sort((a, b) => a - b);
    const u = $("units");
    u.innerHTML = "";
    u.append(chip("全部 Tout", WORDS.length, state.unit === "all", () => setF("unit", "all")));
    units.forEach((n) => u.append(chip(`U${n}`, WORDS.filter((w) => w.unit === n).length, state.unit === n, () => setF("unit", n))));

    const inUnit = WORDS.filter((w) => state.unit === "all" || w.unit === state.unit);
    const l = $("lessons");
    l.innerHTML = "";
    l.append(chip("全部 Tout", inUnit.length, state.lesson === "all", () => setF("lesson", "all")));
    LESSONS.forEach((les) => {
      const c = inUnit.filter((w) => w.lesson === les).length;
      if (c) l.append(chip(les, c, state.lesson === les, () => setF("lesson", les)));
    });
    statusChips(inUnit.filter((w) => state.lesson === "all" || w.lesson === state.lesson));
  }

  function renderLexique() {
    renderLexiqueFilters();
    const q = norm($("q").value.trim());
    const list = order(filterStatus(WORDS.filter((w) =>
      (state.unit === "all" || w.unit === state.unit) &&
      (state.lesson === "all" || w.lesson === state.lesson) &&
      (!q || w._search.includes(q))
    )));
    $("list").innerHTML = list.map((w) => itemHtml(w)).join("");
    $("empty").hidden = list.length > 0;
    $("result-info").textContent = `${list.length} 个单词 · ${list.length} mot${list.length > 1 ? "s" : ""}`;
  }

  // ---------- vue unité ----------
  function renderUnitTabs() {
    const t = $("unit-tabs");
    t.innerHTML = "";
    UNITS.forEach((u) => {
      const ws = WORDS.filter((w) => w.unit === u.n);
      const done = ws.filter((w) => state.mastered[w.id]).length;
      const b = chip(`U${u.n}`, `${done}/${ws.length}`, state.curUnit === u.n, () => { location.hash = `#unit/${u.n}`; });
      t.append(b);
    });
  }

  function lessonCount(n, key) {
    const ws = WORDS.filter((w) => w.unit === n && w.lesson === key);
    return `${ws.filter((w) => state.mastered[w.id]).length}/${ws.length} 已掌握`;
  }

  function renderUnit() {
    renderUnitTabs();
    const u = UNITS.find((x) => x.n === state.curUnit) || UNITS[0];
    if (!u) { $("unit-view").innerHTML = "<p class='empty'>units.js manquant</p>"; return; }
    const unitWords = WORDS.filter((w) => w.unit === u.n);
    statusChips(unitWords);

    const lessons = u.lessons.slice().sort((a, b) => LESSONS.indexOf(a.key) - LESSONS.indexOf(b.key));
    const keysWithAudio = new Set(lessons.map((l) => l.key));
    let html = `<div class="unit-head">
        <div class="kicker">单元 ${u.n} · UNITÉ ${u.n}</div>
        <h2>${esc(u.titleZh)}</h2>
        <div class="fr" lang="fr">${esc(u.titleFr)}</div>
        <div class="unit-stats">${unitWords.length} 个单词 · ${unitWords.filter((w) => state.mastered[w.id]).length} 已掌握 · ${lessons.length} 段词汇录音 · ${u.evals.length ? "含单元测评 · avec évaluation" : ""}</div>
      </div>`;

    const section = (key, titleZh, titleFr, item) => {
      const ws = order(filterStatus(unitWords.filter((w) => w.lesson === key)));
      const exos = u.exercises.filter((e) => e.lesson === key);
      return `<section class="section" data-unit="${u.n}" data-lesson="${key}">
        <div class="section-head">
          <h3><span class="les">${LESSON_LABEL[key] || key}</span>${esc(titleZh || "")}</h3>
          <span class="count" data-count>${lessonCount(u.n, key)}</span>
        </div>
        ${titleFr ? `<div class="sub" lang="fr">${esc(titleFr)}</div>` : ""}
        ${item ? playerHtml(item, "词汇录音 · Audio vocabulaire") : ""}
        <p class="words-head">词汇 · Vocabulaire (${ws.length})</p>
        <ul class="list">${ws.map((w) => itemHtml(w, false)).join("")}</ul>
        ${ws.length ? "" : `<p class="empty">— 没有符合条件的单词 · aucun mot —</p>`}
        ${SHOW_EXOS && exos.length ? `<div class="exos"><span class="exos-label">在线练习（存档，可能不完整）· Exercices interactifs (archive, peut être incomplet)</span>
          ${exos.map((e) => `<a class="exo" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.typeZh ? e.typeZh + " · " : "")}${esc(e.type)}</a>`).join("")}</div>` : ""}
      </section>`;
    };

    lessons.forEach((l) => { html += section(l.key, l.titleZh, l.titleFr, l); });
    // mots de leçons sans enregistrement
    LESSONS.filter((k) => !keysWithAudio.has(k) && unitWords.some((w) => w.lesson === k))
      .forEach((k) => { html += section(k, "", "", null); });

    u.evals.forEach((ev, i) => {
      html += `<section class="section eval">
        <div class="section-head"><h3><span class="les">单元测评</span>Évaluation${u.evals.length > 1 ? " " + (i + 1) : ""}</h3></div>
        <div class="sub">听力部分：先读题，再听录音 · Partie orale : lire les consignes, puis écouter. 题目见课本 · Sujet dans le livre.</div>
        ${playerHtml(ev, "测评录音 · Audio évaluation")}
      </section>`;
    });

    const prev = UNITS.find((x) => x.n === u.n - 1);
    const next = UNITS.find((x) => x.n === u.n + 1);
    html += `<nav class="unit-pager">
      ${prev ? `<a href="#unit/${prev.n}">← U${prev.n} ${esc(prev.titleZh)}</a>` : "<span></span>"}
      ${next ? `<a href="#unit/${next.n}">U${next.n} ${esc(next.titleZh)} →</a>` : "<span></span>"}
    </nav>`;
    $("unit-view").innerHTML = html;
  }

  // ---------- rendu global ----------
  function renderProgress() {
    const total = WORDS.length;
    const done = WORDS.filter((w) => state.mastered[w.id]).length;
    $("prog-count").textContent = done;
    $("prog-total").textContent = total;
    $("prog-bar").style.width = (total ? (100 * done) / total : 0) + "%";
  }

  function render() {
    document.body.classList.toggle("view-units", state.view === "units");
    document.body.classList.toggle("view-lexique", state.view === "lexique");
    $("tab-units").classList.toggle("active", state.view === "units");
    $("tab-lexique").classList.toggle("active", state.view === "lexique");
    $("tab-units").href = `#unit/${state.curUnit}`;
    renderProgress();
    if (state.view === "units") renderUnit();
    else renderLexique();
    keepActiveChipVisible();
  }

  function setF(key, val) {
    state[key] = val;
    if (key === "unit") state.lesson = "all";
    save();
    render();
  }

  function route() {
    const h = location.hash;
    const m = h.match(/^#unit\/(\d+)/);
    const prevView = state.view, prevUnit = state.curUnit;
    if (m) { state.view = "units"; state.curUnit = Number(m[1]); }
    else if (h === "#lexique") state.view = "lexique";
    save();
    render();
    if (prevView !== state.view || prevUnit !== state.curUnit) window.scrollTo(0, 0);
  }

  // ---------- événements ----------
  const main = document.querySelector("main");

  main.addEventListener("click", (e) => {
    // vitesse des lecteurs
    const rate = e.target.closest("[data-rate]");
    if (rate) {
      const player = rate.closest(".player");
      player.querySelector("audio").playbackRate = Number(rate.dataset.rate);
      player.querySelectorAll("[data-rate]").forEach((b) => b.classList.toggle("on", b === rate));
      return;
    }
    // ligne de transcription -> lecture à cet instant
    const line = e.target.closest(".tr-line");
    if (line) {
      const a = line.closest(".player").querySelector("audio");
      a.currentTime = Number(line.dataset.s);
      a.play();
      return;
    }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const li = el.closest(".item");
    if (!li) return;
    const w = byId.get(Number(li.dataset.id));
    const act = el.dataset.act;
    if (act === "play") play(w, el);
    else if (act === "play-ai") play(w, li.querySelector(".play"), "ai");
    else if (act === "reveal" && el.classList.contains("hidden-text")) {
      el.classList.remove("hidden-text");
      if (el.classList.contains("fr-word")) play(w, li.querySelector(".play"));
    } else if (act === "fix") {
      const existing = li.querySelector(".fix-detail");
      if (existing) existing.remove();
      else {
        const d = document.createElement("div");
        d.className = "fix-detail";
        d.innerHTML = `PDF : <s>${esc(w.zhOrig)}</s> → <strong>${esc(w.zh)}</strong><br>${esc(w.fix)}`;
        li.querySelector(".words").append(d);
      }
    }
  });

  // surlignage de la phrase en cours dans la transcription
  main.addEventListener("timeupdate", (e) => {
    const a = e.target;
    if (!(a instanceof HTMLAudioElement)) return;
    const box = a.closest(".player");
    if (!box) return;
    const t = a.currentTime;
    box.querySelectorAll(".tr-line").forEach((l) => {
      const on = t >= Number(l.dataset.s) && t < Number(l.dataset.e);
      if (on && !l.classList.contains("now")) {
        l.classList.add("now");
        const c = l.parentElement;
        if (c && c.closest("details[open]")) c.scrollTop = l.offsetTop - c.offsetTop - 60;
      } else if (!on) l.classList.remove("now");
    });
  }, true);

  main.addEventListener("change", (e) => {
    if (e.target.dataset.act !== "master") return;
    const li = e.target.closest(".item");
    const w = byId.get(Number(li.dataset.id));
    if (e.target.checked) state.mastered[w.id] = true;
    else delete state.mastered[w.id];
    save();
    li.classList.toggle("done", e.target.checked);
    renderProgress();
    if (state.view === "units") {
      renderUnitTabs();
      statusChips(WORDS.filter((x) => x.unit === state.curUnit));
      const sec = li.closest(".section");
      const c = sec && sec.querySelector("[data-count]");
      if (c) c.textContent = lessonCount(w.unit, w.lesson);
    } else renderLexiqueFilters();
    keepActiveChipVisible();
    if (state.status !== "all") {
      setTimeout(() => {
        li.remove();
        if (state.view === "lexique") {
          const n = $("list").children.length;
          $("empty").hidden = n > 0;
          $("result-info").textContent = `${n} 个单词 · ${n} mot${n > 1 ? "s" : ""}`;
        }
      }, 450);
    }
  });

  let t;
  $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });

  [["hide-zh", "hideZh"], ["hide-fr", "hideFr"], ["slow", "slow"], ["shuffle", "shuffle"]].forEach(([id, key]) => {
    const el = $(id);
    el.checked = !!state[key];
    el.addEventListener("change", () => {
      state[key] = el.checked;
      if (key === "shuffle" && el.checked) WORDS.forEach((w) => shuffleRank.set(w.id, Math.random()));
      save();
      if (key !== "slow") render();
    });
  });

  $("male-voice").checked = state.voice === "m";
  $("male-voice").addEventListener("change", (e) => {
    state.voice = e.target.checked ? "m" : "f";
    save();
  });

  $("reset").addEventListener("click", () => {
    if (confirm("确定要重置所有进度吗？\nRéinitialiser toute la progression ?")) {
      state.mastered = {};
      save();
      render();
    }
  });

  window.addEventListener("hashchange", route);
  if (!location.hash) location.replace(state.view === "lexique" ? "#lexique" : `#unit/${state.curUnit}`);
  route();
})();
