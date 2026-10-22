// Pixelwerk als Mac-Programm: ein eigenes Fenster für Pixelwerk auf claude.ai.
// Dort läuft „Claude fragen“ über das eigene Claude-Konto; die Anmeldung bleibt gespeichert,
// ebenso „Meine Bilder“ (im Programm-Speicher dieses Macs).
'use strict';

const { app, BrowserWindow, Menu, shell } = require('electron');

const START = 'https://claude.ai/artifact/TLJ2rHSWiASccdQzj99Txb';
const LOGIN = 'https://claude.ai/login';
// Nach der Anmeldung landet claude.ai auf einer dieser Seiten; dann geht es zurück zu Pixelwerk.
const AFTER_LOGIN = /^https:\/\/claude\.ai\/(new|recents|chats?|projects|onboarding)?(\/|\?|$)/i;
// Seiten, die im Programm bleiben (claude.ai und die Anmeldung); alles andere öffnet der Browser.
const INSIDE = [
  /^https:\/\/([a-z0-9-]+\.)*claude\.ai(\/|$)/i,
  /^https:\/\/([a-z0-9-]+\.)*anthropic\.com(\/|$)/i,
  /^https:\/\/([a-z0-9-]+\.)*claudeusercontent\.com(\/|$)/i,
  /^https:\/\/accounts\.google\.com(\/|$)/i,
  /^https:\/\/appleid\.apple\.com(\/|$)/i,
];
const inside = url => INSIDE.some(r => r.test(url));

app.setName('Pixelwerk');
// Ohne "Electron" in der Kennung behandeln claude.ai und die Google-Anmeldung das Programm wie einen normalen Browser.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|pixelwerk|Pixelwerk)\/\S+/g, '');

let win = null;
let loggingIn = false;

const OFFLINE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="de"><meta charset="utf-8"><title>Pixelwerk</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#1c1c1f;color:#dddde3;font:15px/1.5 -apple-system,system-ui,sans-serif}
div{max-width:420px;padding:24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#a5a5ae;margin:0 0 18px}
button{font:inherit;padding:8px 18px;border:0;border-radius:6px;background:#3b8cf0;color:#fff;cursor:pointer}</style>
<div><h1>Keine Verbindung zu claude.ai</h1><p>Pixelwerk braucht Internet, weil es über claude.ai läuft. Prüfe die Verbindung und versuch es dann noch einmal.</p>
<button onclick="location.href='${START}'">Noch einmal versuchen</button></div></html>`)}`;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Pixelwerk',
    backgroundColor: '#1c1c1f',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (inside(url)) return { action: 'allow' }; // z. B. das Anmeldefenster von Google
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (inside(url) || url.startsWith('data:')) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  // Abgemeldet zeigt claude.ai bei Pixelwerk nur „Couldn't load artifact“, deshalb geht es dann zur Anmeldung.
  wc.on('did-finish-load', async () => {
    const url = wc.getURL();
    if (loggingIn || !url.startsWith(START)) return;
    const status = await wc.executeJavaScript("fetch('/api/account', { credentials: 'include' }).then(r => r.status).catch(() => 0)").catch(() => 0);
    if (status === 401 || status === 403) {
      loggingIn = true;
      win.loadURL(LOGIN).catch(() => {});
    }
  });
  // claude.ai wechselt nach der Anmeldung oft ohne Neuladen die Seite (in-page), daher beide Ereignisse.
  const afterLogin = url => {
    if (!loggingIn || !AFTER_LOGIN.test(url)) return;
    loggingIn = false;
    win.loadURL(START).catch(() => {});
  };
  wc.on('did-navigate', (_e, url) => afterLogin(url));
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => { if (isMainFrame) afterLogin(url); });
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    // -3 = abgebrochen (z. B. durch eine Weiterleitung); nur echte Fehler der Hauptseite zählen.
    if (isMainFrame && code !== -3 && !String(url).startsWith('data:')) win.loadURL(OFFLINE).catch(() => {});
  });
  // Fehler beim Laden zeigt did-fail-load als eigene Seite an.
  win.loadURL(START).catch(() => {});
}

function goHome() {
  if (!win) return createWindow();
  win.loadURL(START).catch(() => {});
  win.show();
}

function buildMenu() {
  const template = [
    {
      label: 'Pixelwerk',
      submenu: [
        { role: 'about', label: 'Über Pixelwerk' },
        { type: 'separator' },
        { role: 'hide', label: 'Pixelwerk ausblenden' },
        { role: 'hideOthers', label: 'Andere ausblenden' },
        { role: 'unhide', label: 'Alle einblenden' },
        { type: 'separator' },
        { role: 'quit', label: 'Pixelwerk beenden' },
      ],
    },
    {
      // Kürzel, die Pixelwerk selbst nutzt (⌘Z, ⌘C …), erreichen zuerst die Seite; diese Einträge
      // greifen nur dort, wo Pixelwerk sie nicht verwendet, etwa in Textfeldern.
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'selectAll', label: 'Alles auswählen' },
      ],
    },
    {
      label: 'Darstellung',
      submenu: [
        { label: 'Pixelwerk neu laden', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
        { label: 'Zur Startseite', click: goHome },
        { label: 'Bei claude.ai anmelden …', click: () => { loggingIn = true; if (win) win.loadURL(LOGIN).catch(() => {}); else createWindow(); } },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' },
      ],
    },
    {
      label: 'Fenster',
      submenu: [
        { label: 'Im Dock ablegen', click: () => win && win.minimize() },
        { role: 'zoom', label: 'Zoomen' },
        { type: 'separator' },
        { role: 'front', label: 'Alle nach vorne bringen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    app.setAboutPanelOptions({ applicationName: 'Pixelwerk', applicationVersion: '1.0', credits: 'Bildbearbeitung mit Claude' });
    buildMenu();
    createWindow();
  });
  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
  // Auf dem Mac bleibt das Programm im Dock, wenn das Fenster zu ist (wie andere Mac-Programme).
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
