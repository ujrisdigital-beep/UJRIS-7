#!/usr/bin/env node
/**
 * Portable E2E web server supervisor.
 * Builds into `.next-e2e` and runs `next start` so a developer `next dev`
 * lock cannot block the suite, and so the tracked process is the HTTP
 * server (not a Turbopack parent that may exit on config rewrite).
 */
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PORT = String(process.env.E2E_PORT || "4127");
const PID_FILE = path.join(process.cwd(), ".e2e-webserver.pid");

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || "file:./test.db",
  AUTH_SECRET: process.env.AUTH_SECRET || "test-auth-secret-that-is-long-enough-32ch",
  UJRIS_NEXT_DIST_DIR: process.env.UJRIS_NEXT_DIST_DIR || ".next-e2e",
  NODE_ENV: process.env.NODE_ENV || "production",
};

function resolvePackageBin(pkg, binName) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const binField = pkgJson.bin;
  const rel = typeof binField === "string" ? binField : binField?.[binName];
  if (!rel) {
    throw new Error(`Package ${pkg} has no bin named ${binName}`);
  }
  return path.resolve(path.dirname(pkgJsonPath), rel);
}

function runNodeCli(binPath, args) {
  return spawn(process.execPath, [binPath, ...args], {
    stdio: "inherit",
    env,
    windowsHide: true,
  });
}

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

export function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  unixKillTree(pid, "SIGTERM");
}

export function forceKillProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  unixKillTree(pid, "SIGKILL");
}

function attachServer(child) {
  writeFileSync(PID_FILE, String(child.pid ?? ""), "utf8");
  let shuttingDown = false;
  const finish = (exitCode = 0) => {
    try {
      unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    process.exit(exitCode);
  };

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    killProcessTree(child.pid);
    const timer = setTimeout(() => {
      forceKillProcessTree(child.pid);
      finish(exitCode);
    }, 5000);
    if (child.exitCode !== null) {
      clearTimeout(timer);
      finish(exitCode);
      return;
    }
    child.once("exit", () => {
      clearTimeout(timer);
      finish(exitCode);
    });
  };

  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
  child.on("exit", (c) => {
    if (!shuttingDown) finish(c ?? 0);
  });
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const prismaBin = resolvePackageBin("prisma", "prisma");
  const nextBin = resolvePackageBin("next", "next");

  const migrate = runNodeCli(prismaBin, ["migrate", "deploy"]);
  migrate.on("exit", (code) => {
    if (code !== 0) process.exit(code ?? 1);

    const build = runNodeCli(nextBin, ["build"]);
    build.on("exit", (buildCode) => {
      if (buildCode !== 0) process.exit(buildCode ?? 1);
      const next = runNodeCli(nextBin, ["start", "--hostname", "127.0.0.1", "-p", PORT]);
      attachServer(next);
    });
  });
}
