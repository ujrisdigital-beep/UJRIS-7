/**
 * Verify the E2E port can be rebound. If a leftover supervisor/Next pid is
 * recorded, terminate that process tree first.
 */
import { createServer } from "node:net";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.E2E_PORT || 4127);
const HOST = "127.0.0.1";
const PID_FILE = path.join(process.cwd(), ".e2e-webserver.pid");

function childPids(pid) {
  if (!pid || process.platform === "win32") return [];
  try {
    const out = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
    if (out.status !== 0 || !out.stdout) return [];
    return out.stdout
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 1);
  } catch {
    return [];
  }
}

function unixKillTree(pid, signal) {
  if (!pid) return;
  for (const child of childPids(pid)) {
    unixKillTree(child, signal);
  }
  try {
    process.kill(pid, signal);
  } catch {
    /* gone */
  }
}

function killPid(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  unixKillTree(pid, "SIGTERM");
  unixKillTree(pid, "SIGKILL");
}

function listenOnce() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function ensureE2ePortReleased() {
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, "utf8").trim());
    if (Number.isFinite(pid)) killPid(pid);
    try {
      unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  try {
    await listenOnce();
    return true;
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    await listenOnce();
    return true;
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  ensureE2ePortReleased()
    .then(() => {
      console.log(`E2E port ${PORT} is free`);
    })
    .catch((error) => {
      console.error(`E2E port ${PORT} still in use`, error);
      process.exit(1);
    });
}
