#!/usr/bin/env node
/**
 * Single owner of the E2E process tree.
 *
 * Stages: PREPARE_DB → BUILD → START_SERVER → WAIT_READY → RUN_PLAYWRIGHT
 *         → TEARDOWN → VERIFY_PORT
 *
 * All subprocesses use process.execPath + a resolved JS entry. No shell.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePackageBin } from "./command-runner.mjs";
import { prepareE2eDatabase } from "./e2e-prepare.mjs";

const PORT = Number(process.env.E2E_PORT || 4127);
const HOST = "127.0.0.1";
const DIST_DIR = process.env.UJRIS_NEXT_DIST_DIR || ".next-e2e";

const STAGES = {
  PREPARE_DB: "PREPARE_DB",
  BUILD: "BUILD",
  START_SERVER: "START_SERVER",
  WAIT_READY: "WAIT_READY",
  RUN_PLAYWRIGHT: "RUN_PLAYWRIGHT",
  TEARDOWN: "TEARDOWN",
  VERIFY_PORT: "VERIFY_PORT",
};

function redact(text) {
  return String(text ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://***")
    .replace(/DATABASE_URL=[^\s]+/gi, "DATABASE_URL=***")
    .replace(/AUTH_SECRET=[^\s]+/gi, "AUTH_SECRET=***")
    .replace(/sk_live_[^\s]+/gi, "sk_live_***")
    .replace(/sk_test_[^\s]+/gi, "sk_test_***")
    .slice(0, 4000);
}

function logStage(stage, extra = "") {
  console.log(`[E2E] STAGE=${stage}${extra ? ` ${extra}` : ""}`);
}

function failStage(stage, code, stderr) {
  console.error(`[E2E] STAGE=${stage} FAILED exit=${code ?? "null"}`);
  const summary = redact(stderr);
  if (summary.trim()) {
    console.error(`[E2E] stderr: ${summary}`);
  }
}

function childPids(pid) {
  if (!pid || process.platform === "win32") return [];
  try {
    const out = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8", windowsHide: true });
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
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, shell: false });
    return;
  }
  unixKillTree(pid, "SIGTERM");
}

function forceKillProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, shell: false });
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

function spawnNodeCli(binPath, args, env, extra = {}) {
  const { stdio, ...rest } = extra;
  return spawn(process.execPath, [binPath, ...args], {
    windowsHide: true,
    ...rest,
    stdio: stdio ?? "inherit",
    env,
    shell: false,
  });
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const onError = (error) => {
      child.removeListener("close", onClose);
      reject(error);
    };
    const onClose = (code, signal) => {
      child.removeListener("error", onError);
      resolve({ code, signal });
    };
    child.once("error", onError);
    child.once("close", onClose);
  });
}

async function reap(child, timeoutMs = 8000) {
  if (!child || !child.pid || child.exitCode !== null) return;
  killProcessTree(child.pid);
  const timer = setTimeout(() => forceKillProcessTree(child.pid), timeoutMs);
  try {
    await waitForChild(child);
  } catch {
    forceKillProcessTree(child.pid);
  } finally {
    clearTimeout(timer);
  }
}

function restoreNextEnv() {
  spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "ensure-next-env.mjs")], {
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
}

async function main() {
  let databaseUrl;
  logStage(STAGES.PREPARE_DB);
  try {
    databaseUrl = prepareE2eDatabase();
  } catch (error) {
    failStage(STAGES.PREPARE_DB, 1, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
    UJRIS_NEXT_DIST_DIR: DIST_DIR,
    E2E_PORT: String(PORT),
    PLAYWRIGHT_SKIP_WEBSERVER: "1",
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`,
    NODE_ENV: process.env.NODE_ENV || "production",
  };

  const nextBin = resolvePackageBin("next", "next");
  const playwrightBin = resolvePackageBin("@playwright/test", "playwright");

  let next = null;
  let playwright = null;
  let shuttingDown = false;
  let exitCode = 1;

  const shutdown = async (code, stage = STAGES.TEARDOWN) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logStage(STAGES.TEARDOWN);
    try {
      if (playwright) await reap(playwright, 3000);
      if (next) await reap(next);
    } catch (error) {
      failStage(STAGES.TEARDOWN, 1, error instanceof Error ? error.message : String(error));
    }
    logStage(STAGES.VERIFY_PORT);
    try {
      await ensurePortReleased();
    } catch (error) {
      failStage(STAGES.VERIFY_PORT, 1, error instanceof Error ? error.message : String(error));
      restoreNextEnv();
      process.exit(1);
    }
    restoreNextEnv();
    if (stage !== STAGES.TEARDOWN && code !== 0) {
      /* already logged */
    }
    process.exit(code);
  };

  process.on("SIGTERM", () => {
    void shutdown(1);
  });
  process.on("SIGINT", () => {
    void shutdown(1);
  });

  try {
    const distExists = existsSync(path.join(process.cwd(), DIST_DIR, "BUILD_ID"));
    if (!distExists || process.env.E2E_FORCE_BUILD === "1") {
      logStage(STAGES.BUILD);
      const build = spawnNodeCli(nextBin, ["build"], env);
      let buildResult;
      try {
        buildResult = await waitForChild(build);
      } catch (error) {
        failStage(STAGES.BUILD, 1, error instanceof Error ? error.message : String(error));
        restoreNextEnv();
        process.exit(1);
      }
      restoreNextEnv();
      if (buildResult.code !== 0) {
        failStage(STAGES.BUILD, buildResult.code, buildResult.signal ? `signal ${buildResult.signal}` : "");
        process.exit(buildResult.code ?? 1);
      }
    }

    logStage(STAGES.START_SERVER);
    next = spawnNodeCli(nextBin, ["start", "--hostname", HOST, "-p", String(PORT)], env);
    next.once("error", (error) => {
      failStage(STAGES.START_SERVER, 1, error.message);
    });

    logStage(STAGES.WAIT_READY);
    try {
      await waitForHttp(`http://${HOST}:${PORT}`, 120_000);
    } catch (error) {
      failStage(STAGES.WAIT_READY, 1, error instanceof Error ? error.message : String(error));
      await shutdown(1, STAGES.WAIT_READY);
      return;
    }

    logStage(STAGES.RUN_PLAYWRIGHT);
    playwright = spawnNodeCli(playwrightBin, ["test"], env);
    let playwrightResult;
    try {
      playwrightResult = await waitForChild(playwright);
    } catch (error) {
      failStage(STAGES.RUN_PLAYWRIGHT, 1, error instanceof Error ? error.message : String(error));
      await shutdown(1, STAGES.RUN_PLAYWRIGHT);
      return;
    }
    if (playwrightResult.code !== 0) {
      failStage(
        STAGES.RUN_PLAYWRIGHT,
        playwrightResult.code,
        playwrightResult.signal ? `signal ${playwrightResult.signal}` : ""
      );
    }
    exitCode = playwrightResult.code ?? 1;
    await shutdown(exitCode);
  } catch (error) {
    failStage("UNCAUGHT", 1, error instanceof Error ? error.message : String(error));
    await shutdown(1);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    failStage("UNCAUGHT", 1, error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
