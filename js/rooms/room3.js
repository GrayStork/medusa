/* Room 3: Archive of memories. Scrolls (always readable), then 3 steps:
 *   1 timeline (4 cards into 4 numbered slots, checked with a button)
 *   2 classification (6 statements into fact / opinion / hypothesis bins, checked per placement)
 *   3 reflect (free text, bonus at reflectMinChars)
 * Input: drag (pointer events + floating clone), tap card then tap target, or keyboard (Enter/Space).
 * All state lives in api.puzzle (P):
 *   step 1..4 (4 = finished), tlPool [idx], tlSlots [idx|null x4], tlLocked [bool x4],
 *   clPool [idx], clPlaced {idx: binId}, clMistakes, text, scrollsOpen, hint3, shortWarned
 */
(function () {
  var api, root, R, P, h, esc;
  var sel = null;          // selected card key ("t2" / "s4") for tap / keyboard placement
  var drag = null;         // active pointer drag
  var focusKey = null;     // data-fkey to focus after the next render
  var timers = [];
  var scrollsNode = null;
  var doneOpen = {};       // which completed-step panels are expanded (not persisted)
  var winHandlers = null;

  var BIN_ORDER = ["fact", "opinion", "hypothesis"];
  var LETTERS = ["א׳", "ב׳", "ג׳"];
  var WRONG_CLASSIFY = [
    "לא בדיוק. בדקו מי אמר את זה.",
    "עוד לא. חפשו מילה שמסגירה את סוג המשפט.",
    "כמעט. בדקו בכמה מגילות זה מופיע.",
    "לא בדיוק. האם זה משהו שקרה, מה שמישהו חושב, או ניחוש?"
  ];

  var CSS = [
    ".room-3 .r3 { display: flex; flex-direction: column; gap: var(--space-4); }",
    ".room-3 .r3-scrolls { display: flex; flex-direction: column; gap: var(--space-2); }",
    ".room-3 .r3-scrolls > summary, .room-3 .r3-done > summary { min-height: var(--touch-min); display: flex; align-items: center; gap: var(--space-2);",
    "  cursor: pointer; color: var(--gold-500); font-weight: 700; font-size: 18px; border-radius: var(--radius-md); padding: 0 var(--space-2); }",
    ".room-3 .r3-scrolls > summary:focus-visible, .room-3 .r3-done > summary:focus-visible, .room-3 [data-drop]:focus-visible { outline: var(--focus-width) solid var(--gold-300); outline-offset: 3px; }",
    ".room-3 .r3-scroll-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }",
    ".room-3 .r3-scroll { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); font-size: 18px; line-height: 28px; }",
    ".room-3 .r3-scroll-head { display: flex; align-items: center; gap: var(--space-3); }",
    ".room-3 .r3-scroll h3 { margin: 0; font-size: 20px; line-height: 28px; }",
    ".room-3 .r3-portrait { width: 72px; height: 72px; flex: none; margin: 0; border-radius: var(--radius-round); }",
    ".room-3 .r3-portrait .art-fallback { width: 100%; height: 100%; }",
    ".room-3 .r3-portrait .art-fallback img { width: 40px; height: 40px; }",
    ".room-3 .r3-note { margin: 0; color: var(--text-muted); }",
    /* secret clue: a torn scroll tucked at the end of the note line, away from every drop target */
    ".room-3 .r3-note-row { display: flex; align-items: center; gap: var(--space-3); }",
    ".room-3 .r3-clue { flex: none; margin-inline-start: auto; width: 44px; height: 44px; padding: 0; display: grid; place-items: center; }",
    ".room-3 .r3-clue::after { inset: 15px; }",
    ".room-3 .r3-clue svg { width: 30px; height: 30px; fill: var(--stone-600); stroke: var(--stone-400); stroke-width: 1.5; stroke-linejoin: round; opacity: .8; transform: rotate(-14deg); }",
    ".room-3 .r3-clue.g-hotspot--found svg { stroke: var(--teal-400); }",
    ".room-3 .r3-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }",
    ".room-3 .r3-step { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3) var(--space-1) var(--space-4);",
    "  border: 2px solid var(--stone-500); border-radius: var(--radius-round); color: var(--text-muted); font-size: 16px; line-height: 22px; }",
    ".room-3 .r3-step-num { width: 28px; height: 28px; border-radius: var(--radius-round); display: grid; place-items: center; border: 2px solid currentColor; font-weight: 700; }",
    ".room-3 .r3-step--current { border-color: var(--teal-400); color: var(--text); box-shadow: var(--glow-teal); font-weight: 500; }",
    ".room-3 .r3-step--done { border-color: var(--gold-500); color: var(--gold-500); }",
    ".room-3 .r3-stage { display: flex; flex-direction: column; gap: var(--space-3); }",
    ".room-3 .r3-stage h2 { margin: 0; }",
    ".room-3 .r3-help { margin: 0; color: var(--text-muted); }",
    ".room-3 .r3-tl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-6); align-items: start; }",
    ".room-3 .r3-col-title { margin: 0 0 var(--space-2); color: var(--text-muted); }",
    ".room-3 .r3-slots { display: flex; flex-direction: column; gap: var(--space-2); }",
    ".room-3 .r3-slot { display: flex; align-items: center; gap: var(--space-3); min-height: 72px; padding: var(--space-2);",
    "  border: 2px dashed var(--stone-400); border-radius: var(--radius-md); background: var(--stone-800); cursor: pointer; }",
    ".room-3 .r3-slot--filled { border-style: solid; border-color: var(--stone-500); }",
    ".room-3 .r3-slot--over, .room-3 .r3-pool--over { border-style: solid; border-color: var(--gold-300); box-shadow: var(--glow-gold); }",
    ".room-3 .r3-slot-num { width: 36px; height: 36px; flex: none; border-radius: var(--radius-round); display: grid; place-items: center;",
    "  border: 2px solid var(--gold-500); color: var(--gold-500); font-weight: 700; font-size: 18px; }",
    ".room-3 .r3-slot-empty { color: var(--text-muted); font-size: 14px; line-height: 20px; }",
    ".room-3 .r3-slot .g-card { flex: 1; max-width: none; }",
    ".room-3 .r3-pool { display: flex; flex-direction: column; gap: var(--space-2); min-height: 72px; padding: var(--space-2);",
    "  border: 2px dashed transparent; border-radius: var(--radius-lg); }",
    ".room-3 .r3-pool--row { flex-direction: row; flex-wrap: wrap; justify-content: center; }",
    ".room-3 .r3-pool--tl .g-card { max-width: none; }",
    ".room-3 .r3-pool-empty { color: var(--text-muted); font-size: 14px; line-height: 20px; align-self: center; margin: auto; }",
    ".room-3 .r3-card { min-height: var(--touch-min); user-select: none; -webkit-user-select: none; transition: transform .15s; }",
    ".room-3 .r3-card--sel { outline: var(--focus-width) solid var(--teal-400); outline-offset: 2px; box-shadow: var(--glow-teal); transform: translateY(-2px); }",
    ".room-3 .r3-card--sel::after { content: \"נבחר\"; margin-inline-start: auto; padding-inline-start: var(--space-2); font-size: 14px; line-height: 28px; font-weight: 700; color: var(--teal-ink); }",
    ".room-3 .r3-card--locked { cursor: default; }",
    ".room-3 .r3-card--locked:hover { background: var(--parchment-100); }",
    ".room-3 .r3-origin { opacity: .35; }",
    ".room-3 .g-card { touch-action: pan-y; -webkit-touch-callout: none; }",
    ".room-3 .r3-ghost { position: fixed; z-index: 1000; pointer-events: none; margin: 0; }",
    ".room-3 .r3-bins { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }",
    ".room-3 .r3-bins .g-bin { min-width: 0; cursor: pointer; }",
    ".room-3 .r3-bins .g-card { max-width: none; }",
    ".room-3 .r3-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }",
    ".room-3 .r3-done { border: 2px solid var(--stone-500); border-radius: var(--radius-md); background: var(--stone-700); padding: 0 var(--space-3); }",
    ".room-3 .r3-done[open] { padding-bottom: var(--space-3); }",
    ".room-3 .r3-done ol { margin: 0; padding-inline-start: var(--space-6); }",
    ".room-3 .r3-done-bins { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }",
    ".room-3 .r3-done-bins h4 { margin: 0; color: var(--gold-500); }",
    ".room-3 .r3-done-bins ul { margin: 0; padding-inline-start: var(--space-4); font-size: 16px; line-height: 24px; }",
    ".room-3 .r3-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }",
    ".room-3 .r3-q { font-size: 22px; line-height: 32px; font-weight: 500; color: var(--text); }",
    ".room-3 .r3-meter { margin: 0; color: var(--text-muted); }",
    ".room-3 .r3-meter--ok { color: var(--success); }",
    "@media (prefers-reduced-motion: reduce) { .room-3 .r3-card { transition: none; } .room-3 .r3-card--sel { transform: none; } }"
  ].join("\n");

  /* ---------- helpers ---------- */
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  /* Shuffled order where no item sits at its own index (so the start is never the answer). */
  function derange(n) {
    var a;
    do { a = shuffle(range(n)); } while (a.some(function (v, i) { return v === i; }));
    return a;
  }
  function isIdentityLike(order) { // classification: avoid the content-file order (bins grouped)
    return order.every(function (v, i) { return v === i; });
  }

  function init() {
    if (P.v === 1) return;
    P.v = 1;
    P.step = 1;
    P.tlPool = derange(R.timeline.length);
    P.tlSlots = R.timeline.map(function () { return null; });
    P.tlLocked = R.timeline.map(function () { return false; });
    var cl;
    do { cl = shuffle(range(R.statements.length)); } while (isIdentityLike(cl));
    P.clPool = cl;
    P.clPlaced = {};
    P.clMistakes = 0;
    P.text = "";
    P.scrollsOpen = true;
    P.hint3 = false;
    P.shortWarned = false;
    api.save();
  }

  function keyStep(key) { return key.charAt(0) === "t" ? 1 : 2; }
  function keyIdx(key) { return +key.slice(1); }
  function isLocked(key) {
    var i = keyIdx(key);
    if (key.charAt(0) === "t") { var s = P.tlSlots.indexOf(i); return s >= 0 && P.tlLocked[s]; }
    return P.clPlaced[i] != null;
  }

  /* ---------- markup ---------- */
  function cardHtml(key, text, opts) {
    opts = opts || {};
    var locked = opts.locked, isSel = sel === key;
    var cls = "g-card r3-card" + (locked ? " g-card--correct r3-card--locked" : "") + (isSel ? " r3-card--sel" : "");
    var a = locked
      ? ' aria-disabled="true"'
      : ' tabindex="0" role="button" aria-pressed="' + (isSel ? "true" : "false") + '"';
    return '<div class="' + cls + '" data-key="' + key + '" data-fkey="' + key + '"' + a + '>' + esc(text) +
      (locked ? '<span class="r3-sr"> (נכון)</span>' : "") + '</div>';
  }

  function buildScrolls() {
    var d = h('<details class="r3-scrolls"' + (P.scrollsOpen ? " open" : "") + '><summary>המגילות (לחצו כדי לפתוח או לסגור)</summary>' +
      '<div class="r3-scroll-row"></div><div class="r3-note-row"><p class="caption r3-note">' + esc(R.fictionNote) + '</p></div></details>');
    d.querySelector(".r3-note-row").appendChild(clueButton());
    var row = d.querySelector(".r3-scroll-row");
    R.scrolls.forEach(function (s) {
      var p = h('<article class="g-parchment r3-scroll"><div class="r3-scroll-head"></div><div class="r3-scroll-text">' + esc(s.text) + '</div></article>');
      var head = p.querySelector(".r3-scroll-head");
      head.appendChild(G.ui.art(s.portrait, s.title, "sym-scroll-seal.svg", "r3-portrait"));
      head.appendChild(h('<h3>' + esc(s.title) + '</h3>'));
      row.appendChild(p);
    });
    d.addEventListener("toggle", function () { P.scrollsOpen = d.open; api.save(); });
    return d;
  }

  /* Secret clue: a small torn scroll. Lives in the scrolls panel (built once per mount), so renders never drop it. */
  var TORN = '<svg viewBox="0 0 30 30" aria-hidden="true" focusable="false">' +
    '<path d="M6 5h16l2 3-2 3 2 3-3 2 2 3-2 3 1 3H8l-2-3V5z"/><path d="M10 10h8M10 14h6M10 18h7" fill="none"/></svg>';
  function clueButton() {
    var b = h('<button type="button" class="g-hotspot r3-clue">' + TORN + '</button>');
    b.setAttribute("aria-label", api.clueInfo.label);
    if (api.clueFound()) b.classList.add("g-hotspot--found");
    b.addEventListener("click", function () {
      if (api.clueFound()) return;
      api.clue();
      b.classList.add("g-hotspot--found");
    });
    return b;
  }

  function stepsBar() {
    var labels = ["ציר הזמן", "עובדה, דעה או השערה", "מחשבה אחרונה"];
    var html = '<ol class="r3-steps" aria-label="שלבי החדר">';
    labels.forEach(function (l, i) {
      var n = i + 1, st = P.step > n ? "done" : P.step === n ? "current" : "todo";
      html += '<li class="r3-step r3-step--' + st + '"' + (st === "current" ? ' aria-current="step"' : "") + '>' +
        '<span class="r3-step-num" aria-hidden="true">' + (st === "done" ? "✓" : n) + '</span>' +
        '<span>' + l + (st === "done" ? '<span class="r3-sr"> (הושלם)</span>' : "") + '</span></li>';
    });
    return h(html + '</ol>');
  }

  function doneTimeline() {
    var html = '<details class="r3-done" data-done="1"' + (doneOpen[1] ? " open" : "") + '><summary>✓ ' + esc(R.timelineTitle) + '</summary><ol>';
    R.timeline.forEach(function (t) { html += '<li>' + esc(t) + '</li>'; });
    return h(html + '</ol></details>');
  }

  function doneClassify() {
    var html = '<details class="r3-done" data-done="2"' + (doneOpen[2] ? " open" : "") + '><summary>✓ ' + esc(R.classifyTitle) + '</summary><div class="r3-done-bins">';
    BIN_ORDER.forEach(function (b) {
      html += '<div><h4>' + esc(R.bins[b]) + '</h4><ul>';
      R.statements.forEach(function (s) { if (s.bin === b) html += '<li>' + esc(s.text) + '</li>'; });
      html += '</ul></div>';
    });
    return h(html + '</div></details>');
  }

  function stageTimeline() {
    var html = '<section class="g-stone r3-stage"><h2 class="h3 gold">' + esc(R.timelineTitle) + '</h2>' +
      '<p class="r3-help label">גררו כל כרטיס למקום שלו, או לחצו על כרטיס ואז על מקום. מה קרה קודם?</p>' +
      '<div class="r3-tl"><div><p class="r3-col-title label">ציר הזמן</p><div class="r3-slots">';
    P.tlSlots.forEach(function (c, i) {
      var locked = P.tlLocked[i];
      html += '<div class="r3-slot' + (c != null ? " r3-slot--filled" : "") + '"' +
        (locked ? "" : ' data-drop="slot" data-i="' + i + '" tabindex="0" role="button"') +
        ' data-fkey="slot-' + i + '" aria-label="מקום ' + (i + 1) + '">' +
        '<span class="r3-slot-num" aria-hidden="true">' + (i + 1) + '</span>' +
        (c != null ? cardHtml("t" + c, R.timeline[c], { locked: locked }) : '<span class="r3-slot-empty">גררו לכאן כרטיס</span>') + '</div>';
    });
    html += '</div></div><div><p class="r3-col-title label">כרטיסי האירועים</p>' +
      '<div class="r3-pool r3-pool--tl" data-drop="pool" data-fkey="pool" tabindex="0" role="button" aria-label="ערימת הכרטיסים">';
    if (!P.tlPool.length) html += '<span class="r3-pool-empty">כל הכרטיסים על ציר הזמן</span>';
    P.tlPool.forEach(function (c) { html += cardHtml("t" + c, R.timeline[c]); });
    var full = P.tlSlots.every(function (c) { return c != null; });
    html += '</div></div></div><div class="r3-actions"><button class="g-btn g-btn--primary" data-act="check" data-fkey="check"' + (full ? "" : " disabled") + '>' +
      esc(G.content.ui.check) + '</button>' + (full ? "" : '<span class="caption muted">מלאו את כל ארבעת המקומות ואז לחצו על ״' + esc(G.content.ui.check) + '״.</span>') + '</div></section>';
    return h(html);
  }

  function stageClassify() {
    var html = '<section class="g-stone r3-stage"><h2 class="h3 gold">' + esc(R.classifyTitle) + '</h2>' +
      '<p class="r3-help label">העבירו כל משפט לסל המתאים. היעזרו במגילות: מי אמר את זה, וכמה מגילות מסכימות?</p>' +
      '<div class="r3-pool r3-pool--row">';
    if (!P.clPool.length) html += '<span class="r3-pool-empty">כל המשפטים מוינו</span>';
    P.clPool.forEach(function (s) { html += cardHtml("s" + s, R.statements[s].text); });
    html += '</div><div class="r3-bins">';
    BIN_ORDER.forEach(function (b) {
      html += '<div class="g-bin" data-drop="bin" data-bin="' + b + '" data-fkey="bin-' + b + '" tabindex="0" role="button" aria-label="סל ' + esc(R.bins[b]) + '">' +
        '<div class="g-bin-title">' + esc(R.bins[b]) + '</div>';
      R.statements.forEach(function (s, i) { if (P.clPlaced[i] === b) html += cardHtml("s" + i, s.text, { locked: true }); });
      html += '</div>';
    });
    return h(html + '</div></section>');
  }

  function stageReflect() {
    var el = h('<section class="g-stone r3-stage"><h2 class="h3 gold">שלב ג׳: מחשבה אחרונה</h2>' +
      '<label class="r3-q" for="r3-text">' + esc(R.reflectQuestion) + '</label>' +
      '<textarea id="r3-text" class="g-textarea" data-fkey="text" maxlength="600" placeholder="כתבו כאן במילים שלכם..."></textarea>' +
      '<p class="caption r3-meter" aria-live="polite"></p>' +
      '<div class="r3-actions"><button class="g-btn g-btn--primary" data-act="finish" data-fkey="finish">סיום</button></div></section>');
    var ta = el.querySelector("textarea"), meter = el.querySelector(".r3-meter"), btn = el.querySelector("[data-act=finish]");
    ta.value = P.text || "";
    function update() {
      var left = R.reflectMinChars - ta.value.trim().length;
      if (left <= 0) {
        meter.textContent = "✓ מעולה! התשובה הזאת תזכה אתכם ב־" + R.reflectBonus + " נקודות בונוס.";
        meter.className = "caption r3-meter r3-meter--ok";
        btn.textContent = "סיום";
      } else {
        meter.textContent = "עוד " + left + " תווים ותקבלו " + R.reflectBonus + " נקודות בונוס. אפשר גם לסיים בלי.";
        meter.className = "caption r3-meter";
        btn.textContent = P.shortWarned ? "סיום בלי בונוס" : "סיום";
      }
    }
    var saveT = null;
    ta.addEventListener("input", function () {
      P.text = ta.value; update();
      clearTimeout(saveT); saveT = later(function () { api.save(); }, 400);
    });
    update();
    return el;
  }

  function stageFinished() {
    return h('<section class="g-stone r3-stage"><p class="body-lg" style="margin:0">' + esc(R.solvedMessage) + '</p>' +
      '<div class="r3-actions"><button class="g-btn g-btn--primary" data-act="done" data-fkey="done">' + esc(G.content.ui.next) + '</button></div></section>');
  }

  function render() {
    var wrap = h('<div class="r3"></div>');
    wrap.appendChild(scrollsNode);
    wrap.appendChild(stepsBar());
    if (P.step > 1) wrap.appendChild(doneTimeline());
    if (P.step > 2) wrap.appendChild(doneClassify());
    wrap.appendChild(P.step === 1 ? stageTimeline() : P.step === 2 ? stageClassify() : P.step === 3 ? stageReflect() : stageFinished());
    wrap.querySelectorAll(".r3-done").forEach(function (d) {
      d.addEventListener("toggle", function () { doneOpen[d.getAttribute("data-done")] = d.open; });
    });
    root.innerHTML = "";
    root.appendChild(wrap);
    if (focusKey) {
      var f = root.querySelector('[data-fkey="' + focusKey + '"]');
      if (f) { try { f.focus(); } catch (e) { /* not focusable */ } }
      focusKey = null;
    }
  }

  function flash(keys, cls, ms) {
    keys.forEach(function (k) {
      var el = root.querySelector('[data-key="' + k + '"]');
      if (!el) return;
      el.classList.add(cls);
      later(function () { el.classList.remove(cls); }, ms || 1200);
    });
  }

  /* ---------- moves ---------- */
  function tlMove(c, t) {
    var from = P.tlSlots.indexOf(c);
    if (t.type === "slot") {
      if (P.tlLocked[t.i] || from === t.i) return false;
      var occ = P.tlSlots[t.i];
      if (from >= 0) P.tlSlots[from] = null; else P.tlPool.splice(P.tlPool.indexOf(c), 1);
      if (occ != null) { if (from >= 0) P.tlSlots[from] = occ; else P.tlPool.push(occ); }
      P.tlSlots[t.i] = c;
      return true;
    }
    if (t.type === "pool") {
      if (from < 0) return false;
      P.tlSlots[from] = null; P.tlPool.push(c);
      return true;
    }
    return false;
  }

  /* Force timeline card c into its correct slot and lock it (hint 3). */
  function tlForce(c) {
    var from = P.tlSlots.indexOf(c);
    if (from >= 0) P.tlSlots[from] = null; else P.tlPool.splice(P.tlPool.indexOf(c), 1);
    var occ = P.tlSlots[c];
    if (occ != null) P.tlPool.push(occ);
    P.tlSlots[c] = c;
    P.tlLocked[c] = true;
  }

  function checkTimeline() {
    var wrongs = [];
    P.tlSlots.forEach(function (c, i) {
      if (c == null) return;
      if (c === i) P.tlLocked[i] = true;
      else { wrongs.push("t" + c); P.tlSlots[i] = null; P.tlPool.push(c); }
    });
    sel = null;
    if (!wrongs.length && P.tlLocked.every(Boolean)) {
      P.step = 2; api.save();
      focusKey = null; render();
      api.say("נכון! האירועים מסודרים לפי הסדר. עכשיו לשלב הבא.", "right");
      return;
    }
    api.save();
    focusKey = "check"; render();
    flash(wrongs, "g-card--wrong");
    api.wrong(wrongs.length === 1 ? "כרטיס אחד לא במקום, והוא חזר לערימה. נסו שוב." : "כמה כרטיסים לא במקום, והם חזרו לערימה. נסו שוב.");
  }

  /* Classification placement: checked immediately. Returns true when accepted. */
  function classify(s, bin) {
    var key = "s" + s;
    sel = null;
    if (R.statements[s].bin === bin) {
      P.clPool.splice(P.clPool.indexOf(s), 1);
      P.clPlaced[s] = bin;
      var all = !P.clPool.length;
      if (all) P.step = 3;
      api.save();
      focusKey = all ? "text" : (P.clPool.length ? "s" + P.clPool[0] : null);
      render();
      if (all) api.say("כל המשפטים במקומם! נשאר שלב אחרון.", "right");
      /* Only on the live transition to step 3, never on remount; the engine also awards once per game. */
      if (all && !P.clMistakes) api.achieve("perfect");
      else api.say("נכון, זו " + R.bins[bin] + ".", "right");
      return true;
    }
    P.clMistakes = (P.clMistakes || 0) + 1;
    api.save();
    focusKey = key; render();
    flash([key], "g-card--wrong");
    api.wrong(WRONG_CLASSIFY[(P.clMistakes - 1) % WRONG_CLASSIFY.length]);
    return false;
  }

  /* Drop card `key` on target descriptor {type, i | bin}. Returns true when the card moved there. */
  function dropTo(key, t, viaKeyboard) {
    if (!t || isLocked(key) || keyStep(key) !== P.step) return false;
    if (P.step === 1) {
      var ok = tlMove(keyIdx(key), t);
      sel = null;
      if (ok) {
        api.save();
        focusKey = viaKeyboard ? (t.type === "slot" ? nextFocusAfterSlot() : "t" + keyIdx(key)) : null;
        render();
        api.say("", "info");
      } else render();
      return ok;
    }
    if (P.step === 2 && t.type === "bin") return classify(keyIdx(key), t.bin);
    return false;
  }
  function nextFocusAfterSlot() {
    if (P.tlPool.length) return "t" + P.tlPool[0];
    return "check";
  }

  function targetOf(el) {
    if (!el) return null;
    var k = el.getAttribute("data-drop");
    if (k === "slot") return { type: "slot", i: +el.getAttribute("data-i") };
    if (k === "bin") return { type: "bin", bin: el.getAttribute("data-bin") };
    if (k === "pool") return { type: "pool" };
    return null;
  }

  /* Tap / Enter on a card. */
  function tapCard(key) {
    if (isLocked(key) || keyStep(key) !== P.step) return;
    if (sel && sel !== key && P.step === 1) {
      var s = P.tlSlots.indexOf(keyIdx(key));
      if (s >= 0) { dropTo(sel, { type: "slot", i: s }, true); return; } // swap into that slot
    }
    sel = sel === key ? null : key;
    focusKey = key;
    render();
    if (sel) api.say(P.step === 1 ? "הכרטיס נבחר. עכשיו לחצו על המקום שלו בציר הזמן." : "המשפט נבחר. עכשיו לחצו על הסל המתאים.", "info");
    else api.say("", "info");
  }

  /* ---------- pointer drag ---------- */
  function clearOver() {
    root.querySelectorAll(".r3-slot--over, .g-bin--over, .r3-pool--over").forEach(function (e) {
      e.classList.remove("r3-slot--over", "g-bin--over", "r3-pool--over");
    });
  }
  function overClass(el) {
    var k = el.getAttribute("data-drop");
    return k === "bin" ? "g-bin--over" : k === "pool" ? "r3-pool--over" : "r3-slot--over";
  }

  function onDown(e) {
    if (drag || (e.button != null && e.button > 0)) return;
    var card = e.target.closest && e.target.closest(".r3-card[data-key]");
    if (!card || !root.contains(card)) return;
    var key = card.getAttribute("data-key");
    if (isLocked(key) || keyStep(key) !== P.step) return;
    drag = { key: key, card: card, id: e.pointerId, sx: e.clientX, sy: e.clientY, clone: null, over: null, ox: 0, oy: 0, rect: null,
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
  // Undo everything onDown / the long-press armed on this drag record.
  function releaseTouch(d) {
    if (!d) return;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    d.card.classList.remove("g-card--dragging");
    d.card.removeEventListener("touchmove", blockTouch, { passive: false });
    d.card.removeEventListener("contextmenu", blockTouch);
  }

  function startClone(e) {
    var r = drag.card.getBoundingClientRect();
    var c = drag.card.cloneNode(true);
    c.classList.remove("r3-card--sel", "g-card--wrong");
    c.classList.add("g-card--dragging", "r3-ghost");
    drag.card.classList.remove("g-card--dragging");
    c.removeAttribute("tabindex"); c.removeAttribute("data-fkey"); c.removeAttribute("data-key");
    c.setAttribute("aria-hidden", "true");
    c.style.width = r.width + "px";
    c.style.left = r.left + "px"; c.style.top = r.top + "px";
    drag.ox = e.clientX - r.left; drag.oy = e.clientY - r.top; drag.rect = r;
    (root.closest(".room-3") || root).appendChild(c);
    drag.clone = c;
    drag.card.classList.add("r3-origin");
    if (sel) { sel = null; drag.card.classList.remove("r3-card--sel"); }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.clone) {
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.armed) {
        // touch before the long-press: small jitter is fine, a real move is a scroll
        if (dx * dx + dy * dy > 64) { releaseTouch(drag); drag = null; }
        return;
      }
      if (!drag.touch && dx * dx + dy * dy < 64) return;
      startClone(e);
    }
    e.preventDefault();
    drag.clone.style.left = (e.clientX - drag.ox) + "px";
    drag.clone.style.top = (e.clientY - drag.oy) + "px";
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var t = under && under.closest ? under.closest("[data-drop]") : null;
    if (t && !root.contains(t)) t = null;
    if (t !== drag.over) {
      clearOver();
      drag.over = t;
      if (t) t.classList.add(overClass(t));
    }
  }

  function flyBack(d) {
    var c = d.clone, r = d.rect;
    c.style.transition = "left .25s ease-out, top .25s ease-out";
    c.style.left = r.left + "px"; c.style.top = r.top + "px";
    later(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 280);
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    releaseTouch(d);
    if (!d.clone) { tapCard(d.key); return; }
    clearOver();
    var t = targetOf(d.over);
    var ok = false;
    if (t) {
      // find where the card started, for the fly-back after a wrong drop
      var startRect = d.card.getBoundingClientRect();
      ok = dropTo(d.key, t, false);
      if (!ok) {
        var back = root.querySelector('[data-key="' + d.key + '"]');
        d.rect = back ? back.getBoundingClientRect() : startRect;
      }
    }
    if (ok) { d.clone.parentNode && d.clone.parentNode.removeChild(d.clone); }
    else {
      if (!t) { d.card.classList.remove("r3-origin"); }
      flyBack(d);
    }
  }

  function onCancel(e) {
    if (!drag || (e && e.pointerId != null && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    releaseTouch(d);
    clearOver();
    if (d.clone) { d.card.classList.remove("r3-origin"); flyBack(d); }
  }

  /* ---------- clicks and keys inside the room ---------- */
  function onClick(e) {
    var act = e.target.closest("[data-act]");
    if (act && root.contains(act)) {
      var a = act.getAttribute("data-act");
      if (a === "check") checkTimeline();
      else if (a === "finish") finish();
      else if (a === "done") api.solve();
      return;
    }
    if (e.target.closest(".r3-card")) return; // cards are handled by pointer events
    var t = e.target.closest("[data-drop]");
    if (t && root.contains(t) && sel) dropTo(sel, targetOf(t), false);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      if (drag) onCancel();
      else if (sel) { sel = null; focusKey = null; render(); api.say("", "info"); }
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    var el = e.target;
    if (!el || !el.matches) return;
    if (el.matches(".r3-card[data-key]")) { e.preventDefault(); tapCard(el.getAttribute("data-key")); return; }
    if (el.matches("[data-drop]")) {
      e.preventDefault();
      if (sel) dropTo(sel, targetOf(el), true);
      else api.say(P.step === 1 ? "קודם בחרו כרטיס (Enter על כרטיס), ואז בחרו מקום." : "קודם בחרו משפט (Enter על משפט), ואז בחרו סל.", "info");
    }
  }

  /* ---------- finish ---------- */
  function finish() {
    var len = (P.text || "").trim().length;
    if (len < R.reflectMinChars && !P.shortWarned) {
      P.shortWarned = true; api.save();
      var btn = root.querySelector("[data-act=finish]");
      if (btn) btn.textContent = "סיום בלי בונוס";
      api.say("אפשר לסיים גם כך. אבל אם תכתבו לפחות " + R.reflectMinChars + " תווים, תקבלו " + R.reflectBonus + " נקודות בונוס. כדי לסיים בכל זאת, לחצו שוב.", "near");
      return;
    }
    if (len >= R.reflectMinChars) api.bonus("reflect", R.reflectBonus, "הסבר מעולה!");
    P.step = 4; api.save();
    api.solve();
  }

  /* ---------- contract ---------- */
  G.rooms.register(3, {
    mount: function (rootEl, a) {
      api = a; root = rootEl; R = a.room; P = a.puzzle;
      h = G.ui.h; esc = G.ui.esc;
      sel = null; drag = null; focusKey = null; timers = []; doneOpen = {};
      api.style(CSS);
      init();
      scrollsNode = buildScrolls();
      render();
      root.addEventListener("pointerdown", onDown);
      root.addEventListener("click", onClick);
      root.addEventListener("keydown", onKey);
      winHandlers = { move: onMove, up: onUp, cancel: onCancel, blur: function () { onCancel(); } };
      window.addEventListener("pointermove", winHandlers.move, { passive: false });
      window.addEventListener("pointerup", winHandlers.up);
      window.addEventListener("pointercancel", winHandlers.cancel);
      window.addEventListener("blur", winHandlers.blur);
    },
    unmount: function () {
      timers.forEach(clearTimeout); timers = [];
      releaseTouch(drag);
      if (drag && drag.clone && drag.clone.parentNode) drag.clone.parentNode.removeChild(drag.clone);
      drag = null; sel = null;
      if (winHandlers) {
        window.removeEventListener("pointermove", winHandlers.move, { passive: false });
        window.removeEventListener("pointerup", winHandlers.up);
        window.removeEventListener("pointercancel", winHandlers.cancel);
        window.removeEventListener("blur", winHandlers.blur);
        winHandlers = null;
      }
      if (root) {
        root.removeEventListener("pointerdown", onDown);
        root.removeEventListener("click", onClick);
        root.removeEventListener("keydown", onKey);
      }
      root = null; scrollsNode = null;
    },
    /* Hint 3: place one not-yet-correct card of the current step, once (persisted, so reloads don't add more). */
    onHint: function (level) {
      if (level !== 3 || !root || P.hint3) return;
      var placed = null;
      if (P.step === 1) {
        for (var i = 0; i < P.tlLocked.length; i++) if (!P.tlLocked[i]) { tlForce(i); placed = "t" + i; break; }
        if (placed && P.tlLocked.every(Boolean)) P.step = 2;
      } else if (P.step === 2 && P.clPool.length) {
        var s = P.clPool[0];
        P.clPool.splice(0, 1);
        P.clPlaced[s] = R.statements[s].bin;
        placed = "s" + s;
        if (!P.clPool.length) P.step = 3;
      }
      if (!placed) return;
      P.hint3 = true;
      if (drag) onCancel();
      sel = null;
      api.save();
      render();
      api.say("כרטיס אחד הונח עכשיו במקום הנכון, ומסומן ב־✓.", "info");
    }
  });
})();
