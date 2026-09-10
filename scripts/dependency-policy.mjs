#!/usr/bin/env node
/**
 * Classifies npm audit findings against a reviewed exception list.
 *
 * Policy result is PASS | FAIL | ERROR.
 * ERROR (parser/service/timeout/malformed/spawn) exits 2 and never looks clean.
 * npm audit often exits 1 when vulnerabilities exist — that is evaluated,
 * not treated as an execution failure.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnNpm } from "./command-runner.mjs";
import { evaluateAuditPolicy } from "./dependency-match.mjs";

const root = process.cwd();
const exceptionsPath = path.join(root, "docs/security/dependency-exceptions.json");
const outDir = path.join(root, "docs/audits");

const AUDIT_TIMEOUT_MS = 120_000;

export function emptyAuditRun(overrides = {}) {
  return {
    launched: false,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    spawnError: null,
    timedOut: false,
    ...overrides,
  };
}

export function runNpmAuditJson(spawnNpmImpl = spawnNpm, timeoutMs = AUDIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(emptyAuditRun(value));
    };

    let child;
    try {
      child = spawnNpmImpl(["audit", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      finish({
        launched: false,
        spawnError: error instanceof Error ? error.message : String(error),
        stderr: error instanceof Error && "code" in error ? String(error.code) : "",
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        launched: false,
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        spawnError: error.message,
      });
    });
    child.on("exit", () => {
      /* close is authoritative after stdio flush */
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({
        launched: true,
        stdout,
        stderr,
        exitCode: code,
        signal,
        timedOut,
        spawnError: timedOut ? "timeout" : null,
      });
    });
  });
}

export async function runDependencyPolicy({
  policy,
  today = new Date().toISOString().slice(0, 10),
  auditRun,
} = {}) {
  const loadedPolicy = policy ?? JSON.parse(readFileSync(exceptionsPath, "utf8"));
  const run = auditRun ?? (await runNpmAuditJson());
  return evaluateAuditPolicy(run, loadedPolicy, today);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  mkdirSync(outDir, { recursive: true });
  const policy = JSON.parse(readFileSync(exceptionsPath, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  const auditRun = await runNpmAuditJson();
  if (auditRun.stdout) {
    writeFileSync(path.join(outDir, "npm-audit.last.json"), auditRun.stdout);
  }
  const outcome = evaluateAuditPolicy(auditRun, policy, today);
  writeFileSync(
    path.join(outDir, "dependency-policy-last.json"),
    JSON.stringify({ today, outcome, policy }, null, 2)
  );
  console.log(
    `Dependency policy: ${outcome.result} (${outcome.records.length} high/critical package(s), ${outcome.failures.length} failure(s)).`
  );
  for (const row of outcome.records) {
    console.log(
      `- ${row.package} ${row.severity} ghsa=${row.ghsaIds.join(",") || "inherited"} pathClass=${row.pathClass}`
    );
  }
  for (const failure of outcome.failures) console.error(failure);
  process.exit(outcome.exitCode);
}
