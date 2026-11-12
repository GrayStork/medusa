/* Room 5: Medusa's secret chamber, the final truth.
 * Step 1: use the mirror shard (bag) on the statue base to reveal the stone eye.
 * Step 2: order the five symbol fragments into the final sentence (drag, tap-tap or keyboard).
 * Step 3: the final choice (all choices win) -> api.finish(choiceId).
 * State (api.puzzle): step 1..3, eyeFound, order [symIds, shuffled], slots [symId|null x5], sentenceDone, choice.
 */
(function () {
  var ORDER_IDS = ["snake", "mirror", "seal", "vial", "eye"];
  /* Accessibility labels only (no game text): REVIEW move to content.js if wanted */
  var L = {
    base: "בסיס הפסל",
    slot: "מקום",
    empty: "ריק",
    pool: "חלקי המשפט",
    eyeShown: "עין האבן"
  };

  var api, root, p, R, C;
  var picked = null;          // symId currently picked (tap-tap / keyboard)
  var hint1 = false, hint3 = false;
  var drag = null;            // active drag info
  var suppressClick = false;
  var docHandlers = [];

  function el(html) { return G.ui.h(html); }
  function esc(s) { return G.ui.esc(s); }
  function on(target, type, fn, opt) { target.addEventListener(type, fn, opt); docHandlers.push([target, type, fn, opt]); }

  /* Deterministic shuffle (fixed seed), guaranteed not already in the correct order. */
  function makeOrder() {
    var a = ORDER_IDS.slice(), seed = 7331;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    if (a.join() === ORDER_IDS.join()) a.reverse();
    return a;
  }

  function correctOrderIds() {
    /* finalSentence holds fragments; map each to its symbol id */
    return C.finalSentence.map(function (frag) {
      for (var k in C.symbols) if (C.symbols[k].fragment === frag) return k;
      return null;
    });
  }

  var CSS =
    ".room-5 .r5-top { display: flex; gap: var(--space-4); align-items: center; }" +
    ".room-5 .r5-portrait { flex: none; width: 180px; }" +
    ".room-5 .r5-portrait .art { display: grid; place-items: center; }" +
    ".room-5 .r5-top .g-quote { flex: 1; padding: var(--space-4) var(--space-6); }" +
    /* secret clue: an owl carving under a sprig of ivy, at the far edge of the top row (no card can land here) */
    ".room-5 .r5-ivy { flex: none; align-self: flex-end; display: flex; flex-direction: column; align-items: center; width: 56px; }" +
    ".room-5 .r5-ivy > svg { width: 48px; height: 40px; margin-bottom: -18px; position: relative; z-index: 1; pointer-events: none; }" +
    ".room-5 .r5-ivy-leaf { fill: var(--success-ink); stroke: var(--stone-800); stroke-width: 1; opacity: .85; }" +
    ".room-5 .r5-ivy-stem { fill: none; stroke: var(--stone-500); stroke-width: 2; stroke-linecap: round; }" +
    ".room-5 .r5-clue { width: 48px; height: 48px; padding: 0; display: grid; place-items: center; }" +
    ".room-5 .r5-clue::after { inset: 17px; }" +
    ".room-5 .r5-clue .r5-owl { width: 26px; height: 26px; fill: none; stroke: var(--stone-400); stroke-width: 1.6; stroke-linecap: round; opacity: .6; }" +
    ".room-5 .r5-clue.g-hotspot--found .r5-owl { stroke: var(--teal-400); opacity: .9; }" +
    ".room-5 .r5-body { display: flex; flex-direction: column; gap: var(--space-6); }" +
    ".room-5 .r5-step { display: flex; flex-direction: column; gap: var(--space-3); }" +
    ".room-5 .r5-step-text { padding: var(--space-3) var(--space-4); font-size: 18px; line-height: 28px; }" +
    ".room-5 .r5-eye-row { display: flex; gap: var(--space-6); align-items: center; flex-wrap: wrap; }" +
    ".room-5 .r5-base { position: relative; width: 240px; min-height: var(--touch-min); padding: var(--space-2); background: none; cursor: pointer;" +
    "  border: 2px solid transparent; border-radius: var(--radius-lg); color: inherit; transition: box-shadow .4s ease, border-color .4s ease; }" +
    ".room-5 .r5-base:hover, .room-5 .r5-base--armed { border-color: var(--gold-500); }" +
    ".room-5 .r5-base--hint { box-shadow: var(--glow-gold); border-color: var(--gold-300); }" +
    ".room-5 .r5-base--found { cursor: default; border-color: var(--teal-400); }" +
    /* soft gold glint so kids find the real (clickable) pedestal, not the painted one; same timing as g-glint */
    ".room-5 .r5-base::after { content: \"\"; position: absolute; inset: -2px; border-radius: var(--radius-lg); pointer-events: none;" +
    "  border: 2px solid var(--gold-300); box-shadow: var(--glow-gold); opacity: .15; animation: g-glint 2.4s ease-in-out infinite; }" +
    ".room-5 .r5-base--found::after { content: none; animation: none; }" +
    ".room-5 .g-card { touch-action: pan-y; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }" +
    ".room-5 .r5-base svg { display: block; width: 100%; height: auto; }" +
    ".room-5 .r5-s-top { fill: var(--stone-400); } .room-5 .r5-s-mid { fill: var(--stone-500); } .room-5 .r5-s-bot { fill: var(--stone-600); }" +
    ".room-5 .r5-s-line { stroke: var(--stone-700); stroke-width: 2; fill: none; }" +
    ".room-5 .r5-s-gap { fill: var(--stone-800); }" +
    ".room-5 .r5-s-light { fill: var(--teal-200); opacity: 0; transition: opacity 1s ease; }" +
    ".room-5 .r5-base--found .r5-s-light { opacity: .35; }" +
    ".room-5 .r5-eye { position: absolute; left: 50%; bottom: 18%; transform: translateX(-50%); width: 64px; height: 64px; }" +
    ".room-5 .r5-eye img { width: 36px; height: 36px; }" +
    ".room-5 .r5-eye--reveal { animation: r5-rise 1.2s ease-out 1 both; }" +
    "@keyframes r5-rise { from { opacity: 0; transform: translate(-50%, 16px) scale(.85); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }" +
    ".room-5 .r5-found-text { max-width: 520px; padding: var(--space-3) var(--space-4); font-size: 18px; line-height: 28px; }" +
    ".room-5 .r5-slots { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); }" +
    ".room-5 .r5-slot { min-height: 96px; min-width: 0; padding: var(--space-2); border: 2px dashed var(--stone-400); border-radius: var(--radius-md);" +
    "  background: var(--stone-800); color: var(--text-muted); display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: var(--space-1); cursor: pointer; font: inherit; }" +
    ".room-5 .r5-slot-num { font-size: 14px; line-height: 20px; text-align: center; color: var(--text-muted); }" +
    ".room-5 .r5-slot--over, .room-5 .r5-slot--target:hover { border-style: solid; border-color: var(--gold-300); box-shadow: var(--glow-gold); }" +
    ".room-5 .r5-slot--filled { border-style: solid; border-color: var(--gold-700); }" +
    ".room-5 .r5-slot--hint { border-color: var(--teal-400); box-shadow: var(--glow-teal); }" +
    ".room-5 .r5-pool { display: flex; flex-wrap: wrap; gap: var(--space-3); min-height: 80px; padding: var(--space-3); border-radius: var(--radius-lg);" +
    "  border: 2px dashed transparent; }" +
    ".room-5 .r5-pool--over { border-color: var(--gold-300); }" +
    ".room-5 .r5-card { font: inherit; font-size: 18px; line-height: 26px; text-align: start; align-items: center; min-height: var(--touch-min); max-width: none; }" +
    ".room-5 .r5-slot .r5-card { width: 100%; padding: var(--space-2); font-size: 16px; line-height: 22px; gap: var(--space-1); }" +
    ".room-5 .r5-card img { width: 24px; height: 24px; flex: none; }" +
    ".room-5 .r5-card[aria-pressed=\"true\"] { border-color: var(--teal-400); box-shadow: var(--glow-teal); }" +
    ".room-5 .r5-card--hint { outline: 3px dashed var(--teal-400); outline-offset: 2px; }" +
    ".room-5 .r5-card--ghost { opacity: .35; }" +
    ".r5-clone { position: fixed; z-index: 50; pointer-events: none; margin: 0; }" +
    ".room-5 .r5-actions { display: flex; gap: var(--space-4); align-items: center; }" +
    ".room-5 .r5-sentence { text-align: center; font-size: 32px; line-height: 48px; padding: var(--space-6); box-shadow: var(--glow-teal);" +
    "  animation: r5-fade 1.4s ease-out 1 both; }" +
    "@keyframes r5-fade { from { opacity: 0; } to { opacity: 1; } }" +
    ".room-5 .r5-choices { display: flex; flex-direction: column; gap: var(--space-3); }" +
    "@media (prefers-reduced-motion: reduce) { .room-5 .r5-eye--reveal, .room-5 .r5-sentence { animation: none; } .room-5 .r5-base, .room-5 .r5-s-light { transition: none; }" +
    "  .room-5 .r5-base::after { animation: none; opacity: .45; } }" +
    "@media (max-width: 1100px) { .room-5 .r5-slot .r5-card { font-size: 15px; } .room-5 .r5-card img { display: none; } }";

  var PEDESTAL =
    '<svg viewBox="0 0 240 170" aria-hidden="true" focusable="false">' +
    '<ellipse class="r5-s-light" cx="120" cy="128" rx="80" ry="22"/>' +
    '<rect class="r5-s-top" x="40" y="10" width="160" height="22" rx="4"/>' +
    '<rect class="r5-s-mid" x="58" y="32" width="124" height="76" rx="2"/>' +
    '<path class="r5-s-line" d="M78 44v52M162 44v52M120 44v52"/>' +
    '<rect class="r5-s-gap" x="30" y="108" width="180" height="10" rx="2"/>' +
    '<rect class="r5-s-bot" x="20" y="118" width="200" height="40" rx="4"/>' +
    '<path class="r5-s-line" d="M30 138h180"/>' +
    '</svg>';

  /* ---------- build ---------- */
  function build() {
    root.innerHTML = "";
    var body = el('<div class="r5-body"></div>');

    var top = el('<div class="r5-top"><div class="r5-portrait"></div><blockquote class="g-parchment g-quote"></blockquote></div>');
    top.querySelector(".r5-portrait").appendChild(G.ui.art("char-medusa", "מדוזה", "sym-snake.svg", "art--portrait"));
    top.querySelector("blockquote").textContent = "״" + R.medusaLine + "״";
    top.appendChild(buildClue());
    body.appendChild(top);

    body.appendChild(buildEye());
    if (p.step >= 2) body.appendChild(buildSentence());
    if (p.step >= 3) body.appendChild(buildChoice());
    root.appendChild(body);
  }

  /* Secret clue: owl carving half-hidden under ivy. Rebuilt with the room; its look comes from api.clueFound(). */
  var IVY = '<svg viewBox="0 0 48 40" aria-hidden="true" focusable="false">' +
    '<path class="r5-ivy-stem" d="M4 2c10 4 16 10 20 20s10 14 20 16"/>' +
    '<path class="r5-ivy-leaf" d="M12 6c-6 0-9 5-7 10 4-1 8-4 7-10z"/><path class="r5-ivy-leaf" d="M22 16c-5 2-6 8-3 12 4-2 6-7 3-12z"/>' +
    '<path class="r5-ivy-leaf" d="M30 24c2 6 8 8 13 5-2-5-7-7-13-5z"/><path class="r5-ivy-leaf" d="M16 10c2-6 8-8 12-5-2 5-7 7-12 5z"/></svg>';
  var OWL = '<svg class="r5-owl" viewBox="0 0 26 26" aria-hidden="true" focusable="false">' +
    '<path d="M6 6l3 3M20 6l-3 3M5 9c0 10 4 14 8 14s8-4 8-14c-3-2-13-2-16 0z"/><circle cx="10" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M12 15l1 2 1-2"/></svg>';
  function buildClue() {
    var wrap = el('<div class="r5-ivy">' + IVY + '<button type="button" class="g-hotspot r5-clue">' + OWL + '</button></div>');
    var b = wrap.querySelector(".r5-clue");
    b.setAttribute("aria-label", api.clueInfo.label);
    if (api.clueFound()) b.classList.add("g-hotspot--found");
    b.addEventListener("click", function () {
      if (api.clueFound()) return;
      api.clue();
      b.classList.add("g-hotspot--found");
    });
    return wrap;
  }

  function buildEye() {
    var sec = el('<section class="r5-step r5-step-eye"><p class="g-parchment r5-step-text"></p><div class="r5-eye-row"></div></section>');
    sec.querySelector(".r5-step-text").textContent = R.stepEye;
    var row = sec.querySelector(".r5-eye-row");
    var base = el('<button type="button" class="r5-base" aria-label="' + esc(L.base) + '">' + PEDESTAL + '</button>');
    row.appendChild(base);
    if (p.eyeFound) {
      markFound(base, false);
      var t = el('<p class="g-parchment r5-found-text"></p>'); t.textContent = R.eyeFound; row.appendChild(t);
    } else {
      if (hint1) base.classList.add("r5-base--hint");
      if (api.selectedItem()) base.classList.add("r5-base--armed");
      base.onclick = onBase;
    }
    return sec;
  }

  function markFound(base, animate) {
    base.classList.add("r5-base--found");
    base.classList.remove("r5-base--hint", "r5-base--armed");
    base.setAttribute("aria-label", L.base + " · " + L.eyeShown);
    base.setAttribute("aria-disabled", "true");
    base.onclick = null;
    if (!base.querySelector(".r5-eye")) {
      var eye = el('<span class="g-medal r5-eye' + (animate ? " r5-eye--reveal" : "") + '"><img src="' + api.icon(C.symbols.eye.icon) + '" alt=""></span>');
      base.appendChild(eye);
    }
  }

  function onBase() {
    if (p.eyeFound) return;
    var sel = api.selectedItem();
    if (!sel) { api.say(R.eyeHint, "info"); return; }
    if (sel !== "mirror") { api.say(R.eyeWrongItem, "near"); return; }
    p.eyeFound = true;
    if (p.step < 2) p.step = 2;
    api.save();
    api.addItem("eye");
    api.clearSelection();
    api.say(R.eyeFound, "right");
    var base = root.querySelector(".r5-base");
    markFound(base, true);
    var t = el('<p class="g-parchment r5-found-text"></p>'); t.textContent = R.eyeFound;
    base.parentNode.appendChild(t);
    var sec = buildSentence();
    root.querySelector(".r5-body").appendChild(sec);
    setTimeout(function () { if (sec.isConnected) sec.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 400);
  }

  /* ---------- step 2: sentence ---------- */
  function buildSentence() {
    var sec = el('<section class="r5-step r5-step-sentence"><p class="g-parchment r5-step-text"></p><div class="r5-sentence-area"></div></section>');
    sec.querySelector(".r5-step-text").textContent = R.stepSentence;
    drawSentence(sec.querySelector(".r5-sentence-area"));
    return sec;
  }

  function cardHtml(symId, inSlot) {
    var s = C.symbols[symId];
    var cls = "g-card r5-card";
    if (hint3 && symId === correctOrderIds()[0] && p.slots[0] !== symId) cls += " r5-card--hint";
    return '<button type="button" class="' + cls + '" data-card="' + symId + '" aria-pressed="' + (picked === symId) + '">' +
      '<img src="' + api.icon(s.icon) + '" alt=""><span>' + esc(s.fragment) + '</span></button>';
  }

  function drawSentence(area) {
    area = area || root.querySelector(".r5-sentence-area");
    if (!area) return;
    var focusKey = document.activeElement && area.contains(document.activeElement) ?
      (document.activeElement.getAttribute("data-card") ? "c:" + document.activeElement.getAttribute("data-card") :
       document.activeElement.getAttribute("data-slot") != null ? "s:" + document.activeElement.getAttribute("data-slot") : null) : null;
    area.innerHTML = "";

    if (p.sentenceDone) {
      var q = el('<p class="g-parchment g-quote r5-sentence"></p>');
      q.textContent = "״" + C.finalSentence.join(" ") + "״";
      area.appendChild(q);
      return;
    }

    var slots = el('<div class="r5-slots"></div>');
    for (var i = 0; i < 5; i++) {
      var sid = p.slots[i];
      var label = L.slot + " " + (i + 1) + (sid ? ": " + C.symbols[sid].fragment : " · " + L.empty);
      var sl;
      if (sid) {
        sl = el('<div class="r5-slot r5-slot--filled" data-slot="' + i + '"><span class="r5-slot-num" aria-hidden="true">' + (i + 1) + '</span>' + cardHtml(sid, true) + '</div>');
        sl.querySelector("[data-card]").setAttribute("aria-label", label);
      } else {
        sl = el('<button type="button" class="r5-slot" data-slot="' + i + '" aria-label="' + esc(label) + '"><span class="r5-slot-num" aria-hidden="true">' + (i + 1) + '</span></button>');
        if (picked) sl.classList.add("r5-slot--target");
      }
      if (hint3 && i === 0 && p.slots[0] !== correctOrderIds()[0]) sl.classList.add("r5-slot--hint");
      slots.appendChild(sl);
    }
    area.appendChild(slots);

    var pool = el('<div class="r5-pool" role="group" aria-label="' + esc(L.pool) + '"></div>');
    p.order.forEach(function (symId) {
      if (p.slots.indexOf(symId) !== -1) return;
      pool.appendChild(el(cardHtml(symId, false)));
    });
    area.appendChild(pool);

    var full = p.slots.every(function (x) { return !!x; });
    var actions = el('<div class="r5-actions"><button type="button" class="g-btn g-btn--primary r5-check"></button></div>');
    var chk = actions.querySelector(".r5-check");
    chk.textContent = C.ui.check;
    chk.disabled = !full;
    chk.onclick = checkSentence;
    area.appendChild(actions);

    /* wire */
    area.querySelectorAll("[data-card]").forEach(function (c) {
      c.addEventListener("click", function (e) { e.stopPropagation(); if (suppressClick) { suppressClick = false; return; } onCard(c.getAttribute("data-card")); });
      c.addEventListener("pointerdown", startDrag);
    });
    area.querySelectorAll("button[data-slot]").forEach(function (s) {
      s.addEventListener("click", function () { if (picked) place(picked, +s.getAttribute("data-slot")); });
    });
    area.querySelectorAll("div[data-slot]").forEach(function (s) {
      s.addEventListener("click", function () { if (picked) place(picked, +s.getAttribute("data-slot")); });
    });
    pool.addEventListener("click", function () { if (picked && p.slots.indexOf(picked) !== -1) toPool(picked); });

    if (focusKey) {
      var f = focusKey.charAt(0) === "c" ? area.querySelector('[data-card="' + focusKey.slice(2) + '"]') :
        (area.querySelector('[data-slot="' + focusKey.slice(2) + '"] [data-card]') || area.querySelector('[data-slot="' + focusKey.slice(2) + '"]'));
      if (f) f.focus();
    }
  }

  function onCard(symId) {
    var inSlot = p.slots.indexOf(symId);
    if (picked && picked !== symId && inSlot !== -1) { place(picked, inSlot); return; }   // drop onto a filled slot: swap
    if (picked === symId) {
      if (inSlot !== -1) { toPool(symId); return; }   // tap a picked slotted card again: back to the pool
      picked = null;
    } else picked = symId;
    drawSentence();
  }

  function place(symId, slotIdx) {
    var from = p.slots.indexOf(symId);
    var occupant = p.slots[slotIdx];
    p.slots[slotIdx] = symId;
    if (from !== -1 && from !== slotIdx) p.slots[from] = occupant || null;
    picked = null;
    api.save();
    api.say("", "info");
    drawSentence();
  }

  function toPool(symId) {
    var i = p.slots.indexOf(symId);
    if (i !== -1) p.slots[i] = null;
    picked = null;
    api.save();
    drawSentence();
  }

  function checkSentence() {
    if (!p.slots.every(function (x) { return !!x; })) return;
    if (p.slots.join() === correctOrderIds().join()) {
      p.sentenceDone = true;
      p.step = 3;
      api.save();
      api.say("", "info");
      drawSentence();
      var sec = buildChoice();
      root.querySelector(".r5-body").appendChild(sec);
      setTimeout(function () { if (sec.isConnected) sec.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 400);
    } else {
      api.wrong(R.sentenceWrong);
    }
  }

  /* ---------- drag (pointer events + floating clone) ---------- */
  function startDrag(e) {
    if (e.button != null && e.button !== 0) return;
    var card = e.currentTarget;
    if (drag) releaseTouch(drag);
    drag = { id: card.getAttribute("data-card"), card: card, x: e.clientX, y: e.clientY, clone: null, over: null, pid: e.pointerId,
      touch: e.pointerType === "touch", armed: e.pointerType !== "touch", timer: null };
    if (drag.touch) {
      // Touch: a swipe scrolls the page; a still long-press (~250ms) arms the drag.
      var d = drag;
      d.timer = setTimeout(function () {
        d.timer = null;
        if (drag !== d) return;
        d.armed = true;
        d.card.classList.add("g-card--dragging");
        d.card.addEventListener("touchmove", blockTouch, { passive: false });
        d.card.addEventListener("contextmenu", blockTouch);
      }, LONG_PRESS_MS);
    }
  }
  var LONG_PRESS_MS = 250;
  function blockTouch(e) { e.preventDefault(); }
  // Undo everything startDrag / the long-press armed on this drag record.
  function releaseTouch(d) {
    if (!d) return;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    d.card.classList.remove("g-card--dragging");
    d.card.removeEventListener("touchmove", blockTouch, { passive: false });
    d.card.removeEventListener("contextmenu", blockTouch);
  }
  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.clone) {
      var moved = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      if (!drag.armed) {
        // touch before the long-press: a real move is a scroll, so drop the drag
        if (moved > 8) { releaseTouch(drag); drag = null; }
        return;
      }
      if (!drag.touch && moved < 8) return;
      drag.card.classList.remove("g-card--dragging");
      var r = drag.card.getBoundingClientRect();
      var cl = drag.card.cloneNode(true);
      cl.classList.add("r5-clone", "g-card--dragging");
      cl.classList.remove("r5-card--hint");
      cl.removeAttribute("data-card");
      cl.setAttribute("aria-hidden", "true");
      cl.style.width = r.width + "px";
      cl.style.left = r.left + "px"; cl.style.top = r.top + "px";
      drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
      document.body.appendChild(cl);
      drag.clone = cl;
      drag.card.classList.add("r5-card--ghost");
    }
    e.preventDefault();
    drag.clone.style.left = (e.clientX - drag.dx) + "px";
    drag.clone.style.top = (e.clientY - drag.dy) + "px";
    var t = dropTarget(e.clientX, e.clientY);
    if (t !== drag.over) {
      if (drag.over) drag.over.classList.remove("r5-slot--over", "r5-pool--over");
      if (t) t.classList.add(t.classList.contains("r5-pool") ? "r5-pool--over" : "r5-slot--over");
      drag.over = t;
    }
  }
  function dropTarget(x, y) {
    var hit = document.elementFromPoint(x, y);
    if (!hit || !root.contains(hit)) return null;
    return hit.closest("[data-slot]") || hit.closest(".r5-pool");
  }
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    var d = drag; drag = null;
    releaseTouch(d);
    if (!d.clone) return;              // a plain tap: the click handler takes it
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 0);
    d.clone.remove();
    if (d.over) d.over.classList.remove("r5-slot--over", "r5-pool--over");
    d.card.classList.remove("r5-card--ghost");
    if (!e || e.type === "pointercancel") return;
    var t = dropTarget(e.clientX, e.clientY);
    if (!t) return;
    if (t.hasAttribute("data-slot")) place(d.id, +t.getAttribute("data-slot"));
    else if (p.slots.indexOf(d.id) !== -1) toPool(d.id);
  }

  /* ---------- step 3: choice ---------- */
  function buildChoice() {
    var sec = el('<section class="r5-step r5-step-choice"><p class="g-parchment r5-step-text"></p><div class="r5-choices" role="group"></div>' +
      '<div class="r5-actions"><button type="button" class="g-btn g-btn--primary r5-confirm"></button></div></section>');
    sec.querySelector(".r5-step-text").textContent = R.stepChoice;
    var list = sec.querySelector(".r5-choices");
    var confirm = sec.querySelector(".r5-confirm");
    confirm.textContent = C.ui.next;
    confirm.disabled = p.choice == null;
    R.choices.forEach(function (ch, i) {
      var b = el('<button type="button" class="g-choice" aria-pressed="' + (p.choice === ch.id) + '"><span class="g-choice-num">' + (i + 1) + '</span><span></span></button>');
      b.lastChild.textContent = ch.text;
      b.onclick = function () {
        p.choice = ch.id; api.save();
        list.querySelectorAll(".g-choice").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        confirm.disabled = false;
      };
      list.appendChild(b);
    });
    confirm.onclick = function () { if (p.choice != null) api.finish(p.choice); };
    return sec;
  }

  /* ---------- contract ---------- */
  G.rooms.register(5, {
    mount: function (r, a) {
      root = r; api = a; R = a.room; C = a.content; p = a.puzzle;
      picked = null; hint1 = false; hint3 = false; drag = null; docHandlers = [];
      api.style(CSS);

      if (!p.step) p.step = 1;
      if (!p.order || p.order.length !== 5) p.order = makeOrder();
      if (!p.slots || p.slots.length !== 5) p.slots = [null, null, null, null, null];
      if (api.hasItem("eye")) p.eyeFound = true;
      if (p.eyeFound && p.step < 2) p.step = 2;
      if (p.sentenceDone && p.step < 3) p.step = 3;
      api.save();
      if (p.eyeFound && !api.hasItem("eye")) api.addItem("eye");

      build();

      api.onSelect(function (sel) {
        var b = root.querySelector(".r5-base");
        if (b && !p.eyeFound) b.classList.toggle("r5-base--armed", !!sel);
      });
      on(document, "pointermove", moveDrag, { passive: false });
      on(document, "pointerup", endDrag);
      on(document, "pointercancel", endDrag);
    },
    unmount: function () {
      if (drag && drag.clone) drag.clone.remove();
      releaseTouch(drag);
      drag = null;
      docHandlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2], h[3]); });
      docHandlers = [];
    },
    onHint: function (level) {
      if (level === 1) {
        hint1 = true;
        var b = root && root.querySelector(".r5-base");
        if (b && !p.eyeFound) b.classList.add("r5-base--hint");
      }
      if (level === 3) {
        hint3 = true;
        if (p.step === 2 && !p.sentenceDone) drawSentence();
      }
    }
  });
})();
