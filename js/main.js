/* Boot: restore a saved game screen if one exists, otherwise the title. */
(function () {
  var saved = G.engine.load();
  if (saved && saved.started) G.state = saved;
  G.state.screen = G.state.screen || "title";
  /* Always land on the title first so the team can choose Continue or New game, unless dev jumps elsewhere. */
  if (!G.dev || !saved) G.state.screen = "title";
  if (saved && saved.started) { G.state.started = true; }
  G.ui.render();
})();
