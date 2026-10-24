(() => {
  "use strict";

  const WORDS = window.WORDS || [];
  const KEY = "lexiqueA1.v1";

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
  const LESSONS = ["Pr", "L1", "L2", "L3", "L4"];

  // ---------- état persistant ----------
  const defaults = {
    mastered: {},
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

  // ordre aléatoire stable pendant la session
  const shuffleRank = new Map();
  WORDS.forEach((w) => shuffleRank.set(w.id, Math.random()));

  const $ = (id) => document.getElementById(id);
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
  WORDS.forEach((w) => { w._search = norm(w.fr + " " + w.tts) + " " + w.zh; });

  // ---------- audio ----------
  const audio = new Audio();
  audio.preload = "auto";
  let playingBtn = null;
  const stopUi = () => { if (playingBtn) playingBtn.classList.remove("playing"); playingBtn = null; };
  audio.addEventListener("ended", stopUi);
  audio.addEventListener("pause", stopUi);
  audio.addEventListener("error", stopUi);

  function play(word, btn) {
    stopUi();
    audio.pause();
    audio.src = word.audio[state.voice] || word.audio.f;
    audio.playbackRate = state.slow ? 0.7 : 1;
    if ("preservesPitch" in audio) audio.preservesPitch = true;
    playingBtn = btn;
    btn.classList.add("playing");
    audio.play().catch(stopUi);
  }

  // ---------- filtres ----------
  function chip(label, count, pressed, onClick) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.innerHTML = label + (count != null ? `<span class="n">${count}</span>` : "");
    b.addEventListener("click", onClick);
    return b;
  }

  function renderFilters() {
    const units = [...new Set(WORDS.map((w) => w.unit))].sort((a, b) => a - b);
    const u = $("units");
    u.innerHTML = "";
    u.append(chip("全部 Tout", WORDS.length, state.unit === "all", () => setF("unit", "all")));
    units.forEach((n) => {
      const c = WORDS.filter((w) => w.unit === n).length;
      u.append(chip(`U${n}`, c, state.unit === n, () => setF("unit", n)));
    });

    const inUnit = WORDS.filter((w) => state.unit === "all" || w.unit === state.unit);
    const l = $("lessons");
    l.innerHTML = "";
    l.append(chip("全部 Tout", inUnit.length, state.lesson === "all", () => setF("lesson", "all")));
    LESSONS.forEach((les) => {
      const c = inUnit.filter((w) => w.lesson === les).length;
      if (c) l.append(chip(les, c, state.lesson === les, () => setF("lesson", les)));
    });

    const scope = inUnit.filter((w) => state.lesson === "all" || w.lesson === state.lesson);
    const done = scope.filter((w) => state.mastered[w.id]).length;
    const s = $("status");
    s.innerHTML = "";
    s.append(chip("全部 Tous", scope.length, state.status === "all", () => setF("status", "all")));
    s.append(chip("要复习 À revoir", scope.length - done, state.status === "todo", () => setF("status", "todo")));
    s.append(chip("已掌握 Maîtrisés", done, state.status === "done", () => setF("status", "done")));

    // mobile : garder la puce active visible dans les rangées défilantes
    document.querySelectorAll(".chips").forEach((row) => {
      const on = row.querySelector('[aria-pressed="true"]');
      if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 40);
    });
  }

  function setF(key, val) {
    state[key] = val;
    if (key === "unit") state.lesson = "all";
    save();
    render();
  }

  function visibleWords() {
    const q = norm($("q").value.trim());
    let list = WORDS.filter((w) =>
      (state.unit === "all" || w.unit === state.unit) &&
      (state.lesson === "all" || w.lesson === state.lesson) &&
      (state.status === "all" || (state.status === "done") === !!state.mastered[w.id]) &&
      (!q || w._search.includes(q))
    );
    if (state.shuffle) list = list.slice().sort((a, b) => shuffleRank.get(a.id) - shuffleRank.get(b.id));
    return list;
  }

  // ---------- liste ----------
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function itemHtml(w) {
    const p = POS[w.pos] || { zh: w.pos, fr: w.pos, cls: "" };
    const done = !!state.mastered[w.id];
    const fix = w.fix
      ? `<button type="button" class="fix-badge" data-act="fix" title="原文 / original : ${esc(w.zhOrig)}">已更正</button>`
      : "";
    return `<li class="item${done ? " done" : ""}" data-id="${w.id}">
      <button type="button" class="play" data-act="play" aria-label="Écouter ${esc(w.tts)} · 播放">${ICON_PLAY}</button>
      <div class="words">
        <div class="line1">
          <span class="fr-word${state.hideFr ? " hidden-text" : ""}" lang="fr" data-act="reveal">${esc(w.fr)}</span>
          <span class="pos ${p.cls}" title="${esc(p.fr)}">${p.zh}</span>
          <span class="meta">U${w.unit} · ${w.lesson}</span>
        </div>
        <div class="line2">
          <span class="zh-word${state.hideZh ? " hidden-text" : ""}" lang="zh-Hans" data-act="reveal">${esc(w.zh)}</span>
          ${fix}
        </div>
      </div>
      <label class="master">
        <input type="checkbox" data-act="master"${done ? " checked" : ""} aria-label="已掌握 · je maîtrise ${esc(w.fr)}">
        <span class="box">${ICON_CHECK}</span>
        <span class="lbl">掌握<br>maîtrisé</span>
      </label>
    </li>`;
  }

  function renderProgress() {
    const total = WORDS.length;
    const done = WORDS.filter((w) => state.mastered[w.id]).length;
    $("prog-count").textContent = done;
    $("prog-total").textContent = total;
    $("prog-bar").style.width = (total ? (100 * done) / total : 0) + "%";
  }

  function render() {
    renderFilters();
    renderProgress();
    const list = visibleWords();
    $("list").innerHTML = list.map(itemHtml).join("");
    $("empty").hidden = list.length > 0;
    $("result-info").textContent = `${list.length} 个单词 · ${list.length} mot${list.length > 1 ? "s" : ""}`;
  }

  // ---------- événements ----------
  $("list").addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const li = el.closest(".item");
    const w = WORDS.find((x) => x.id === Number(li.dataset.id));
    const act = el.dataset.act;
    if (act === "play") play(w, el);
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

  $("list").addEventListener("change", (e) => {
    if (e.target.dataset.act !== "master") return;
    const li = e.target.closest(".item");
    const id = Number(li.dataset.id);
    if (e.target.checked) state.mastered[id] = true;
    else delete state.mastered[id];
    save();
    li.classList.toggle("done", e.target.checked);
    renderProgress();
    renderFilters();
    // en filtre « à revoir » / « maîtrisés », l'élément sort de la liste après un court délai
    if (state.status !== "all") {
      setTimeout(() => {
        li.remove();
        const n = $("list").children.length;
        $("empty").hidden = n > 0;
        $("result-info").textContent = `${n} 个单词 · ${n} mot${n > 1 ? "s" : ""}`;
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

  render();
})();
