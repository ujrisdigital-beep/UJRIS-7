import type { ChildProcess, SpawnOptions, SpawnSyncReturns } from "node:child_process";

export function resolvePackageBin(pkg: string, binName: string): string;
export function resolveNpmCli(env?: NodeJS.ProcessEnv, execPath?: string): string;
export function npmInvocation(
  args: string[],
  env?: NodeJS.ProcessEnv,
  execPath?: string
): { command: string; args: string[] };
export function spawnNodeEntry(entryPath: string, args?: string[], options?: SpawnOptions): ChildProcess;
export function spawnNodeEntrySync(
  entryPath: string,
  args?: string[],
  options?: SpawnOptions
): SpawnSyncReturns<string | Buffer>;
export function spawnNpm(args: string[], options?: SpawnOptions): ChildProcess;
