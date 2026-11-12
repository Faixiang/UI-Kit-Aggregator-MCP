import type { EnvConfig } from "./types.js";

export const USER_AGENT = "ui-kit-aggregator-mcp/0.1 (license-gated catalog client)";

export class UpstreamError extends Error {
  readonly httpStatus: number | undefined;
  readonly officialUrl: string;

  constructor(message: string, httpStatus: number | undefined, officialUrl: string) {
    super(message);
    this.name = "UpstreamError";
    this.httpStatus = httpStatus;
    this.officialUrl = officialUrl;
  }
}

interface CacheEntry {
  expires: number;
  value: unknown;
}

export class MemoryCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(
    private readonly now: () => number,
    private readonly ttlMs: number,
  ) {}

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs = this.ttlMs): void {
    this.store.set(key, { expires: this.now() + ttlMs, value });
  }

  async getOrLoad<T>(key: string, loader: () => Promise<T>, ttlMs = this.ttlMs): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const inflight = this.pending.get(key);
    if (inflight) return inflight as Promise<T>;
    const promise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
}

export interface Net {
  cache: MemoryCache;
  fetchText(url: string, officialUrl: string, init?: { github?: boolean; timeoutMs?: number }): Promise<string>;
  fetchJson<T>(url: string, officialUrl: string, init?: { github?: boolean; timeoutMs?: number }): Promise<T>;
}

const MAX_BYTES = 8_000_000;

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error(`Response exceeded ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export function createNet(env: EnvConfig, fetchImpl: typeof fetch = globalThis.fetch, now = () => Date.now()): Net {
  const cache = new MemoryCache(now, env.cacheTtlMs);

  async function request(url: string, officialUrl: string, init?: { github?: boolean; timeoutMs?: number }): Promise<string> {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, text/html;q=0.9, */*;q=0.8",
    };
    if (init?.github) {
      headers.Accept = "application/vnd.github+json";
      headers["X-GitHub-Api-Version"] = "2022-11-28";
      if (env.githubToken) headers.Authorization = `Bearer ${env.githubToken}`;
    }
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(init?.timeoutMs ?? 25_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network request failed";
      throw new UpstreamError(
        `Could not reach ${officialUrl}. ${message}`,
        undefined,
        officialUrl,
      );
    }
    if (response.status === 403 || response.status === 429) {
      throw new UpstreamError(
        `Upstream returned HTTP ${response.status} for ${url}. Not retrying. Use the official page instead of a mirror.`,
        response.status,
        officialUrl,
      );
    }
    if (!response.ok) {
      throw new UpstreamError(
        `Upstream returned HTTP ${response.status} for ${url}.`,
        response.status,
        officialUrl,
      );
    }
    try {
      return await readLimited(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read response";
      throw new UpstreamError(message, response.status, officialUrl);
    }
  }

  return {
    cache,
    async fetchText(url, officialUrl, init) {
      return cache.getOrLoad(`text:${url}`, () => request(url, officialUrl, init));
    },
    async fetchJson<T>(url: string, officialUrl: string, init?: { github?: boolean; timeoutMs?: number }): Promise<T> {
      return cache.getOrLoad(`json:${url}`, async () => {
        const text = await request(url, officialUrl, init);
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new UpstreamError(
            `Upstream did not return JSON for ${url}.`,
            200,
            officialUrl,
          );
        }
      });
    },
  };
}

/** Uncached fetch for paid registry calls. Responses are not stored. */
export async function fetchJsonUncached<T>(
  fetchImpl: typeof fetch,
  url: string,
  officialUrl: string,
  headers: Record<string, string>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new UpstreamError(`Could not reach ${officialUrl}. ${message}`, undefined, officialUrl);
  }
  if (response.status === 403 || response.status === 429 || response.status === 401) {
    throw new UpstreamError(
      `Upstream returned HTTP ${response.status} for ${url}. Not retrying.`,
      response.status,
      officialUrl,
    );
  }
  if (!response.ok) {
    throw new UpstreamError(`Upstream returned HTTP ${response.status} for ${url}.`, response.status, officialUrl);
  }
  const text = await readLimited(response);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`Upstream did not return JSON for ${url}.`, response.status, officialUrl);
  }
}
