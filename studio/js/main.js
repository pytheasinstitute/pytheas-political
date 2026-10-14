'use strict';
/* Pytheas Studio — Start */

(function init() {
  loadToolOptions();
  const colors = storageGet('pytheas-studio:colors', null);
  if (colors && isHexColor(colors.fg) && isHexColor(colors.bg)) {
    app.fg = colors.fg;
    app.bg = colors.bg;
  }
  buildToolbar();
  buildColorPanel();
  buildLayersPanel();
  buildMenus();
  updateColorUI();
  resizeOverlay();
  newDocument(1200, 800, '#ffffff');
  const saved = storageGet('pytheas-studio:tool', 'brush');
  app.tool = Tools[saved] ? saved : 'brush';
  setTool(app.tool);
  Autosave.check();
  // Für Fortgeschrittene und automatisierte Tests
  window.studio = { app, Tools, Filters, Transform, commit, undo, redo, flattenCanvas, setTool };
})();
