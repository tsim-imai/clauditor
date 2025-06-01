import { contextBridge as r, ipcRenderer as e } from "electron";
r.exposeInMainWorld("electronAPI", {
  // Project scanning
  scanClaudeProjects: () => e.invoke("scan-claude-projects"),
  // Project log reading  
  readProjectLogs: (o) => e.invoke("read-project-logs", o),
  // App info
  getAppVersion: () => e.invoke("get-app-version"),
  // Platform info
  getPlatform: () => process.platform
});
