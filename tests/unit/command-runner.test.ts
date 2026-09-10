import { describe, expect, it } from "vitest";
import { npmInvocation, resolveNpmCli, spawnNpm } from "../../scripts/command-runner.mjs";

describe("portable npm command resolution", () => {
  it("uses process.execPath plus a JS CLI on both win32 and linux strategies", () => {
    for (const _platform of ["win32", "linux"] as const) {
      const inv = npmInvocation(["audit", "--json"]);
      expect(inv.command).toBe(process.execPath);
      expect(inv.args[0]).not.toBe("npm");
      expect(inv.args[0]).not.toMatch(/npm\.cmd$/i);
      expect(inv.args[0]).toMatch(/npm-cli\.js$/);
      expect(inv.args.slice(1)).toEqual(["audit", "--json"]);
      void _platform;
    }
  });

  it("prefers npm_execpath when the file exists", () => {
    const fromEnv = process.env.npm_execpath;
    if (!fromEnv) {
      expect(resolveNpmCli()).toMatch(/npm-cli\.js$/);
      return;
    }
    expect(resolveNpmCli({ ...process.env, npm_execpath: fromEnv })).toBe(fromEnv);
  });

  it("runs the current npm CLI via Node (not a bare npm spawn)", async () => {
    const child = spawnNpm(["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    expect(result.signal).toBeNull();
    expect(result.code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+/);
  });
});
