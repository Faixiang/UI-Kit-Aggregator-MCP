import {
  REACT_BITS_LICENSE,
  REACT_BITS_PRO_SUMMARY,
  REACT_BITS_PRO_TERMS_URL,
  REACT_BITS_TERMS_URL,
} from "../compliance/texts.js";
import { REACT_BITS_PRO_ACCESS } from "../compliance/token.js";
import { fetchJsonUncached, type Net } from "../net.js";
import type { Draft, EnvConfig } from "../types.js";

const REGISTRY = "https://reactbits.dev/r/registry.json";
const LLMS = "https://reactbits.dev/llms.txt";
const PRO_MANIFEST = "https://www.reactbits.dev/pro-manifest.json";
const HOME = "https://reactbits.dev";
const PRO_HOME = "https://pro.reactbits.dev";

interface RegistryFile {
  path?: string;
  content?: string;
  type?: string;
}

interface RegistryItem {
  name: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
}

interface RegistryIndex {
  items?: RegistryItem[];
}

interface DocsEntry {
  title: string;
  url: string;
  description: string;
  section: string;
}

interface ProEntry {
  id: string;
  registry: "starter" | "pro";
  registryName: string;
  title: string;
  description: string;
  href: string;
  tier?: string;
  install: string;
}

const FREE_NOTICE = [
  REACT_BITS_LICENSE,
  "Include this notice with the component. Commons Clause: do not sell, sublicense, or redistribute the component itself, alone, bundled, or as a port. Using it inside an application, website, or product is allowed.",
];

const PRO_NOTICE = [
  REACT_BITS_PRO_SUMMARY,
  "Do not redistribute this source as a competing library, template, or public registry.",
];

function variantOf(name: string): { base: string; variant: string } {
  const styled = /^(.*)-(JS|TS)-(CSS|TW)$/.exec(name);
  if (styled?.[1] && styled[2] && styled[3]) return { base: styled[1], variant: `${styled[2]}-${styled[3]}` };
  const lang = /^(.*)-(JS|TS)$/.exec(name);
  if (lang?.[1] && lang[2]) return { base: lang[1], variant: lang[2] };
  return { base: name, variant: "" };
}

function prefer(names: string[], requested?: string): string {
  if (requested) {
    const hit = names.find((name) => name.endsWith(`-${requested}`) || name.endsWith(requested));
    if (hit) return hit;
  }
  const order = ["-TS-TW", "-TS-CSS", "-JS-TW", "-JS-CSS", "-TS", "-JS"];
  for (const suffix of order) {
    const hit = names.find((name) => name.endsWith(suffix));
    if (hit) return hit;
  }
  return names[0] ?? "";
}

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
  return payload.items ?? [];
}

async function docsMap(net: Net): Promise<Map<string, DocsEntry>> {
  const map = new Map<string, DocsEntry>();
  try {
    const text = await net.fetchText(LLMS, `${HOME}/llms.txt`);
    let section = "React Bits";
    for (const line of text.split(/\r?\n/)) {
      const heading = /^##\s+(.+)/.exec(line);
      if (heading?.[1]) {
        section = heading[1].trim();
        continue;
      }
      const item = /^- \[([^\]]+)\]\((https:\/\/[^)]+)\):\s*(.+)$/.exec(line);
      if (!item?.[1] || !item[2] || !item[3]) continue;
      if (item[2].includes("pro.reactbits.dev")) continue;
      const cli = /CLI:\s*`([^`]+)`/.exec(item[3]);
      const key = (cli?.[1] ?? item[1]).replace(/\s+/g, "");
      map.set(key.toLowerCase(), {
        title: item[1],
        url: item[2],
        description: item[3].replace(/\s*CLI:\s*`[^`]+`\.?/, "").trim(),
        section,
      });
    }
  } catch {
    /* registry metadata still works without llms.txt */
  }
  return map;
}

function flattenPro(manifest: Record<string, unknown>): ProEntry[] {
  const entries: ProEntry[] = [];
  const components = Array.isArray(manifest.components) ? manifest.components : [];
  for (const raw of components) {
    const item = raw as { slug?: string; name?: string; description?: string; href?: string; tier?: string };
    if (!item.slug || !item.name) continue;
    const registryName = `${item.slug}-tw`;
    entries.push({
      id: `starter:${registryName}`,
      registry: "starter",
      registryName,
      title: item.name,
      description: item.description ?? "",
      href: item.href ?? `${PRO_HOME}/docs/components/${item.slug}`,
      tier: item.tier,
      install: `npx shadcn@latest add @reactbits-starter/${registryName}`,
    });
  }
  for (const key of ["blocks", "appUi"] as const) {
    const groups = Array.isArray(manifest[key]) ? (manifest[key] as unknown[]) : [];
    for (const groupRaw of groups) {
      const group = groupRaw as { tier?: string; variants?: Array<Record<string, unknown>> };
      for (const variant of group.variants ?? []) {
        const registryName = String(variant.registryName ?? variant.slug ?? "");
        if (!registryName) continue;
        entries.push({
          id: `pro:${registryName}`,
          registry: "pro",
          registryName,
          title: String(variant.name ?? registryName),
          description: String(variant.description ?? ""),
          href: String(variant.href ?? PRO_HOME),
          tier: group.tier,
          install: `npx shadcn@latest add @reactbits-pro/${registryName}`,
        });
      }
    }
  }
  const templates = Array.isArray(manifest.templates) ? manifest.templates : [];
  for (const raw of templates) {
    const item = raw as { slug?: string; name?: string; description?: string; href?: string; tier?: string };
    if (!item.slug || !item.name) continue;
    entries.push({
      id: `pro:${item.slug}`,
      registry: "pro",
      registryName: item.slug,
      title: item.name,
      description: item.description ?? "",
      href: item.href ?? `${PRO_HOME}/docs/templates/${item.slug}`,
      tier: item.tier,
      install: `npx shadcn@latest add @reactbits-pro/${item.slug}`,
    });
  }
  return entries;
}

async function proCatalog(net: Net): Promise<ProEntry[]> {
  try {
    const manifest = await net.fetchJson<Record<string, unknown>>(PRO_MANIFEST, PRO_HOME);
    return flattenPro(manifest);
  } catch {
    return [];
  }
}

function freeDraft(item: RegistryItem, docs: DocsEntry | undefined): Draft<string> {
  const { base } = variantOf(item.name);
  const sound = base.startsWith("Sound");
  const install = [
    `npx shadcn@latest add @react-bits/${item.name}`,
    `npx shadcn@latest add https://reactbits.dev/r/${item.name}`,
  ].join("\n");
  return {
    sourceId: "react-bits",
    itemId: item.name,
    title: docs?.title || item.title || base,
    officialUrl: docs?.url || `https://reactbits.dev/r/${item.name}.json`,
    install,
    kind: "metadata",
    licenseName: "MIT License + Commons Clause",
    licenseUrl: REACT_BITS_TERMS_URL,
    attribution: "Copyright (c) 2026 David Haz",
    termsUrl: REACT_BITS_TERMS_URL,
    requiredNotices: FREE_NOTICE,
    redistribution: "forbidden",
    content: item.description || docs?.description || `${base} from the official React Bits registry.`,
    notes: [
      docs ? `Section: ${docs.section}` : "Docs URL was not in llms.txt; the registry JSON URL is the official source.",
      sound
        ? "Sound-library items are covered by the Commons Clause. You may use them in an end product. You may not sell or redistribute the sounds themselves."
        : "Free registry item. get_item returns this one component for an end product, plus the full license.",
      item.dependencies?.length ? `Dependencies: ${item.dependencies.join(", ")}` : "No extra npm dependencies listed on the index.",
    ],
  };
}

function proDraft(entry: ProEntry): Draft<string> {
  return {
    sourceId: "react-bits",
    itemId: entry.id,
    title: `React Bits Pro: ${entry.title}`,
    officialUrl: entry.href,
    install: entry.install,
    kind: "metadata",
    licenseName: "React Bits Pro License Agreement",
    licenseUrl: REACT_BITS_PRO_TERMS_URL,
    attribution: "Copyright David Haz. React Bits Pro is a separate paid license from the free MIT + Commons Clause library.",
    termsUrl: REACT_BITS_PRO_TERMS_URL,
    requiredNotices: PRO_NOTICE,
    redistribution: "forbidden",
    content: `${entry.description} Public catalogue metadata only (tier: ${entry.tier ?? "paid"}). Source is not included unless this server has REACTBITS_LICENSE_KEY.`,
    notes: [
      "Metadata comes from the public pro-manifest. It contains no source.",
      "Do not point an unlicensed agent at a hosted copy of this server that holds a license key.",
    ],
    publicFields: {
      registry: entry.registry,
      registryName: entry.registryName,
      env: "REACTBITS_LICENSE_KEY",
    },
  };
}

export async function searchReactBits(net: Net, query: string, limit: number, variant?: string): Promise<Draft<string>[]> {
  const [items, docs, pro] = await Promise.all([registryIndex(net), docsMap(net), proCatalog(net)]);
  const groups = new Map<string, RegistryItem[]>();
  for (const item of items) {
    const { base } = variantOf(item.name);
    const list = groups.get(base) ?? [];
    list.push(item);
    groups.set(base, list);
  }
  const freeHits: Array<{ score: number; draft: Draft<string> }> = [];
  for (const [base, group] of groups) {
    const chosenName = prefer(group.map((item) => item.name), variant);
    const chosen = group.find((item) => item.name === chosenName) ?? group[0];
    if (!chosen) continue;
    const doc = docs.get(base.toLowerCase());
    const hay = `${base} ${chosen.title ?? ""} ${chosen.description ?? ""} ${doc?.description ?? ""} ${doc?.section ?? ""}`;
    const value = score(query, hay);
    if (value > 0) freeHits.push({ score: value, draft: freeDraft(chosen, doc) });
  }
  const proHits: Array<{ score: number; draft: Draft<string> }> = [];
  for (const entry of pro) {
    const value = score(query, `${entry.title} ${entry.description} ${entry.registryName}`);
    if (value > 0) proHits.push({ score: value - 1, draft: proDraft(entry) });
  }
  return [...freeHits, ...proHits].sort((a, b) => b.score - a.score).slice(0, limit).map((hit) => hit.draft);
}

export interface ReactBitsFile {
  registryUrl: string;
  name: string;
  description?: string;
  dependencies?: string[];
  files: Array<{ path?: string; content: string }>;
  paid: boolean;
}

async function loadFreeItem(net: Net, name: string): Promise<RegistryItem> {
  const url = `https://reactbits.dev/r/${name}.json`;
  return net.fetchJson<RegistryItem>(url, url);
}

export async function getReactBitsItem(
  net: Net,
  env: EnvConfig,
  fetchImpl: typeof fetch,
  id: string,
  variant?: string,
): Promise<Draft<ReactBitsFile>> {
  if (id.startsWith("starter:") || id.startsWith("pro:")) {
    return getPaid(env, fetchImpl, id);
  }
  const items = await registryIndex(net);
  const direct = items.find((item) => item.name === id);
  let resolved = id;
  if (!direct) {
    const matches = items.filter((item) => variantOf(item.name).base.toLowerCase() === id.toLowerCase());
    resolved = prefer(matches.map((item) => item.name), variant);
  } else if (variant && !id.endsWith(variant)) {
    const { base } = variantOf(id);
    const matches = items.filter((item) => variantOf(item.name).base === base);
    resolved = prefer(matches.map((item) => item.name), variant) || id;
  }
  if (!resolved) {
    return missingFree(id);
  }
  const item = await loadFreeItem(net, resolved);
  const files = (item.files ?? []).filter((file) => typeof file.content === "string" && file.content.length > 0).map((file) => ({
    path: file.path,
    content: file.content as string,
  }));
  if (files.length === 0) {
    throw new Error(`Official registry item ${resolved} did not include source. Use https://reactbits.dev/r/${resolved}.json`);
  }
  const docs = (await docsMap(net)).get(variantOf(resolved).base.toLowerCase());
  const payload: ReactBitsFile = {
    registryUrl: `https://reactbits.dev/r/${resolved}.json`,
    name: item.name || resolved,
    description: item.description,
    dependencies: item.dependencies,
    files,
    paid: false,
  };
  return {
    ...freeDraft({ ...item, name: resolved }, docs),
    kind: "source",
    content: payload,
    scanText: files.map((file) => file.content).join("\n"),
    requiredNotices: FREE_NOTICE,
  };
}

function missingFree(id: string): Draft<ReactBitsFile> {
  return {
    sourceId: "react-bits",
    itemId: null,
    title: "React Bits component",
    officialUrl: HOME,
    install: "npx shadcn@latest add @react-bits/<Name>-TS-TW",
    kind: "source",
    licenseName: "MIT License + Commons Clause",
    licenseUrl: REACT_BITS_TERMS_URL,
    attribution: "Copyright (c) 2026 David Haz",
    termsUrl: REACT_BITS_TERMS_URL,
    requiredNotices: FREE_NOTICE,
    redistribution: "forbidden",
    content: null,
    block: {
      reason: `No free registry item matched that id. Nothing was invented. Index: ${REGISTRY}. Paid items use ids starter:<name> or pro:<name> and still need REACTBITS_LICENSE_KEY for source.`,
    },
  };
}

async function getPaid(env: EnvConfig, fetchImpl: typeof fetch, id: string): Promise<Draft<ReactBitsFile>> {
  const registry = id.startsWith("starter:") ? "starter" : "pro";
  const registryName = id.slice(id.indexOf(":") + 1);
  const namespace = registry === "starter" ? "@reactbits-starter" : "@reactbits-pro";
  const officialUrl = `${PRO_HOME}/docs/installation`;
  const install = `npx shadcn@latest add ${namespace}/${registryName}`;
  if (!/^[a-z0-9-]+$/i.test(registryName)) {
    return paidBlock(id, officialUrl, install, "The registry name is not a slug. The paid registry was not called.");
  }
  if (!env.reactBitsLicenseKey) {
    return paidNeedsToken(id, officialUrl, install);
  }
  const registryUrl = `https://pro.reactbits.dev/api/r/${registry}/${registryName}.json`;
  const item = await fetchJsonUncached<RegistryItem>(fetchImpl, registryUrl, officialUrl, {
    Authorization: `Bearer ${env.reactBitsLicenseKey}`,
  });
  const files = (item.files ?? []).filter((file) => typeof file.content === "string" && file.content.length > 0).map((file) => ({
    path: file.path,
    content: file.content as string,
  }));
  if (files.length === 0) {
    return paidBlock(id, officialUrl, install, "The official registry response did not include file content. No substitute source was created.");
  }
  const payload: ReactBitsFile = {
    registryUrl,
    name: item.name || registryName,
    description: item.description,
    dependencies: item.dependencies,
    files,
    paid: true,
  };
  return {
    sourceId: "react-bits",
    itemId: id,
    title: item.title || registryName,
    officialUrl: registryUrl,
    install,
    kind: "source",
    licenseName: "React Bits Pro License Agreement",
    licenseUrl: REACT_BITS_PRO_TERMS_URL,
    attribution: "Copyright David Haz. Personal, non-transferable React Bits Pro license.",
    termsUrl: REACT_BITS_PRO_TERMS_URL,
    requiredNotices: PRO_NOTICE,
    redistribution: "forbidden",
    content: payload,
    scanText: files.map((file) => file.content).join("\n"),
    notes: [
      "Fetched for the local licensed developer. Not cached and not written to disk.",
      "Do not publish this process with the license key, and do not commit the returned source as a component library.",
    ],
  };
}

function paidBlock(id: string, officialUrl: string, install: string, reason: string): Draft<ReactBitsFile> {
  return {
    sourceId: "react-bits",
    itemId: id.startsWith("starter:") || id.startsWith("pro:") ? id : null,
    title: "React Bits Pro",
    officialUrl,
    install,
    kind: "source",
    licenseName: "React Bits Pro License Agreement",
    licenseUrl: REACT_BITS_PRO_TERMS_URL,
    attribution: "Copyright David Haz. React Bits Pro license.",
    termsUrl: REACT_BITS_PRO_TERMS_URL,
    requiredNotices: PRO_NOTICE,
    redistribution: "forbidden",
    content: null,
    block: { reason },
    publicFields: {
      env: "REACTBITS_LICENSE_KEY",
      starterRegistry: "https://pro.reactbits.dev/api/r/starter/{name}.json",
      proRegistry: "https://pro.reactbits.dev/api/r/pro/{name}.json",
      manifest: PRO_MANIFEST,
    },
  };
}

function paidNeedsToken(id: string, officialUrl: string, install: string): Draft<ReactBitsFile> {
  const requirement = REACT_BITS_PRO_ACCESS;
  return {
    sourceId: "react-bits",
    itemId: id.startsWith("starter:") || id.startsWith("pro:") ? id : null,
    title: "React Bits Pro",
    officialUrl,
    install,
    kind: "source",
    licenseName: "React Bits Pro License Agreement",
    licenseUrl: REACT_BITS_PRO_TERMS_URL,
    attribution: "Copyright David Haz. React Bits Pro license.",
    termsUrl: REACT_BITS_PRO_TERMS_URL,
    requiredNotices: PRO_NOTICE,
    redistribution: "forbidden",
    content: null,
    needsToken: requirement,
    publicFields: {
      env: requirement.envVar,
      product: requirement.product,
      registerUrls: requirement.registerUrls,
      starterRegistry: "https://pro.reactbits.dev/api/r/starter/{name}.json",
      proRegistry: "https://pro.reactbits.dev/api/r/pro/{name}.json",
      manifest: PRO_MANIFEST,
    },
  };
}
