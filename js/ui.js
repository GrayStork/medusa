/* Screens, top bar, bag, dialogs, toasts, image loading with fallbacks, dev panel. */
window.G = window.G || {};
G.dev = /[?&]dev=1\b/.test(location.search);
(function () {
  var C = G.content, E = function () { return G.engine; };
  var $ = function (id) { return document.getElementById(id); };
  var ICON = "assets/img/icons/";
  var EXTS = [".webp", ".png", ".jpg"];
  var imgCache = {}; // base -> {url, w, h} | false

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  /* Try base.webp/.png/.jpg in assets/img/. cb(info|false). Works on file:// (no fetch). */
  function findImage(base, cb) {
    if (base in imgCache) { cb(imgCache[base]); return; }
    var i = 0;
    (function next() {
      if (i >= EXTS.length) { imgCache[base] = false; cb(false); return; }
      var url = "assets/img/" + base + EXTS[i++], im = new Image();
      im.onload = function () { imgCache[base] = { url: url, w: im.naturalWidth, h: im.naturalHeight }; cb(imgCache[base]); };
      im.onerror = next;
      im.src = url;
    })();
  }

  /* First existing image from a list of bases (or {base, cls} entries). cb(info, entry) or cb(false). */
  function findFirst(list, cb) {
    list = [].concat(list).filter(Boolean).map(function (e) { return typeof e === "string" ? { base: e } : e; });
    var i = 0;
    (function next() {
      if (i >= list.length) { cb(false); return; }
      var entry = list[i++];
      findImage(entry.base, function (info) { if (info) cb(info, entry); else next(); });
    })();
  }

  /* base may be one name or a fallback list: the first image that exists is used. */
  var sceneKey = null;
  function setScene(base) {
    var el = $("scene"), key = [].concat(base).join("|");
    sceneKey = key;
    el.classList.remove("scene--img");
    el.style.backgroundImage = "";
    if (!base) return;
    findFirst(base, function (info) {
      if (!info || sceneKey !== key) return;
      el.style.backgroundImage = 'url("' + info.url + '")';
      el.classList.add("scene--img");
    });
  }

  /* Framed portrait/art with a fallback medallion icon. base may be a fallback list; an entry's cls is added when it is the one used. */
  function art(base, alt, fallbackIcon, cls) {
    var box = h('<figure class="art ' + (cls || "") + '"><div class="art-fallback g-medal"><img src="' + ICON + (fallbackIcon || "sym-stone-eye.svg") + '" alt=""></div></figure>');
    findFirst(base, function (info, entry) {
      if (!info) return;
      box.innerHTML = "";
      var im = new Image(); im.src = info.url; im.alt = alt || ""; box.appendChild(im);
      box.classList.add("art--img");
      if (entry.cls) entry.cls.split(" ").forEach(function (c) { box.classList.add(c); });
    });
    return box;
  }

  /* ---------- toasts ---------- */
  /* Toasts are queued: at most 2 on screen, so a solve that earns several things doesn't bury the panel. */
  var toastQueue = [], toastLive = 0;
  function toast(title, kicker, opts) {
    toastQueue.push([title, kicker, opts || {}]);
    pumpToasts();
  }
  function pumpToasts() {
    while (toastLive < 2 && toastQueue.length) {
      var t = toastQueue.shift(); toastLive++;
      showToast(t[0], t[1], t[2], function () { toastLive--; pumpToasts(); });
    }
  }
  function showToast(title, kicker, opts, done) {
    var t = h('<div class="g-toast' + (opts.calm ? " g-toast--calm" : "") + '" role="status">' +
      (opts.icon ? '<div class="g-medal"><img src="' + ICON + opts.icon + '" alt=""></div>' : "") +
      '<div>' + (kicker ? '<div class="g-toast-kicker">' + esc(kicker) + '</div>' : "") +
      '<div class="g-toast-title">' + esc(title) + '</div></div></div>');
    $("toasts").appendChild(t);
    setTimeout(function () { t.classList.add("toast-out"); }, opts.calm ? 5000 : 3500);
    setTimeout(function () { t.remove(); done(); }, opts.calm ? 5600 : 4100);
  }

  /* ---------- dialog ---------- */
  function dialog(titleHtml, bodyEl, onClose) {
    var d = $("dialog");
    d.innerHTML = "";
    d.setAttribute("aria-labelledby", "dlg-title");
    var box = h('<div class="g-dialog"><h2 id="dlg-title">' + titleHtml + '</h2><div class="dlg-body"></div>' +
      '<div class="g-row dlg-actions"><button class="g-btn g-btn--secondary" data-close>' + C.ui.close + '</button></div></div>');
    box.querySelector(".dlg-body").appendChild(bodyEl);
    box.querySelector("[data-close]").onclick = function () { d.close(); };
    d.appendChild(box);
    d.onclose = function () { if (onClose) onClose(); };
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    return d;
  }

  function showHints() {
    var id = G.state.room;
    var room = E().roomById(id);
    var body = h('<div></div>');
    function draw() {
      var used = G.state.hints[id] || 0;
      body.innerHTML = '<p class="g-cost">' + C.ui.hintCost + '</p>';
      room.hints.forEach(function (txt, i) {
        var open = i < used;
        body.appendChild(h('<div class="g-hint"><span class="g-hint-num' + (open ? "" : " g-hint-num--locked") + '">' + (i + 1) + '</span>' +
          (open ? '<div class="g-parchment">' + esc(txt) + '</div>' : '<span class="g-cost">🔒</span>') + '</div>'));
      });
      if (used < 3) {
        var b = h('<button class="g-btn g-btn--primary">' + C.ui.openHint + ' ' + (used + 1) + ' (−10)</button>');
        b.onclick = function () { E().openHint(id); draw(); };
        body.appendChild(b);
      }
    }
    draw();
    dialog('<img src="' + ICON + 'ui-hint-lamp.svg" alt="">' + C.ui.hintsTitle, body);
  }

  function showHowTo() {
    var body = h('<div class="g-parchment"><ul class="howto"></ul></div>');
    C.howTo.forEach(function (l) { body.firstElementChild.appendChild(h("<li>" + esc(l) + "</li>")); });
    dialog(C.ui.howTo, body);
  }

  /* ---------- top bar and bag ---------- */
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  function renderTopbar() {
    var tb = $("topbar");
    var inGame = G.state.screen === "room" || G.state.screen === "earned" || G.state.screen === "intro";
    tb.hidden = !inGame;
    if (!inGame) return;
    var total = C.totalMinutes * 60000, left = total - G.state.elapsedMs;
    if (!tb.firstChild) {
      tb.innerHTML =
        '<div class="g-stat" id="tb-time"><img src="' + ICON + 'ui-hourglass.svg" alt=""><span class="g-stat-label">' + C.ui.time + '</span>' +
        '<div class="g-hourglass" aria-hidden="true"><span></span></div><span class="g-stat-value" id="tb-clock"></span></div>' +
        '<div class="g-stat"><span class="g-stat-label">' + C.ui.score + '</span><span class="g-stat-value" id="tb-score"></span></div>' +
        '<span class="g-stat-label" id="tb-room"></span><span class="g-stat-label tb-team" id="tb-team"></span><span class="g-spacer"></span>' +
        '<button class="g-btn g-btn--secondary" id="tb-hint"><img src="' + ICON + 'ui-hint-lamp.svg" alt="">' + C.ui.hint + ' <span id="tb-hint-n" class="g-ltr"></span></button>';
      $("tb-hint").onclick = showHints;
    }
    $("tb-clock").textContent = fmt(left);
    $("tb-time").classList.toggle("g-stat--late", left <= 0);
    tb.querySelector(".g-hourglass > span").style.width = Math.max(0, left / total * 100) + "%";
    $("tb-score").textContent = E().totalScore();
    var inRoom = G.state.screen === "room";
    $("tb-hint").hidden = !inRoom;
    $("tb-hint-n").textContent = inRoom ? "(" + (G.state.hints[G.state.room] || 0) + "/3)" : "";
    $("tb-room").textContent = inRoom ? G.state.room + "/5 · " + E().roomById(G.state.room).name : "";
    $("tb-team").textContent = teamName();
  }

  function renderBag() {
    var bag = $("bag");
    var show = G.state.screen === "room" || G.state.screen === "earned";
    bag.hidden = !show;
    if (!show) return;
    bag.innerHTML = '<div class="g-bag-title"><img src="' + ICON + 'ui-bag.svg" alt="">' + C.ui.bag + '</div>';
    for (var i = 0; i < 5; i++) {
      var symId = G.state.inventory[i];
      if (!symId) { bag.appendChild(h('<button class="g-slot" disabled aria-label="' + C.ui.empty + '"></button>')); continue; }
      var sym = C.symbols[symId], sel = G.state.selected === symId;
      var b = h('<button class="g-slot g-slot--filled' + (sel ? " g-slot--selected" : "") + '" aria-pressed="' + sel + '" title="' + esc(sym.name) + '" aria-label="' + esc(sym.name) + '"><img src="' + ICON + sym.icon + '" alt=""></button>');
      b.onclick = (function (id, s) { return function () {
        E().selectItem(id);
        if (G.state.selected === id) toast(s.fragment, s.name, { icon: s.icon, calm: true });
      }; })(symId, sym);
      bag.appendChild(b);
    }
  }

  /* ---------- screens ---------- */
  var screens = {};

  function teamName() { return (G.state.team && G.state.team.name) || C.team.defaultName; }

  /* Temple map (g-map): done rooms show their symbol, `current` is highlighted (M2). */
  function templeMap(current) {
    var m = h('<div class="g-map temple-map" role="list" aria-label="' + C.ui.mapTitle + '"></div>');
    C.rooms.forEach(function (r, i) {
      var done = !!G.state.solved[r.id], cur = r.id === current, s = C.symbols[r.symbol];
      if (i) m.appendChild(h('<span class="g-map-line' + (G.state.solved[r.id - 1] ? " g-map-line--done" : "") + '" aria-hidden="true"></span>'));
      m.appendChild(h('<div role="listitem" class="g-map-node' + (done ? " g-map-node--done" : "") + (cur ? " g-map-node--current" : "") + '">' +
        '<span class="g-map-dot">' + (done ? '<img src="' + ICON + s.icon + '" alt="">' : r.id) + '</span>' +
        '<span class="g-map-name">' + esc(r.name) + (done ? " ✓" : "") + '</span></div>'));
    });
    return m;
  }

  screens.team = function (st) {
    setScene("bg-title");
    var T = C.team, team = G.state.team || (G.state.team = { name: "", players: 2 });
    var el = h('<div class="screen screen--team g-stone g-col"><h1 class="h2 gold"></h1>' +
      '<label class="label" for="team-name"></label><input id="team-name" class="team-input" maxlength="30" autocomplete="off">' +
      '<span class="label" id="players-label"></span><div class="g-row players" role="group" aria-labelledby="players-label"></div>' +
      '<div><button class="g-btn g-btn--primary">' + C.ui.next + '</button></div></div>');
    el.querySelector("h1").textContent = T.title;
    el.querySelector("label").textContent = T.nameLabel;
    el.querySelector("#players-label").textContent = T.playersLabel;
    var inp = el.querySelector("input"); inp.placeholder = T.namePlaceholder; inp.value = team.name || "";
    inp.oninput = function () { team.name = inp.value.trim(); E().save(); };
    inp.onkeydown = function (e) { if (e.key === "Enter") next(); };
    var row = el.querySelector(".players");
    [1, 2, 3, 4].forEach(function (n) {
      var b = h('<button class="g-choice players-btn" aria-label="' + n + ' ' + C.ui.players + '" aria-pressed="' + (team.players === n) + '"><span class="g-choice-num">' + n + '</span></button>');
      b.onclick = function () { team.players = n; E().save(); row.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); };
      row.appendChild(b);
    });
    function next() { E().go("intro"); }
    el.querySelector(".g-btn--primary").onclick = next;
    st.appendChild(el);
    setTimeout(function () { inp.focus(); }, 0);
  };

  screens.title = function (st) {
    setScene("bg-title");
    var hasSave = !!E().load() && E().load().started;
    var el = h('<div class="screen screen--title">' +
      '<div class="g-meander"></div><h1 class="title gold">' + C.title + '</h1><p class="h2 subtitle">' + C.subtitle + '</p><div class="g-meander"></div>' +
      '<div class="g-col title-actions"></div></div>');
    var a = el.querySelector(".title-actions");
    if (hasSave) {
      var c = h('<button class="g-btn g-btn--primary">' + C.ui.cont + '</button>'); c.onclick = E().resume; a.appendChild(c);
      var n = h('<button class="g-btn g-btn--secondary">' + C.ui.newGame + '</button>');
      n.onclick = function () { if (confirm(C.ui.confirmNew)) E().newGame(); }; a.appendChild(n);
    } else {
      var s = h('<button class="g-btn g-btn--primary">' + C.ui.start + '</button>'); s.onclick = E().newGame; a.appendChild(s);
    }
    var ht = h('<button class="g-btn g-btn--quiet">' + C.ui.howTo + '</button>'); ht.onclick = showHowTo; a.appendChild(ht);
    st.appendChild(el);
  };

  screens.intro = function (st) {
    setScene("bg-intro-wall");
    var el = h('<div class="screen screen--intro"><div class="intro-grid"><div class="intro-art"></div><div class="g-col">' +
      '<blockquote class="g-parchment g-quote"></blockquote><div class="g-stone mission"><strong class="h3 gold"></strong><p class="body"></p></div>' +
      '<div><button class="g-btn g-btn--primary">' + C.ui.enterTemple + '</button></div></div></div></div>');
    el.querySelector(".intro-art").appendChild(art("char-medusa", "מדוזה", "sym-snake.svg", "art--portrait"));
    var q = el.querySelector("blockquote");
    q.innerHTML = "״" + C.intro.quote.map(esc).join("<br>") + "״<cite>— " + esc(C.intro.cite) + "</cite>";
    el.querySelector(".mission strong").textContent = "המשימה";
    el.querySelector(".mission p").textContent = C.intro.mission;
    el.querySelector("button").onclick = function () { E().go("room", 1); };
    st.appendChild(el);
  };

  screens.room = function (st) {
    var id = G.state.room, room = E().roomById(id);
    setScene(room.scene);
    var el = h('<section class="screen screen--room room room-' + id + '">' +
      '<header class="room-head"><h1 class="h2 gold">' + esc(room.name) + ' <span class="h3 muted">· ' + esc(room.subtitle || "") + '</span></h1>' +
      (room.intro ? '<p class="room-intro g-parchment">' + esc(room.intro) + '</p>' : "") + '</header>' +
      '<div class="room-body"></div><p class="g-feedback room-say" aria-live="polite"></p></section>');
    st.appendChild(el);
    E().mountRoom(id, el.querySelector(".room-body"), el.querySelector(".room-say"));
  };

  screens.earned = function (st) {
    var id = G.state.room, room = E().roomById(id), sym = C.symbols[room.symbol];
    setScene(room.scene);
    var el = h('<div class="screen screen--earned g-col">' +
      '<p class="h3 gold">' + C.ui.symbolEarned + '</p>' +
      '<div class="g-symbol big-symbol"><div class="g-medal"><img src="' + ICON + sym.icon + '" alt=""></div><div class="g-symbol-name">' + esc(sym.name) + '</div><div class="g-fragment">' + esc(sym.fragment) + '</div></div>' +
      '<p class="g-parchment earned-msg">' + esc(room.solvedMessage) + '</p>' +
      '<p class="label muted">' + C.ui.mapTitle + ' · ' + C.ui.score + ': <span class="g-ltr">+' + (G.state.roomScore[id] || 0) + '</span></p>' +
      '<div class="map-slot"></div><div><button class="g-btn g-btn--primary">' + C.ui.next + '</button></div></div>');
    el.querySelector(".map-slot").appendChild(templeMap(Math.min(5, id + 1)));
    el.querySelector("button").onclick = function () { E().go("room", Math.min(5, id + 1)); };
    st.appendChild(el);
  };

  screens.ending = function (st) {
    var n = C.endings[G.state.ending] ? G.state.ending : 3, e = C.endings[n];
    setScene([e.scene, "bg-room5-chamber"]); // until ending art exists, stay in Medusa's chamber
    var el = h('<div class="screen screen--ending g-col"><div class="g-meander"></div><h1 class="h1 gold"></h1>' +
      '<div class="ending-art"></div><p class="g-parchment body-lg"></p><p class="g-quote moral"></p><div class="g-meander"></div>' +
      '<div><button class="g-btn g-btn--primary">' + C.ui.toBonus + '</button></div></div>');
    el.querySelector("h1").textContent = e.title;
    /* Ending art, or Medusa's portrait with a per-ending treatment (D42) while the ending image is missing. */
    el.querySelector(".ending-art").appendChild(art([e.scene, { base: "char-medusa", cls: "art--standin ending-tone-" + n }],
      e.title, "sym-stone-eye.svg", "art--wide"));
    el.querySelector("p.g-parchment").textContent = e.text;
    el.querySelector(".moral").textContent = e.moral;
    el.querySelector("button").onclick = function () { E().go("bonus"); };
    st.appendChild(el);
  };

  screens.bonus = function (st) {
    setScene("bg-bonus");
    var B = C.bonus;
    var el = h('<div class="screen screen--bonus g-col"><blockquote class="g-parchment g-quote"></blockquote>' +
      '<label class="h3 gold" for="myth"></label><textarea id="myth" class="g-textarea" rows="6"></textarea>' +
      '<div class="g-col checks"></div><div><button class="g-btn g-btn--primary">' + C.ui.toResults + '</button></div></div>');
    el.querySelector("blockquote").innerHTML = "״" + B.medusaQuote.map(esc).join("<br>") + "״<cite>— מדוזה</cite>";
    el.querySelector("label").textContent = B.prompt;
    var ta = el.querySelector("textarea"); ta.value = G.state.myth || "";
    ta.oninput = function () { G.state.myth = ta.value; E().save(); };
    B.checklist.forEach(function (txt, i) {
      var lab = h('<label class="g-check"><input type="checkbox"> <span></span></label>');
      lab.querySelector("span").textContent = txt;
      var cb = lab.querySelector("input"); cb.checked = !!G.state.checks[i];
      cb.onchange = function () { G.state.checks[i] = cb.checked; E().save(); };
      el.querySelector(".checks").appendChild(lab);
    });
    el.querySelector("button").onclick = function () { E().go("results"); };
    st.appendChild(el);
  };

  screens.results = function (st) {
    setScene("bg-title");
    var score = E().totalScore(), rank = E().rankFor(score), ending = C.endings[G.state.ending];
    var el = h('<div class="screen screen--results g-col"><div class="g-meander"></div><h1 class="h1 gold">' + C.ui.resultsTitle + ' · <span class="results-team"></span></h1>' +
      '<div class="g-stone results-card g-col">' +
      '<div class="g-stat"><span class="g-stat-label">' + C.ui.score + '</span><span class="g-stat-value big">' + score + '</span></div>' +
      '<div><span class="g-stat-label">' + C.ui.rank + '</span><p class="h2 gold rank">' + esc(rank.name) + ' <span class="h3 muted">(' + esc(rank.tier) + ')</span></p></div>' +
      '<div class="g-stat"><span class="g-stat-label">' + C.ui.totalTime + '</span><span class="g-stat-value">' + fmt(G.state.elapsedMs) + '</span></div>' +
      (ending ? '<div><span class="g-stat-label">' + C.ui.yourEnding + '</span><p class="h3 gold">' + esc(ending.title) + '</p></div>' : "") +
      '<div class="g-row symbols-row"></div>' +
      '<div><span class="g-stat-label">' + C.ui.achievementsTitle + '</span><ul class="ach-list"></ul></div>' +
      '<div class="g-stat"><span class="g-stat-label">' + C.ui.cluesTitle + '</span><span class="g-stat-value">' + Object.keys(G.state.clues || {}).length + '/5</span></div></div>' +
      (G.state.myth ? '<div class="g-parchment myth"><h3>' + C.ui.yourMyth + '</h3><p class="myth-text"></p></div>' : "") +
      '<div class="g-row"><button class="g-btn g-btn--primary" data-act="other">' + C.ui.otherEnding + '</button>' +
      '<button class="g-btn g-btn--secondary" data-act="download">' + C.ui.download + '</button>' +
      '<button class="g-btn g-btn--secondary" data-act="again">' + C.ui.playAgain + '</button></div>' +
      '<p class="caption muted">' + C.ui.otherEndingNote + '</p></div>');
    var row = el.querySelector(".symbols-row");
    C.rooms.forEach(function (r) {
      var s = C.symbols[r.symbol];
      row.appendChild(h('<div class="g-symbol"><div class="g-medal"><img src="' + ICON + s.icon + '" alt=""></div><div class="g-symbol-name">' + esc(s.name) + '</div></div>'));
    });
    if (G.state.myth) el.querySelector(".myth-text").textContent = G.state.myth;
    el.querySelector(".results-team").textContent = teamName();
    var ul = el.querySelector(".ach-list");
    Object.keys(C.achievements).forEach(function (k) {
      var a = C.achievements[k], got = !!(G.state.achievements || {})[k];
      var li = h('<li class="ach' + (got ? " ach--got" : "") + '"><span class="ach-mark" aria-hidden="true">' + (got ? "★" : "☆") + '</span><span><strong></strong> · <span class="ach-desc"></span></span></li>');
      li.querySelector("strong").textContent = a.name + (got ? "" : " (עוד לא)");
      li.querySelector(".ach-desc").textContent = a.desc;
      ul.appendChild(li);
    });
    el.querySelector('[data-act="download"]').onclick = function () { downloadSummary(score, rank, ending); };
    el.querySelector('[data-act="again"]').onclick = function () { if (confirm(C.ui.confirmNew)) E().newGame(); };
    /* Back to Room 5's final choice. Score doesn't change (room 5 is re-scored identically); the myth is kept. */
    el.querySelector('[data-act="other"]').onclick = function () { E().go("room", 5); };
    st.appendChild(el);
  };

  /* Results as a plain .txt file (works from file://, nothing leaves the computer). */
  function downloadSummary(score, rank, ending) {
    var L = [];
    L.push(C.title + ": " + C.subtitle);
    L.push(C.ui.team + ": " + teamName() + " (" + ((G.state.team && G.state.team.players) || "?") + " " + C.ui.players + ")");
    L.push(new Date().toLocaleDateString("he-IL"));
    L.push("");
    L.push(C.ui.score + ": " + score);
    L.push(C.ui.rank + ": " + rank.name + " (" + rank.tier + ")");
    L.push(C.ui.totalTime + ": " + fmt(G.state.elapsedMs));
    if (ending) L.push(C.ui.yourEnding + ": " + ending.title);
    L.push(C.ui.cluesTitle + ": " + Object.keys(G.state.clues || {}).length + "/5");
    var got = Object.keys(C.achievements).filter(function (k) { return (G.state.achievements || {})[k]; }).map(function (k) { return C.achievements[k].name; });
    L.push(C.ui.achievementsTitle + ": " + (got.length ? got.join(", ") : "—"));
    L.push("");
    L.push(C.ui.yourMyth + ":");
    L.push(G.state.myth || "—");
    var blob = new Blob(["﻿" + L.join("\r\n")], { type: "text/plain;charset=utf-8" }); // BOM so Notepad shows Hebrew
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "medusa-" + (teamName().replace(/[\\/:*?"<>|]/g, "") || "results") + ".txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function render() {
    E().unmountRoom();
    var dlg = $("dialog");
    if (dlg.open) { dlg.onclose = null; dlg.close(); }
    var st = $("stage");
    st.innerHTML = "";
    document.body.dataset.screen = G.state.screen;
    (screens[G.state.screen] || screens.title)(st);
    renderTopbar(); renderBag();
    if (G.dev) renderDev();
    st.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ---------- dev panel (?dev=1) ---------- */
  var IMAGES = [
    ["char-medusa", 640, 960], ["bg-title", 1280, 720], ["bg-room1-gate", 1280, 720], ["bg-room2-mirrors", 1280, 720],
    ["bg-room3-archive", 1280, 720], ["bg-room4-lab", 1280, 720], ["bg-room5-chamber", 1280, 720],
    ["ending-1-force", 1280, 720], ["ending-2-freedom", 1280, 720], ["ending-3-guardian", 1280, 720]
  ];
  function renderDev() {
    var d = $("dev");
    if (d.dataset.built) { d.querySelector(".dev-ans").textContent = G.state.screen === "room" ? "תשובה: " + E().roomById(G.state.room).devAnswer : ""; return; }
    d.dataset.built = "1"; d.hidden = false;
    d.innerHTML = '<details class="g-stone"><summary class="label">DEV</summary><div class="g-row dev-jump"></div><p class="dev-ans label"></p><ul class="dev-img label"></ul></details>';
    var j = d.querySelector(".dev-jump");
    function btn(label, fn) { var b = h('<button class="g-btn g-btn--quiet">' + label + '</button>'); b.onclick = fn; j.appendChild(b); }
    [1, 2, 3, 4, 5].forEach(function (n) {
      btn("חדר " + n, function () {
        G.state.started = true;
        C.rooms.slice(0, n - 1).forEach(function (r) { E().addItem(r.symbol); });
        E().go("room", n);
      });
    });
    btn("קבוצה", function () { E().go("team"); });
    btn("סוף", function () { G.state.ending = G.state.ending || 3; E().go("ending"); });
    btn("בונוס", function () { E().go("bonus"); });
    btn("תוצאות", function () { E().go("results"); });
    btn("איפוס", function () { E().clear(); location.reload(); });
    var ul = d.querySelector(".dev-img");
    IMAGES.forEach(function (spec) {
      var li = h("<li>… " + spec[0] + "</li>"); ul.appendChild(li);
      findImage(spec[0], function (info) {
        if (!info) { li.textContent = "✕ חסר: " + spec[0]; li.className = "dev-miss"; return; }
        var small = info.w < spec[1] || info.h < spec[2];
        li.textContent = (small ? "⚠ קטן מדי " : "✓ ") + info.url.replace("assets/img/", "") + " " + info.w + "×" + info.h + (small ? " (מינימום " + spec[1] + "×" + spec[2] + ")" : "");
        li.className = small ? "dev-warn" : "dev-ok";
      });
    });
    renderDev();
  }

  G.ui = { render: render, renderTopbar: renderTopbar, renderBag: renderBag, toast: toast, dialog: dialog, art: art, findImage: findImage, setScene: setScene, esc: esc, h: h };
})();
