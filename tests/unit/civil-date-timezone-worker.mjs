import { eraEqaPrimaryDueCivilKey } from "../../src/lib/legal/civil-date.ts";

const sources = [
  "2026-03-12",
  "2026-03-29",
  "2026-03-30",
  "2026-10-24",
  "2026-10-25",
  "2026-01-31",
  "2026-11-30",
  "2024-02-29",
  "2026-02-28",
];

const result = Object.fromEntries(sources.map((source) => [source, eraEqaPrimaryDueCivilKey(source)]));
process.stdout.write(`${JSON.stringify(result)}\n`);
