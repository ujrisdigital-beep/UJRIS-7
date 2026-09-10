#!/usr/bin/env node
/**
 * Portable child-process helpers. Never spawn a bare `npm` name.
 * Never set shell:true. Always run JS CLIs with process.execPath.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function resolvePackageBin(pkg, binName) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const binField = pkgJson.bin;
  const rel = typeof binField === "string" ? binField : binField?.[binName];
  if (!rel) {
    throw new Error(`Package ${pkg} has no bin named ${binName}`);
  }
  return path.resolve(path.dirname(pkgJsonPath), rel);
}

/**
 * Resolve the npm CLI JavaScript entry so Windows does not need npm.cmd PATH.
 */
export function resolveNpmCli(env = process.env, execPath = process.execPath) {
  const fromEnv = env.npm_execpath;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const nextToNode = path.join(path.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(nextToNode)) return nextToNode;
  try {
    return require.resolve("npm/bin/npm-cli.js");
  } catch {
    const err = new Error("ENOENT: npm CLI JavaScript entry could not be resolved");
    err.code = "ENOENT";
    throw err;
  }
}

export function npmInvocation(args, env = process.env, execPath = process.execPath) {
  return {
    command: execPath,
    args: [resolveNpmCli(env, execPath), ...args],
  };
}

function spawnOptions(options = {}) {
  const { env, ...rest } = options;
  return {
    windowsHide: true,
    ...rest,
    env: env ?? process.env,
    shell: false,
  };
}

export function spawnNodeEntry(entryPath, args = [], options = {}) {
  return spawn(process.execPath, [entryPath, ...args], spawnOptions(options));
}

export function spawnNodeEntrySync(entryPath, args = [], options = {}) {
  return spawnSync(process.execPath, [entryPath, ...args], spawnOptions(options));
}

export function spawnNpm(args, options = {}) {
  const env = options.env ?? process.env;
  const { command, args: argv } = npmInvocation(args, env, process.execPath);
  return spawn(command, argv, spawnOptions(options));
}
