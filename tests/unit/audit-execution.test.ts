import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { evaluateAuditPolicy, parseAuditJson } from "../../scripts/dependency-match.mjs";
import { runNpmAuditJson } from "../../scripts/dependency-policy.mjs";

const policy = { exceptions: [] };

function fakeChild(opts: {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
  hang?: boolean;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: (signal?: NodeJS.Signals) => boolean;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.stdout.end();
    child.stderr.end();
    setImmediate(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  setImmediate(() => {
    if (opts.error) {
      child.emit("error", opts.error);
      child.emit("close", null, null);
      return;
    }
    child.stdout.end(opts.stdout ?? "");
    child.stderr.end(opts.stderr ?? "");
    if (!opts.hang) {
      child.emit("close", opts.code ?? 0, opts.signal ?? null);
    }
  });
  return child;
}

describe("audit subprocess classification", () => {
  it("spawn ENOENT is ERROR and never PASS", async () => {
    const err = Object.assign(new Error("spawn npm ENOENT"), { code: "ENOENT" });
    const run = await runNpmAuditJson(() => fakeChild({ error: err }) as never);
    expect(run.launched).toBe(false);
    expect(run.spawnError).toMatch(/ENOENT/);
    const outcome = evaluateAuditPolicy(run, policy, "2026-09-10");
    expect(outcome.result).toBe("ERROR");
    expect(outcome.exitCode).toBe(2);
  });

  it("timeout is ERROR", async () => {
    const run = await runNpmAuditJson(() => fakeChild({ hang: true }) as never, 30);
    expect(run.timedOut).toBe(true);
    const outcome = evaluateAuditPolicy(run, policy, "2026-09-10");
    expect(outcome.result).toBe("ERROR");
    expect(outcome.reason).toBe("timeout");
    expect(outcome.exitCode).toBe(2);
  });

  it("signal exit is ERROR", () => {
    const parsed = parseAuditJson('{"vulnerabilities":{}}', { launched: true, exitCode: null, signal: "SIGTERM" });
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("signal_exit");
    const outcome = evaluateAuditPolicy(
      { launched: true, exitCode: null, signal: "SIGTERM", stdout: '{"vulnerabilities":{}}', stderr: "", spawnError: null, timedOut: false },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("ERROR");
    expect(outcome.exitCode).toBe(2);
  });

  it("malformed JSON is ERROR", () => {
    const outcome = evaluateAuditPolicy(
      { launched: true, exitCode: 0, signal: null, stdout: "{truncated", stderr: "", spawnError: null, timedOut: false },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("ERROR");
    expect(outcome.reason).toBe("malformed_json");
  });

  it("valid vulnerability JSON with npm audit exit 1 is evaluated", () => {
    const stdout = JSON.stringify({
      vulnerabilities: {
        leftpad: {
          severity: "high",
          via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", name: "leftpad" }],
          nodes: ["node_modules/leftpad"],
        },
      },
    });
    const outcome = evaluateAuditPolicy(
      { launched: true, exitCode: 1, signal: null, stdout, stderr: "", spawnError: null, timedOut: false },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("FAIL");
    expect(outcome.exitCode).toBe(1);
  });

  it("valid clean JSON with npm audit exit 0 is PASS", () => {
    const outcome = evaluateAuditPolicy(
      {
        launched: true,
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({ vulnerabilities: {} }),
        stderr: "",
        spawnError: null,
        timedOut: false,
      },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("PASS");
    expect(outcome.exitCode).toBe(0);
  });

  it("unexpected exit code without relying on empty vulns is ERROR", () => {
    const outcome = evaluateAuditPolicy(
      { launched: true, exitCode: 3, signal: null, stdout: "", stderr: "boom", spawnError: null, timedOut: false },
      policy,
      "2026-09-10"
    );
    expect(outcome.result).toBe("ERROR");
    expect(outcome.reason).toBe("unexpected_exit");
  });
});
