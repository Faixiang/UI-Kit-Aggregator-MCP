import { CULT_UI_LICENSE, CULT_UI_TERMS_URL } from "../compliance/texts.js";
import { UpstreamError, type Net } from "../net.js";
import type { Draft } from "../types.js";

const REGISTRY = "https://www.cult-ui.com/r/registry.json";
const LLMS = "https://www.cult-ui.com/llms.txt";
const HOME = "https://www.cult-ui.com";
const ITEM = (name: string) => `https://www.cult-ui.com/r/${name}.json`;

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
  CULT_UI_LICENSE,
  "Include this copyright notice with any copy or substantial portion. Official Cult UI registry: https://www.cult-ui.com/r/registry.json.",
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

async function registryIndex(net: Net): Promise<RegistryItem[]> {
  const payload = await net.fetchJson<RegistryIndex>(REGISTRY, HOME);
  return (payload.items ?? []).filter((item) => Boolean(item.name));
}

function officialPage(name: string, docs?: DocsEntry): string {
  if (docs?.url) return docs.url;
  return `${HOME}/docs/components/${name}`;
}

async function docsMap(net: Net): Promise<Map<string, DocsEntry>> {
  const map = new Map<string, DocsEntry>();
  try {
    const text = await net.fetchText(LLMS, `${HOME}/llms.txt`);
    for (const line of text.split(/\r?\n/)) {
      const item = /^- \[([^\]]+)\]\((https:\/\/[^)]+)\):\s*(.+)$/.exec(line);
      if (!item?.[1] || !item[2] || !item[3]) continue;
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

function isSearchable(item: RegistryItem): boolean {
  if (item.type === "registry:ui") return true;
  if (!item.type && !item.name.endsWith("-demo")) return true;
  return false;
}

function metaDraft(item: RegistryItem, docs?: DocsEntry): Draft<string> {
  return {
    sourceId: "cult-ui",
    itemId: item.name,
    title: docs?.title || item.title || item.name,
    officialUrl: officialPage(item.name, docs),
    install: `npx shadcn@latest add @cult-ui/${item.name}`,
    kind: "metadata",
    licenseName: "MIT License",
    licenseUrl: CULT_UI_TERMS_URL,
    attribution: "Copyright (c) 2023 Jordan-Gilliam",
    termsUrl: CULT_UI_TERMS_URL,
    requiredNotices: NOTICE,
    redistribution: "allowed",
    content: item.description || docs?.description || `${item.title || item.name} from the official Cult UI registry.`,
    notes: [
      "Free official registry item. get_item fetches https://www.cult-ui.com/r/{name}.json for this one component.",
      item.dependencies?.length ? `Dependencies: ${item.dependencies.join(", ")}` : "No extra npm dependencies listed on the index.",
    ],
  };
}

export async function searchCultUi(net: Net, query: string, limit: number): Promise<Draft<string>[]> {
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

export interface CultUiSource {
  registryUrl: string;
  name: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  files: Array<{ path?: string; content: string }>;
}

export async function getCultUiItem(net: Net, id: string): Promise<Draft<CultUiSource>> {
  const name = id.trim();
  if (!/^[a-z0-9-]+$/i.test(name)) {
    return missing(name, "The component name is not a registry slug. No source was fetched.");
  }
  const items = await registryIndex(net);
  const listed = items.find((item) => item.name === name);
  if (!listed) {
    return missing(
      name,
      `"${name}" is not in the official Cult UI registry at ${REGISTRY}. Nothing was invented and no unofficial mirror was fetched.`,
    );
  }
  const registryUrl = ITEM(listed.name);
  const payload = await net.fetchJson<RegistryItem>(registryUrl, officialPage(listed.name));
  const files = (payload.files ?? [])
    .filter((file) => typeof file.content === "string" && file.content.length > 0)
    .map((file) => ({ path: file.path ?? file.target, content: file.content as string }));
  if (files.length === 0) {
    throw new UpstreamError("Official registry item did not include file content.", 200, registryUrl);
  }
  const docs = (await docsMap(net)).get(listed.name.toLowerCase());
  const content: CultUiSource = {
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
    notes: ["Fetched from the official Cult UI registry. One item, under the MIT license. Keep the copyright notice."],
  };
}

function missing(id: string, reason: string): Draft<CultUiSource> {
  return {
    sourceId: "cult-ui",
    itemId: /^[a-z0-9-]+$/i.test(id) ? id : null,
    title: "Cult UI component",
    officialUrl: HOME,
    install: "npx shadcn@latest add @cult-ui/<name>",
    kind: "source",
    licenseName: "MIT License",
    licenseUrl: CULT_UI_TERMS_URL,
    attribution: "Copyright (c) 2023 Jordan-Gilliam",
    termsUrl: CULT_UI_TERMS_URL,
    requiredNotices: NOTICE,
    redistribution: "allowed",
    content: null,
    block: { reason },
  };
}
