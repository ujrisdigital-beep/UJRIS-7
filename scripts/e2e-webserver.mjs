#!/usr/bin/env node
/**
 * Portable E2E web server supervisor.
 * Playwright sends SIGTERM/SIGINT to this process; we reap Next and its
 * children (Unix child-walk / Windows taskkill /T) so the port is released.
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

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const prismaBin = resolvePackageBin("prisma", "prisma");
  const nextBin = resolvePackageBin("next", "next");

  const migrate = runNodeCli(prismaBin, ["migrate", "deploy"]);
  migrate.on("exit", (code) => {
    if (code !== 0) process.exit(code ?? 1);

    const next = runNodeCli(nextBin, ["dev", "--hostname", "127.0.0.1", "-p", PORT]);
    writeFileSync(PID_FILE, String(next.pid ?? ""), "utf8");

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
      killProcessTree(next.pid);
      const timer = setTimeout(() => {
        forceKillProcessTree(next.pid);
        finish(exitCode);
      }, 5000);
      if (next.exitCode !== null) {
        clearTimeout(timer);
        finish(exitCode);
        return;
      }
      next.once("exit", () => {
        clearTimeout(timer);
        finish(exitCode);
      });
    };

    process.on("SIGTERM", () => shutdown(0));
    process.on("SIGINT", () => shutdown(0));
    next.on("exit", (c) => {
      if (!shuttingDown) finish(c ?? 0);
    });
  });
}
