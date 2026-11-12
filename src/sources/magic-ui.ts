import { MAGIC_UI_LICENSE, MAGIC_UI_PRO_TERMS_URL, MAGIC_UI_TERMS_URL } from "../compliance/texts.js";
import { UpstreamError, type Net } from "../net.js";
import type { Draft } from "../types.js";

const REGISTRY = "https://magicui.design/r/registry.json";
const LLMS = "https://magicui.design/llms.txt";
const HOME = "https://magicui.design";
const ITEM = (name: string) => `https://magicui.design/r/${name}.json`;
const PRO_HOST = "pro.magicui.design";

interface RegistryFile {
  path?: string;
  content?: string;
  type?: string;
  target?: string;
}

interface RegistryItem {
  name: string;
  title?: string;
  description?: string;
  type?: string;
  dependencies?: string[];
  files?: RegistryFile[];
  premium?: unknown;
  paid?: unknown;
  tier?: unknown;
  license?: unknown;
}

interface RegistryIndex {
  items?: RegistryItem[];
}

interface DocsEntry {
  title: string;
  url: string;
  description: string;
}

const NOTICE = [
  MAGIC_UI_LICENSE,
  "Include this copyright notice with any copy or substantial portion. This source serves only the official free MIT catalog at https://magicui.design/r/registry.json. Magic UI Pro is a separate paid license and is not included.",
];

function score(query: string, haystack: string): number {
  const q = query.toLowerCase().trim();
  const h = haystack.toLowerCase();
  if (!q) return 0;
  const compactQuery = q.replace(/[^a-z0-9]+/g, "");
  const compactHay = h.replace(/[^a-z0-9]+/g, "");
  let total = 0;
  if (compactQuery.length > 3 && compactHay.includes(compactQuery)) total += 14;
  if (h.includes(q)) total += 12 + Math.min(q.length, 48);
  for (const token of q.split(/[^a-z0-9]+/).filter((token) => token.length > 1)) {
    if (h.includes(token)) total += 3;
  }
  return total;
}

function looksPaid(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string" && /^(pro|premium|paid|all-access)$/i.test(value.trim())) return true;
  return false;
}

/** True for Magic UI Pro / paid markers. Avoids substring hits like "progressive". */
export function isMagicUiPro(id: string, item?: Partial<RegistryItem>, officialUrl?: string): boolean {
  const raw = id.trim();
  if (/^(pro|premium|paid):/i.test(raw)) return true;
  if (officialUrl?.toLowerCase().includes(PRO_HOST)) return true;
  if (item && looksPaid(item.premium ?? item.paid ?? item.tier)) return true;
  if (typeof item?.license === "string" && /pro|premium|paid/i.test(item.license) && !/\bmit\b/i.test(item.license)) {
    return true;
  }
  const hay = [raw.replace(/^(pro|premium|paid):/i, ""), item?.name, item?.title, item?.description, item?.type]
    .filter(Boolean)
    .join(" ");
  if (new RegExp(PRO_HOST.replace(/\./g, "\\."), "i").test(hay)) return true;
  return /(?:^|[^a-z0-9])(?:magic\s*ui\s+pro|pro\s+only|premium\s+only|paid\s+only)(?:[^a-z0-9]|$)/i.test(hay);
}

async function registryIndex(net: Net): Promise<RegistryItem[]> {
  const payload = await net.fetchJson<RegistryIndex>(REGISTRY, HOME);
  return (payload.items ?? []).filter((item) => Boolean(item.name));
}

async function docsMap(net: Net): Promise<Map<string, DocsEntry>> {
  const map = new Map<string, DocsEntry>();
  try {
    const text = await net.fetchText(LLMS, `${HOME}/llms.txt`);
    for (const line of text.split(/\r?\n/)) {
      const item = /^- \[([^\]]+)\]\((https:\/\/[^)]+)\):\s*(.+)$/.exec(line);
      if (!item?.[1] || !item[2] || !item[3]) continue;
      if (item[2].toLowerCase().includes(PRO_HOST)) continue;
      const url = item[2].replace(/\.md$/i, "");
      const slug = url.split("/").pop()?.trim();
      if (!slug) continue;
      map.set(slug.toLowerCase(), { title: item[1], url, description: item[3].trim() });
    }
  } catch {
    /* registry metadata still works without llms.txt */
  }
  return map;
}

function officialPage(name: string, docs?: DocsEntry): string {
  if (docs?.url) return docs.url;
  return `${HOME}/docs/components/${name}`;
}

function isSearchable(item: RegistryItem): boolean {
  if (isMagicUiPro(item.name, item)) return false;
  return item.type === "registry:ui";
}

function metaDraft(item: RegistryItem, docs?: DocsEntry): Draft<string> {
  return {
    sourceId: "magic-ui",
    itemId: item.name,
    title: docs?.title || item.title || item.name,
    officialUrl: officialPage(item.name, docs),
    install: `npx shadcn@latest add @magicui/${item.name}`,
    kind: "metadata",
    licenseName: "MIT License",
    licenseUrl: MAGIC_UI_TERMS_URL,
    attribution: "Copyright (c) Magic UI",
    termsUrl: MAGIC_UI_TERMS_URL,
    requiredNotices: NOTICE,
    redistribution: "allowed",
    content: item.description || docs?.description || `${item.title || item.name} from the official Magic UI free registry.`,
    notes: [
      "Official free / MIT catalog item. get_item fetches https://magicui.design/r/{name}.json for this one component. Magic UI Pro is not included.",
      item.dependencies?.length ? `Dependencies: ${item.dependencies.join(", ")}` : "No extra npm dependencies listed on the index.",
    ],
  };
}

export async function searchMagicUi(net: Net, query: string, limit: number): Promise<Draft<string>[]> {
  const [items, docs] = await Promise.all([registryIndex(net), docsMap(net)]);
  return items
    .filter(isSearchable)
    .map((item) => {
      const doc = docs.get(item.name.toLowerCase());
      const hay = `${item.name} ${item.title ?? ""} ${item.description ?? ""} ${doc?.title ?? ""} ${doc?.description ?? ""}`;
      return { item, doc, score: score(query, hay) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => metaDraft(row.item, row.doc));
}

export interface MagicUiSource {
  registryUrl: string;
  name: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  files: Array<{ path?: string; content: string }>;
}

export async function getMagicUiItem(net: Net, id: string): Promise<Draft<MagicUiSource>> {
  const raw = id.trim();
  if (isMagicUiPro(raw) || raw.toLowerCase().includes(PRO_HOST)) {
    return proBlocked(raw);
  }
  const name = raw.replace(/^(pro|premium|paid):/i, "").trim();
  if (!/^[a-z0-9-]+$/i.test(name)) {
    return missing(name, "The component name is not a registry slug. No source was fetched.");
  }
  const items = await registryIndex(net);
  const listed = items.find((item) => item.name === name);
  if (!listed || isMagicUiPro(name, listed)) {
    return listed && isMagicUiPro(name, listed)
      ? proBlocked(name)
      : missing(
          name,
          `"${name}" is not in the official free Magic UI registry at ${REGISTRY}. This source does not index, fetch, or return Magic UI Pro. Paid catalog: https://pro.magicui.design/license`,
        );
  }
  const registryUrl = ITEM(listed.name);
  if (registryUrl.toLowerCase().includes(PRO_HOST)) {
    return proBlocked(listed.name);
  }
  const payload = await net.fetchJson<RegistryItem>(registryUrl, officialPage(listed.name));
  if (isMagicUiPro(listed.name, payload, registryUrl)) {
    return proBlocked(listed.name);
  }
  const files = (payload.files ?? [])
    .filter((file) => typeof file.content === "string" && file.content.length > 0)
    .map((file) => ({ path: file.path ?? file.target, content: file.content as string }));
  if (files.length === 0) {
    throw new UpstreamError("Official registry item did not include file content.", 200, registryUrl);
  }
  const docs = (await docsMap(net)).get(listed.name.toLowerCase());
  const content: MagicUiSource = {
    registryUrl,
    name: payload.name || listed.name,
    title: payload.title || listed.title,
    description: payload.description || listed.description,
    dependencies: payload.dependencies ?? listed.dependencies,
    files,
  };
  return {
    ...metaDraft({ ...listed, ...payload, name: listed.name }, docs),
    kind: "source",
    officialUrl: officialPage(listed.name, docs),
    content,
    scanText: files.map((file) => file.content).join("\n"),
    notes: ["Fetched from the official free Magic UI registry. One MIT-licensed item. Magic UI Pro was not requested or returned."],
  };
}

function proBlocked(id: string): Draft<MagicUiSource> {
  const name = id.replace(/^(pro|premium|paid):/i, "").slice(0, 80);
  return {
    sourceId: "magic-ui",
    itemId: name || null,
    title: "Magic UI Pro",
    officialUrl: MAGIC_UI_PRO_TERMS_URL,
    install: "Magic UI Pro is not available from this source. Use the official free catalog: npx shadcn@latest add @magicui/<name>",
    kind: "source",
    licenseName: "Magic UI Pro License",
    licenseUrl: MAGIC_UI_PRO_TERMS_URL,
    attribution: "Magic UI Pro is a separate paid license from the free MIT catalog.",
    termsUrl: MAGIC_UI_PRO_TERMS_URL,
    requiredNotices: [
      "Magic UI Pro is a separate paid license (https://pro.magicui.design/license). This server does not index, fetch, or return Pro source.",
    ],
    redistribution: "forbidden",
    content: null,
    block: {
      reason:
        "Magic UI Pro is a separate paid license and is not indexed or fetched by this source. No request was made to pro.magicui.design. Free MIT catalog: https://magicui.design/r/registry.json. Terms: https://pro.magicui.design/license",
    },
    publicFields: {
      freeRegistry: REGISTRY,
      proTerms: MAGIC_UI_PRO_TERMS_URL,
    },
  };
}

function missing(id: string, reason: string): Draft<MagicUiSource> {
  return {
    sourceId: "magic-ui",
    itemId: /^[a-z0-9-]+$/i.test(id) ? id : null,
    title: "Magic UI component",
    officialUrl: HOME,
    install: "npx shadcn@latest add @magicui/<name>",
    kind: "source",
    licenseName: "MIT License",
    licenseUrl: MAGIC_UI_TERMS_URL,
    attribution: "Copyright (c) Magic UI",
    termsUrl: MAGIC_UI_TERMS_URL,
    requiredNotices: NOTICE,
    redistribution: "allowed",
    content: null,
    block: { reason },
  };
}
