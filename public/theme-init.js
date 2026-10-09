// Runs before first paint so the saved theme never flashes the wrong colours.
(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem('calibridge:prefs') || '{}');
    if (prefs.theme === 'light' || prefs.theme === 'dark') document.documentElement.dataset.theme = prefs.theme;
  } catch (e) {}
})();
