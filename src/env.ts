import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EnvConfig } from "./types.js";

/** Load a local .env without overriding variables already set. Never logs values. */
export function loadDotEnv(file = resolve(process.cwd(), ".env")): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function nonempty(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readEnv(): EnvConfig {
  const ttl = Number(process.env.CATALOG_CACHE_TTL_MS ?? "600000");
  const port = Number(process.env.PORT ?? "3847");
  return {
    aceternityProToken: nonempty("ACETERNITY_PRO_TOKEN"),
    reactBitsLicenseKey: nonempty("REACTBITS_LICENSE_KEY"),
    githubToken: nonempty("GITHUB_TOKEN"),
    cacheTtlMs: Number.isFinite(ttl) && ttl >= 0 ? ttl : 600_000,
    transport: (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase(),
    host: process.env.HOST?.trim() || "127.0.0.1",
    port: Number.isFinite(port) && port > 0 ? port : 3847,
  };
}
