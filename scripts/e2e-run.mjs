#!/usr/bin/env node
/**
 * Single owner of the E2E process tree.
 *
 *   npm run test:e2e
 *    └─ node scripts/e2e-run.mjs          ← THE ONLY OWNER
 *         1. disposable file:./e2e.db + migrate
 *         2. next build → .next-e2e (reused if present)
 *         3. spawn next start :4127       ← child of e2e-run
 *         4. spawn playwright test
 *            PLAYWRIGHT_SKIP_WEBSERVER=1  ← Playwright does not start e2e-run
 *         5. reap Next, bind-check 4127, exit with Playwright status
 *
 * Playwright is a sibling of Next, both children of this script.
 * There is no script → Playwright → script cycle.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePackageBin } from "./prisma-migrate.mjs";
import { E2E_DATABASE_URL, prepareE2eDatabase } from "./e2e-prepare.mjs";

const PORT = Number(process.env.E2E_PORT || 4127);
const HOST = "127.0.0.1";
const DIST_DIR = process.env.UJRIS_NEXT_DIST_DIR || ".next-e2e";

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
    /* already gone */
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  unixKillTree(pid, "SIGTERM");
}

function forceKillProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  unixKillTree(pid, "SIGKILL");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function ensurePortReleased() {
  try {
    await listenOnce();
    return;
  } catch {
    await sleep(400);
    await listenOnce();
  }
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let lastError = "not started";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }
  throw new Error(`E2E server did not become ready at ${url}: ${lastError}`);
}

function runNodeCli(binPath, args, env, extra = {}) {
  return spawn(process.execPath, [binPath, ...args], {
    stdio: "inherit",
    env,
    windowsHide: true,
    ...extra,
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function reap(child, timeoutMs = 8000) {
  if (!child.pid || child.exitCode !== null) return;
  killProcessTree(child.pid);
  const timer = setTimeout(() => forceKillProcessTree(child.pid), timeoutMs);
  await waitForExit(child);
  clearTimeout(timer);
}

function restoreNextEnv() {
  spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "ensure-next-env.mjs")], {
    stdio: "inherit",
  });
}

async function main() {
  const env = {
    ...process.env,
    DATABASE_URL: E2E_DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
    UJRIS_NEXT_DIST_DIR: DIST_DIR,
    E2E_PORT: String(PORT),
    PLAYWRIGHT_SKIP_WEBSERVER: "1",
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`,
    NODE_ENV: process.env.NODE_ENV || "production",
  };

  prepareE2eDatabase();

  const nextBin = resolvePackageBin("next", "next");
  const playwrightBin = resolvePackageBin("@playwright/test", "playwright");

  const distExists = existsSync(path.join(process.cwd(), DIST_DIR, "BUILD_ID"));
  if (!distExists || process.env.E2E_FORCE_BUILD === "1") {
    const build = runNodeCli(nextBin, ["build"], env);
    const buildCode = await waitForExit(build);
    restoreNextEnv();
    if (buildCode !== 0) {
      process.exit(buildCode ?? 1);
    }
  }

  const next = runNodeCli(nextBin, ["start", "--hostname", HOST, "-p", String(PORT)], env);
  let playwright = null;
  let shuttingDown = false;
  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (playwright) await reap(playwright, 3000);
    await reap(next);
    try {
      await ensurePortReleased();
    } catch (error) {
      console.error(`E2E port ${PORT} still in use after shutdown`, error);
      restoreNextEnv();
      process.exit(1);
    }
    restoreNextEnv();
    process.exit(code);
  };

  process.on("SIGTERM", () => {
    void shutdown(1);
  });
  process.on("SIGINT", () => {
    void shutdown(1);
  });

  try {
    await waitForHttp(`http://${HOST}:${PORT}`, 120_000);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await shutdown(1);
    return;
  }

  const playwrightChild = runNodeCli(playwrightBin, ["test"], env);
  playwright = playwrightChild;
  const status = await waitForExit(playwrightChild);
  await shutdown(status ?? 1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
