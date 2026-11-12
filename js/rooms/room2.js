/* Room 2: hall of mirrors (reflection trap).
 * Layout, solution and the beam tracer live in js/data/room2-layout.js (shared with tools/solve-room2.js).
 * Puzzle state (api.puzzle): { m: [state1, state2, state3] }.
 */
window.G = window.G || {};
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var CELL = 76, ML = 56, MT = 56, MR = 24, MB = 24;
  var T = {
    mirror: "מראה", state: "מצב", off: "שטוח (הקרן עוברת)",
    help: "לחצו על מראה (או Enter) כדי לסובב אותה. הקרן מתעדכנת מיד.",
    legendTitle: "מקרא",
    source: "מקור האור", stone: "אבן קסם", stoneLit: "אבן מוארת", statue: "פסל מדוזה", door: "חיישן הדלת", mirrorL: "מראה (אפשר לסובב)",
    board: "לוח המראות", ghost: "המצב הנכון של מראה 1",
    stoneLabel: "אבן קסם", lit: "מוארת", dark: "כבויה", shard: "רסיס מראה",
    crackDark: "הסדק חשוך… אולי צריך אור?"
  };

  var L, api, rootEl, board, svg, beamG, beamPaths = [], btns = [], stoneEls = [], doorEl, crackEl, clueBtn, crackLit = false, washEl, nextWrap;
  var timers = [], busy = false, solvedShown = false, ghostOn = false;

  function W() { return ML + L.cols * CELL + MR; }
  function H() { return MT + L.rows * CELL + MB; }
  function cx(c) { return ML + c * CELL + CELL / 2; }
  function cy(r) { return MT + r * CELL + CELL / 2; }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function reduced() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function stateName(s) { return s === "off" ? T.off : s; }

  /* ---------- drawing helpers (all colours via CSS classes / tokens) ---------- */
  function drawLamp(parent, x, y) {
    var g = el("g", { "class": "r2-lamp", transform: "translate(" + x + "," + y + ")" }, parent);
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      el("line", { x1: Math.cos(a) * 13, y1: Math.sin(a) * 13, x2: Math.cos(a) * 19, y2: Math.sin(a) * 19, "class": "r2-lamp-ray" }, g);
    }
    el("circle", { r: 10, "class": "r2-lamp-core" }, g);
    return g;
  }
  function stoneShape(g, lit) {
    while (g.firstChild) g.removeChild(g.firstChild);
    if (lit) {
      /* lit: four-point star, glowing */
      el("path", { d: "M0,-22 L6,-6 L22,0 L6,6 L0,22 L-6,6 L-22,0 L-6,-6 Z", "class": "r2-stone-lit" }, g);
      el("circle", { r: 4, "class": "r2-stone-core" }, g);
    } else {
      /* dark: rounded rough pebble */
      el("path", { d: "M-14,-6 L-6,-15 L8,-13 L15,-2 L10,12 L-5,14 L-15,6 Z", "class": "r2-stone-dark" }, g);
    }
  }
  function drawStatue(parent, x, y) {
    var g = el("g", { "class": "r2-statue", transform: "translate(" + x + "," + y + ")" }, parent);
    el("rect", { x: -24, y: 22, width: 48, height: 8, rx: 2, "class": "r2-statue-base" }, g);
    el("path", { d: "M-18,22 C-18,8 -10,4 0,4 C10,4 18,8 18,22 Z", "class": "r2-statue-body" }, g);
    el("circle", { cx: 0, cy: -8, r: 11, "class": "r2-statue-body" }, g);
    /* soft curls of hair, calm and stylised */
    el("path", { d: "M-11,-12 C-18,-14 -20,-4 -15,0 M11,-12 C18,-14 20,-4 15,0 M-6,-18 C-8,-26 0,-28 0,-20 M6,-18 C8,-26 0,-28 0,-20", "class": "r2-statue-hair" }, g);
    /* closed, downcast eyes */
    el("path", { d: "M-6,-8 q2,2 4,0 M2,-8 q2,2 4,0", "class": "r2-statue-eyes" }, g);
    return g;
  }
  function drawDoor(parent, x, y) {
    var g = el("g", { "class": "r2-door", transform: "translate(" + x + "," + y + ")" }, parent);
    el("path", { d: "M-18,20 L-18,-6 A18,18 0 0 1 18,-6 L18,20", "class": "r2-door-frame" }, g);
    el("path", { d: "M-12,20 L-12,-4 A12,12 0 0 1 12,-4 L12,20 Z", "class": "r2-door-inner" }, g);
    el("circle", { cx: 0, cy: 4, r: 4, "class": "r2-door-eye" }, g);
    return g;
  }
  function mirrorGlyph(state) {
    if (state === "off") {
      return '<svg viewBox="-30 -30 60 60" aria-hidden="true" focusable="false">' +
        '<ellipse cx="0" cy="0" rx="20" ry="6" class="r2-m-flat"/><line x1="-20" y1="0" x2="20" y2="0" class="r2-m-flatline"/></svg>';
    }
    var d = state === "/" ? "M-20,20 L20,-20" : "M-20,-20 L20,20";
    return '<svg viewBox="-30 -30 60 60" aria-hidden="true" focusable="false">' +
      '<path d="' + d + '" class="r2-m-back"/><path d="' + d + '" class="r2-m-face"/></svg>';
  }

  /* ---------- build ---------- */
  function build() {
    var w = W(), h = H();
    var wrap = document.createElement("div");
    wrap.className = "r2-wrap";

    board = document.createElement("div");
    board.className = "r2-board";
    board.setAttribute("role", "group");
    board.setAttribute("aria-label", T.board);
    board.style.aspectRatio = w + " / " + h;

    svg = el("svg", { viewBox: "0 0 " + w + " " + h, "class": "r2-svg", "aria-hidden": "true", focusable: "false" });
    board.appendChild(svg);

    /* floor */
    el("rect", { x: ML, y: MT, width: L.cols * CELL, height: L.rows * CELL, rx: 6, "class": "r2-floor" }, svg);
    for (var c = 0; c <= L.cols; c++) el("line", { x1: ML + c * CELL, y1: MT, x2: ML + c * CELL, y2: MT + L.rows * CELL, "class": "r2-gridline" }, svg);
    for (var r = 0; r <= L.rows; r++) el("line", { x1: ML, y1: MT + r * CELL, x2: ML + L.cols * CELL, y2: MT + r * CELL, "class": "r2-gridline" }, svg);

    /* crack (secret clue) */
    if (L.crack) {
      var kx = cx(L.crack.col), ky = cy(L.crack.row);
      crackEl = el("path", { d: "M" + (kx - 28) + "," + (ky + 20) + " l10,-8 l6,6 l10,-14 l8,4 l12,-16", "class": "r2-crack" }, svg);
    }

    /* beam (under stones and statue) */
    beamG = el("g", { "class": "r2-beam" }, svg);
    beamPaths = [el("polyline", { "class": "r2-beam-halo", points: "" }, beamG), el("polyline", { "class": "r2-beam-core", points: "" }, beamG)];

    /* source, door, statue, stones */
    drawLamp(svg, ML - 30, cy(L.source.row));
    doorEl = drawDoor(svg, cx(L.door.col), MT - 30);
    drawStatue(svg, cx(L.statue.col), cy(L.statue.row));
    stoneEls = L.stones.map(function (s) {
      var g = el("g", { "class": "r2-stone", transform: "translate(" + cx(s.col) + "," + cy(s.row) + ")" }, svg);
      stoneShape(g, false);
      return g;
    });

    /* mirror buttons over the SVG */
    btns = L.mirrors.map(function (m, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "r2-mirror";
      b.style.left = ((ML + m.col * CELL + CELL / 2) / w * 100) + "%";
      b.style.top = ((MT + m.row * CELL + CELL / 2) / h * 100) + "%";
      b.style.width = (CELL / w * 100) + "%";
      b.style.height = (CELL / h * 100) + "%";
      b.innerHTML = '<span class="r2-num" aria-hidden="true">' + m.id + '</span><span class="r2-glyph"></span>';
      b.addEventListener("click", function () { rotate(i); });
      board.appendChild(b);
      return b;
    });

    /* secret clue: the floor crack. Always focusable; it only "answers" while the beam crosses it. */
    if (L.crack) {
      clueBtn = document.createElement("button");
      clueBtn.type = "button";
      clueBtn.className = "g-hotspot r2-clue";
      clueBtn.setAttribute("aria-label", api.clueInfo.label);
      clueBtn.style.left = (cx(L.crack.col) / w * 100) + "%";
      clueBtn.style.top = (cy(L.crack.row) / h * 100) + "%";
      if (api.clueFound()) clueBtn.classList.add("g-hotspot--found");
      clueBtn.addEventListener("click", function () {
        if (api.clueFound()) return;
        if (!crackLit) { api.say(T.crackDark, "info"); return; }
        api.clue();
        clueBtn.classList.add("g-hotspot--found");
      });
      board.appendChild(clueBtn);
    }

    washEl = document.createElement("div");
    washEl.className = "r2-wash";
    washEl.setAttribute("aria-hidden", "true");
    board.appendChild(washEl);

    /* side panel: help + legend + continue */
    var side = document.createElement("div");
    side.className = "r2-side g-col";
    side.innerHTML =
      '<p class="r2-help caption">' + T.help + '</p>' +
      '<div class="g-stone r2-legend"><h2 class="label r2-legend-title">' + T.legendTitle + '</h2><ul></ul></div>';
    var ul = side.querySelector("ul");
    legendItem(ul, function (s) { drawLamp(s, 0, 0); }, T.source);
    legendItem(ul, function (s) { var g = el("g", {}, s); stoneShape(g, false); g.setAttribute("class", "r2-stone"); }, T.stone);
    legendItem(ul, function (s) { var g = el("g", { "class": "r2-stone r2-stone--on" }, s); stoneShape(g, true); }, T.stoneLit);
    legendItem(ul, function (s) { drawStatue(s, 0, -2); }, T.statue);
    legendItem(ul, function (s) { drawDoor(s, 0, -2); }, T.door);
    legendItem(ul, function (s) { el("path", { d: "M-16,16 L16,-16", "class": "r2-m-back" }, s); el("path", { d: "M-16,16 L16,-16", "class": "r2-m-face" }, s); }, T.mirrorL);

    nextWrap = document.createElement("div");
    nextWrap.className = "r2-next";
    side.appendChild(nextWrap);

    wrap.appendChild(board);
    wrap.appendChild(side);
    rootEl.appendChild(wrap);
  }

  function legendItem(ul, draw, label) {
    var li = document.createElement("li");
    var s = el("svg", { viewBox: "-30 -30 60 60", "class": "r2-legend-icon", "aria-hidden": "true", focusable: "false" });
    draw(s);
    li.appendChild(s);
    var t = document.createElement("span");
    t.textContent = label;
    li.appendChild(t);
    ul.appendChild(li);
  }

  /* ---------- state + beam ---------- */
  function states() { return api.puzzle.m; }

  function renderMirrors() {
    var st = states();
    btns.forEach(function (b, i) {
      b.querySelector(".r2-glyph").innerHTML = mirrorGlyph(st[i]);
      b.setAttribute("aria-label", T.mirror + " " + L.mirrors[i].id + ", " + T.state + " " + stateName(st[i]) +
        (ghostOn && i === 0 ? ". " + T.ghost + ": " + stateName(L.solution[0]) : ""));
      b.setAttribute("data-state", st[i]);
    });
  }

  function beamPoints(res) {
    var pts = [[ML - 18, cy(L.source.row)]];
    res.path.forEach(function (p) { pts.push([cx(p.col), cy(p.row)]); });
    if (res.exit) {
      var last = pts[pts.length - 1], d = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] }[res.exit.dir];
      var reach = res.door ? (res.exit.dir === "N" || res.exit.dir === "S" ? CELL / 2 + 22 : CELL / 2 + 18) : CELL / 2;
      pts.push([last[0] + d[0] * reach, last[1] + d[1] * reach]);
    } else if (res.statue) {
      var p0 = pts[pts.length - 2], p1 = pts[pts.length - 1];
      /* stop at the statue's edge, not inside it */
      pts[pts.length - 1] = [p1[0] - (p1[0] - p0[0]) * 0.35, p1[1] - (p1[1] - p0[1]) * 0.35];
    }
    return pts;
  }

  function drawBeam(res, animate) {
    var pts = beamPoints(res), len = 0;
    for (var i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    var str = pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ");
    var ms = animate && !reduced() ? Math.min(900, 40 * res.path.length + 200) : 0;
    beamPaths.forEach(function (pl) {
      pl.setAttribute("points", str);
      pl.style.transition = "none";
      pl.style.strokeDasharray = len + " " + len;
      pl.style.strokeDashoffset = ms ? len : 0;
    });
    if (ms) {
      beamG.getBoundingClientRect(); /* reflow so the transition restarts */
      beamPaths.forEach(function (pl) {
        pl.style.transition = "stroke-dashoffset " + ms + "ms linear";
        pl.style.strokeDashoffset = 0;
      });
    }
    return ms;
  }

  function paintTargets(res) {
    L.stones.forEach(function (s, i) {
      var on = res.stones.indexOf(s.id) !== -1, g = stoneEls[i];
      if ((g.getAttribute("data-on") === "1") !== on) {
        stoneShape(g, on);
        g.setAttribute("data-on", on ? "1" : "0");
        g.setAttribute("class", "r2-stone" + (on ? " r2-stone--on" : ""));
      }
    });
    var onCrack = L.crack && res.path.some(function (p) { return p.col === L.crack.col && p.row === L.crack.row; });
    crackLit = !!onCrack;
    if (crackEl) crackEl.setAttribute("class", "r2-crack" + (onCrack || api.clueFound() ? " r2-crack--on" : ""));
    if (clueBtn) clueBtn.classList.toggle("r2-clue--lit", crackLit);
    doorEl.setAttribute("class", "r2-door" + (res.door ? " r2-door--reached" : ""));
  }

  function update(animate) {
    var res = L.trace(L, states());
    var ms = drawBeam(res, animate);
    paintTargets(res);
    if (res.statue) petrify(ms);
    else if (L.solves(L, res)) showSolved(animate);
  }

  function rotate(i) {
    if (busy || solvedShown) return;
    var m = L.mirrors[i], st = states();
    var k = m.states.indexOf(st[i]);
    st[i] = m.states[(k + 1) % m.states.length];
    api.save();
    renderMirrors();
    update(true);
  }

  function setBusy(on) {
    busy = on;
    btns.forEach(function (b) { if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); });
  }

  function petrify(delay) {
    setBusy(true);
    /* Count the penalty and reset saved state at once, so a reload mid-animation can't skip the −5. */
    api.puzzle.m = L.initial.slice();
    api.wrong(api.room.statueMessage);
    later(function () {
      washEl.classList.remove("r2-wash--on");
      void washEl.offsetWidth;
      washEl.classList.add("r2-wash--on");
      later(function () {
        renderMirrors();
        update(false);
        setBusy(false);
      }, 900);
      later(function () { washEl.classList.remove("r2-wash--on"); }, 1800);
    }, delay + 150);
  }

  function showSolved(announce) {
    solvedShown = true;
    rootEl.querySelector(".r2-wrap").classList.add("r2-solved");
    btns.forEach(function (b) { b.setAttribute("aria-disabled", "true"); });
    var b3 = btns[2];
    if (!b3.querySelector(".r2-shard")) {
      var img = document.createElement("img");
      img.className = "r2-shard";
      img.src = api.icon("sym-mirror-shard.svg");
      img.alt = T.shard;
      b3.appendChild(img);
    }
    api.say(api.room.solvedMessage, "right");
    if (!nextWrap.firstChild) {
      var nb = document.createElement("button");
      nb.type = "button";
      nb.className = "g-btn g-btn--primary";
      nb.textContent = api.content.ui.next;
      nb.addEventListener("click", function () { api.solve(); });
      nextWrap.appendChild(nb);
      if (announce) later(function () { try { nb.focus(); } catch (e) {} }, 50);
    }
  }

  function showGhost() {
    if (ghostOn || !btns[0]) return;
    ghostOn = true;
    btns[0].classList.add("r2-mirror--hint");
    var gh = document.createElement("span");
    gh.className = "r2-ghost";
    gh.setAttribute("aria-hidden", "true");
    gh.innerHTML = mirrorGlyph(L.solution[0]);
    btns[0].appendChild(gh);
    renderMirrors();
  }

  /* ---------- CSS (tokens only, scoped under .room-2) ---------- */
  var CSS = [
    ".room-2 .r2-wrap { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-start; }",
    ".room-2 .r2-board { position: relative; direction: ltr; width: min(612px, 100%); flex: 0 1 612px; }",
    ".room-2 .r2-svg { display: block; width: 100%; height: 100%; }",
    ".room-2 .r2-side { flex: 1 1 200px; max-width: 280px; }",
    ".room-2 .r2-help { margin: 0; color: var(--text); background: var(--stone-700); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }",
    ".room-2 .r2-legend { padding: var(--space-3); }",
    ".room-2 .r2-legend-title { margin: 0 0 var(--space-2); color: var(--gold-500); }",
    ".room-2 .r2-legend ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }",
    ".room-2 .r2-legend li { display: flex; align-items: center; gap: var(--space-2); font-size: 16px; line-height: 22px; color: var(--text); }",
    ".room-2 .r2-legend-icon { width: 32px; height: 32px; flex: none; }",
    /* floor */
    ".room-2 .r2-floor { fill: var(--stone-800); stroke: var(--gold-700); stroke-width: 2; }",
    ".room-2 .r2-gridline { stroke: var(--stone-600); stroke-width: 1; }",
    ".room-2 .r2-crack { fill: none; stroke: var(--stone-500); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: stroke .4s; }",
    /* crack hotspot: no glint while dark (still focusable), glints while lit, steady teal once found */
    ".room-2 .r2-clue { position: absolute; transform: translate(-50%, -50%); width: 48px; height: 48px; padding: 0; margin: 0; }",
    ".room-2 .r2-clue::after { inset: 16px; }",
    ".room-2 .r2-clue:not(.r2-clue--lit):not(.g-hotspot--found)::after { animation: none; opacity: 0; }",
    ".room-2 .r2-crack--on { stroke: var(--teal-200); stroke-width: 3; filter: drop-shadow(0 0 4px var(--teal-400)); }",
    /* beam */
    ".room-2 .r2-beam polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }",
    ".room-2 .r2-beam-core { stroke: var(--beam); stroke-width: 5; }",
    ".room-2 .r2-beam-halo { stroke: var(--beam); stroke-width: 14; opacity: .25; }",
    /* source */
    ".room-2 .r2-lamp-core { fill: var(--beam); }",
    ".room-2 .r2-lamp-ray { stroke: var(--beam); stroke-width: 3; stroke-linecap: round; }",
    /* stones: dark pebble vs lit star (shape AND glow) */
    ".room-2 .r2-stone-dark { fill: var(--stone-600); stroke: var(--stone-400); stroke-width: 2; stroke-linejoin: round; }",
    ".room-2 .r2-stone-lit { fill: var(--teal-200); stroke: var(--teal-400); stroke-width: 2; stroke-linejoin: round; }",
    ".room-2 .r2-stone-core { fill: var(--text); }",
    ".room-2 .r2-stone--on { filter: drop-shadow(0 0 6px var(--teal-400)) drop-shadow(0 0 12px var(--teal-400)); }",
    /* statue */
    ".room-2 .r2-statue-body { fill: var(--stone-400); stroke: var(--stone-500); stroke-width: 1.5; }",
    ".room-2 .r2-statue-base { fill: var(--stone-500); }",
    ".room-2 .r2-statue-hair { fill: none; stroke: var(--petrify); stroke-width: 2.5; stroke-linecap: round; }",
    ".room-2 .r2-statue-eyes { fill: none; stroke: var(--stone-700); stroke-width: 1.5; stroke-linecap: round; }",
    /* door */
    ".room-2 .r2-door-frame { fill: none; stroke: var(--gold-500); stroke-width: 3; stroke-linecap: round; }",
    ".room-2 .r2-door-inner { fill: var(--stone-900); stroke: var(--gold-700); stroke-width: 1.5; transition: fill .4s; }",
    ".room-2 .r2-door-eye { fill: var(--stone-500); }",
    ".room-2 .r2-door--reached .r2-door-inner { fill: var(--beam); }",
    ".room-2 .r2-door--reached .r2-door-eye { fill: var(--teal-400); }",
    ".room-2 .r2-door--reached { filter: drop-shadow(0 0 8px var(--teal-400)); }",
    /* mirrors */
    ".room-2 .r2-mirror { position: absolute; transform: translate(-50%, -50%); min-width: var(--touch-min); min-height: var(--touch-min); padding: 0; margin: 0;",
    "  border: 2px solid var(--gold-700); border-radius: var(--radius-md); background: transparent; cursor: pointer; display: grid; place-items: center; transition: box-shadow .2s, border-color .2s; }",
    ".room-2 .r2-mirror:hover { border-color: var(--gold-500); box-shadow: var(--glow-gold); }",
    ".room-2 .r2-mirror:focus-visible { outline: var(--focus-width) solid var(--gold-300); outline-offset: 3px; }",
    ".room-2 .r2-mirror[aria-disabled='true'] { cursor: default; box-shadow: none; }",
    ".room-2 .r2-glyph, .room-2 .r2-glyph svg { width: 100%; height: 100%; display: block; }",
    ".room-2 .r2-m-back { stroke: var(--stone-900); stroke-width: 9; stroke-linecap: round; }",
    ".room-2 .r2-m-face { stroke: var(--gold-300); stroke-width: 5; stroke-linecap: round; }",
    ".room-2 .r2-m-flat { fill: none; stroke: var(--gold-500); stroke-width: 2; stroke-dasharray: 4 3; }",
    ".room-2 .r2-m-flatline { stroke: var(--gold-300); stroke-width: 2; }",
    ".room-2 .r2-num { position: absolute; top: 2px; inset-inline-start: 4px; font-size: 14px; line-height: 16px; font-weight: 700; color: var(--gold-300); pointer-events: none; }",
    ".room-2 .r2-mirror--hint { border-color: var(--gold-300); box-shadow: var(--glow-gold); }",
    ".room-2 .r2-ghost { position: absolute; bottom: -10px; right: -10px; width: 30px; height: 30px; border-radius: var(--radius-round); background: var(--parchment-100);",
    "  border: 2px solid var(--gold-500); opacity: .9; pointer-events: none; }",
    ".room-2 .r2-ghost .r2-m-back { stroke: none; }",
    ".room-2 .r2-ghost .r2-m-face { stroke: var(--ink); stroke-width: 7; }",
    ".room-2 .r2-ghost svg { width: 100%; height: 100%; display: block; }",
    ".room-2 .r2-shard { position: absolute; width: 60%; height: 60%; inset: 20%; filter: drop-shadow(0 0 6px var(--teal-400)); pointer-events: none; animation: r2-reveal .8s ease-out both; }",
    ".room-2 .r2-solved .r2-mirror:nth-of-type(3) .r2-glyph { opacity: .35; }",
    /* petrify wash: one fade in and out, never flashing */
    ".room-2 .r2-wash { position: absolute; inset: 0; background: var(--petrify); opacity: 0; pointer-events: none; border-radius: var(--radius-md); mix-blend-mode: saturation; }",
    ".room-2 .r2-wash--on { animation: r2-petrify 1.8s ease-in-out 1 both; }",
    "@keyframes r2-petrify { 0% { opacity: 0; } 35% { opacity: .85; } 100% { opacity: 0; } }",
    "@keyframes r2-reveal { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }",
    ".room-2 .r2-next:empty { display: none; }",
    "@media (prefers-reduced-motion: reduce) { .room-2 .r2-shard { animation: none; } .room-2 .r2-wash--on { animation-duration: 2.4s; }",
    "  .room-2 .r2-crack, .room-2 .r2-door-inner, .room-2 .r2-mirror { transition: none; } }"
  ].join("\n");

  G.rooms.register(2, {
    mount: function (root, a) {
      api = a; rootEl = root; L = G.room2Layout;
      timers = []; busy = false; solvedShown = false; ghostOn = false;
      api.style(CSS);
      var st = api.puzzle.m, valid = st && st.length === L.mirrors.length &&
        st.every(function (s, i) { return L.mirrors[i].states.indexOf(s) !== -1; });
      if (!valid) { api.puzzle.m = L.initial.slice(); api.save(); }
      /* a saved state that hits the statue (reload mid-reset) goes back to the start */
      if (L.trace(L, api.puzzle.m).statue) { api.puzzle.m = L.initial.slice(); api.save(); }
      build();
      renderMirrors();
      update(false);
    },
    unmount: function () {
      timers.forEach(clearTimeout);
      timers = [];
      btns = []; stoneEls = []; beamPaths = []; clueBtn = null; crackLit = false;
    },
    onHint: function (level) {
      if (level === 3) showGhost();
    }
  });
})();
