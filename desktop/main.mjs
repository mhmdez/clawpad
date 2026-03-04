import { app, BrowserWindow, dialog, shell, utilityProcess } from "electron";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";

const DEV_URL = process.env.CLAWPAD_ELECTRON_URL || "http://localhost:3000";
const DEFAULT_PORT = 3333;
const MAX_PORT_ATTEMPTS = 80;
const SERVER_READY_TIMEOUT_MS = 45_000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;
let quitting = false;

function isDev() {
  return !app.isPackaged;
}

function canConnect(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function findAvailablePort(startPort = DEFAULT_PORT, attempts = MAX_PORT_ATTEMPTS) {
  for (let i = 0; i < attempts; i += 1) {
    const port = startPort + i;
    const inUse = await canConnect("127.0.0.1", port);
    if (!inUse) return port;
  }
  throw new Error(`No free port found from ${startPort} to ${startPort + attempts - 1}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeHttp(url, timeoutMs = 1_200) {
  return new Promise((resolve) => {
    const request = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ? res.statusCode < 500 : false);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await probeHttp(url);
    if (ok) return;
    await wait(250);
  }
  throw new Error(`Timed out waiting for bundled server at ${url}`);
}

function copyDirIfMissing(src, dest) {
  if (fs.existsSync(dest)) return;
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function prepareStandaloneAssets(appRoot, standaloneDir) {
  const staticSrc = path.join(appRoot, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  const publicSrc = path.join(appRoot, "public");
  const publicDest = path.join(standaloneDir, "public");

  copyDirIfMissing(staticSrc, staticDest);
  copyDirIfMissing(publicSrc, publicDest);
}

function stopBundledServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  proc.kill();
}

async function startBundledServer() {
  const appRoot = app.getAppPath();
  const standaloneDir = path.join(appRoot, ".next", "standalone");
  const serverEntry = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `Missing bundled server entry at ${serverEntry}. Run "npm run desktop:build:prep" first.`,
    );
  }

  prepareStandaloneAssets(appRoot, standaloneDir);

  const port = await findAvailablePort(DEFAULT_PORT);
  const serverUrl = `http://127.0.0.1:${port}`;

  // Use utilityProcess so the server runs headlessly without creating a second Dock app.
  serverProcess = utilityProcess.fork(serverEntry, [], {
    cwd: standaloneDir,
    stdio: "pipe",
    serviceName: "ClawPad Server",
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
  });

  serverProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[desktop-server] ${chunk}`);
  });

  serverProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[desktop-server] ${chunk}`);
  });

  const exitedEarly = new Promise((_, reject) => {
    serverProcess.once("exit", (code) => {
      reject(new Error(`Bundled server exited early (code=${code})`));
    });
  });

  await Promise.race([
    waitForServer(`${serverUrl}/api/version`),
    exitedEarly,
  ]);

  return serverUrl;
}

async function resolveStartUrl() {
  if (isDev()) {
    return DEV_URL;
  }
  return startBundledServer();
}

async function createMainWindow() {
  const startUrl = await resolveStartUrl();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(startUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      await createMainWindow();
    } catch (error) {
      dialog.showErrorBox(
        "ClawPad failed to start",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
      return;
    }

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          await createMainWindow();
        } catch (error) {
          dialog.showErrorBox(
            "ClawPad failed to re-open",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    });
  });

  app.on("before-quit", () => {
    quitting = true;
    stopBundledServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    } else if (quitting) {
      stopBundledServer();
    }
  });
}
