#!/usr/bin/env node
/**
 * Classifies npm audit findings against a reviewed exception list.
 *
 * Policy result is PASS | FAIL | ERROR.
 * ERROR (parser/service/timeout/malformed) exits 2 and never looks clean.
 * npm audit often exits 1 when vulnerabilities exist — that is evaluated,
 * not treated as an execution failure.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAuditPolicy } from "./dependency-match.mjs";

const root = process.cwd();
const exceptionsPath = path.join(root, "docs/security/dependency-exceptions.json");
const outDir = path.join(root, "docs/audits");

const AUDIT_TIMEOUT_MS = 120_000;

export function runNpmAuditJson(spawnImpl = spawn, timeoutMs = AUDIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;
    try {
      child = spawnImpl("npm", ["audit", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      finish({ stdout: "", stderr: "", exitCode: null, spawnError: error.message });
      return;
    }

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish({ stdout, stderr, exitCode: null, timedOut: true, spawnError: "timeout" });
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
      finish({ stdout, stderr, exitCode: null, spawnError: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ stdout, stderr, exitCode: code });
    });
  });
}

export async function runDependencyPolicy({
  policy,
  today = new Date().toISOString().slice(0, 10),
  auditRun,
} = {}) {
  const loadedPolicy =
    policy ?? JSON.parse(readFileSync(exceptionsPath, "utf8"));
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
