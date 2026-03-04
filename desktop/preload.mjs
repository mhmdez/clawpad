import { contextBridge, shell } from "electron";

contextBridge.exposeInMainWorld("clawpadDesktop", {
  openExternal: (url) => {
    if (typeof url !== "string" || !url.trim()) return;
    shell.openExternal(url);
  },
});
