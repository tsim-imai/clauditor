import { app as n, BrowserWindow as g, ipcMain as h } from "electron";
import * as l from "path";
import * as D from "os";
import * as a from "fs/promises";
import { fileURLToPath as v } from "url";
const y = process.env.NODE_ENV === "development", u = l.dirname(v(import.meta.url));
let e = null;
const j = () => {
  e = new g({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0,
      preload: l.join(u, "preload.js")
    },
    titleBarStyle: "hiddenInset",
    // macOS native title bar
    show: !1
    // Don't show until ready
  }), y ? (e.loadURL("http://localhost:5173"), e.webContents.openDevTools()) : e.loadFile(l.join(u, "../dist/index.html")), e.once("ready-to-show", () => {
    e == null || e.show();
  }), e.on("closed", () => {
    e = null;
  });
};
n.whenReady().then(() => {
  j(), n.on("activate", () => {
    g.getAllWindows().length === 0 && j();
  });
});
n.on("window-all-closed", () => {
  process.platform !== "darwin" && n.quit();
});
h.handle("scan-claude-projects", async () => {
  try {
    const o = l.join(D.homedir(), ".claude", "projects");
    try {
      await a.access(o);
    } catch {
      return console.log("Claude projects directory not found:", o), [];
    }
    const p = await a.readdir(o, { withFileTypes: !0 }), c = [];
    for (const t of p)
      if (t.isDirectory()) {
        const s = l.join(o, t.name), f = await a.stat(s), d = (await a.readdir(s)).filter((w) => w.endsWith(".jsonl"));
        c.push({
          name: t.name,
          path: s,
          logFiles: d,
          lastModified: f.mtime
        });
      }
    return c.sort((t, s) => s.lastModified.getTime() - t.lastModified.getTime());
  } catch (o) {
    throw console.error("Failed to scan Claude projects:", o), new Error(`Failed to scan projects: ${o}`);
  }
});
h.handle("read-project-logs", async (o, p) => {
  var c;
  try {
    const s = (await a.readdir(p)).filter((r) => r.endsWith(".jsonl")), f = [];
    for (const r of s) {
      const d = l.join(p, r), F = (await a.readFile(d, "utf-8")).split(`
`).filter((m) => m.trim());
      for (const m of F)
        try {
          const i = JSON.parse(m);
          i.timestamp && ((c = i.message) != null && c.usage) && i.costUSD !== void 0 && f.push(i);
        } catch (i) {
          console.warn(`Failed to parse line in ${r}:`, m, i);
        }
    }
    return f.sort((r, d) => new Date(r.timestamp).getTime() - new Date(d.timestamp).getTime());
  } catch (t) {
    throw console.error("Failed to read project logs:", t), new Error(`Failed to read logs: ${t}`);
  }
});
h.handle("get-app-version", async () => n.getVersion());
y ? n.setAsDefaultProtocolClient("clauditor-dev") : n.setAsDefaultProtocolClient("clauditor");
