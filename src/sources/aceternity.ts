import { ACETERNITY_LICENSE, ACETERNITY_TERMS_URL } from "../compliance/texts.js";
import { ACETERNITY_ALL_ACCESS } from "../compliance/token.js";
import { fetchJsonUncached, UpstreamError, type Net } from "../net.js";
import type { EnvConfig } from "../types.js";
import type { Draft } from "../types.js";

const API = "https://ui.aceternity.com/api/components";
const SITE = "https://ui.aceternity.com";
const INSTALL_DOCS = "https://ui.aceternity.com/installation";

interface FreeItem {
  name: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  installCommand?: string;
  documentationUrl?: string;
  kind: "component" | "block" | "hook";
}

interface RegistryFile {
  path?: string;
  content?: string;
  type?: string;
  target?: string;
}

interface RegistryItem {
  name?: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  files?: RegistryFile[];
  author?: string;
}

interface ApiPayload {
  components?: Array<Omit<FreeItem, "kind">>;
  blocks?: Array<Omit<FreeItem, "kind">>;
  hooks?: Array<Omit<FreeItem, "kind">>;
}

function notice(): string[] {
  return [
    ACETERNITY_LICENSE,
    "Redistribution of the item as source, stock, a marketplace theme, or a template product is not allowed. End products (sites, apps, client work) are allowed.",
  ];
}

async function freeCatalog(net: Net): Promise<FreeItem[]> {
  const payload = await net.fetchJson<ApiPayload>(API, `${SITE}/components`);
  const items: FreeItem[] = [];
  for (const component of payload.components ?? []) {
    if (component.name) items.push({ ...component, kind: "component" });
  }
  for (const block of payload.blocks ?? []) {
    if (block.name) items.push({ ...block, kind: "block" });
  }
  for (const hook of payload.hooks ?? []) {
    if (hook.name) items.push({ ...hook, kind: "hook" });
  }
  return items;
}

function score(query: string, item: FreeItem): number {
  const hay = `${item.name} ${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
  const q = query.toLowerCase();
  if (hay.includes(q)) return 10 + q.length;
  let total = 0;
  for (const token of q.split(/[^a-z0-9]+/).filter((token) => token.length > 1)) {
    if (hay.includes(token)) total += 3;
  }
  return total;
}

function metaDraft(item: FreeItem): Draft<string> {
  const install = item.installCommand || `npx shadcn@latest add @aceternity/${item.name}`;
  return {
    sourceId: "aceternity",
    itemId: item.name,
    title: item.title || item.name,
    officialUrl: item.documentationUrl || `${SITE}/components/${item.name}`,
    install,
    kind: "metadata",
    licenseName: "Aceternity License",
    licenseUrl: ACETERNITY_TERMS_URL,
    attribution: "The author retains ownership. Aceternity License. https://ui.aceternity.com/licence",
    termsUrl: ACETERNITY_TERMS_URL,
    requiredNotices: notice(),
    redistribution: "forbidden",
    content: item.description || `${item.title || item.name} from the free Aceternity catalog.`,
    notes: ["Free catalog item from https://ui.aceternity.com/api/components. get_item fetches the official registry JSON for this one item."],
  };
}

export async function searchAceternity(net: Net, query: string, limit: number): Promise<Draft<string>[]> {
  const items = await freeCatalog(net);
  return items
    .map((item) => ({ item, score: score(query, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => metaDraft(row.item));
}

export interface AceternitySource {
  registryUrl: string;
  name: string;
  title?: string;
  dependencies?: string[];
  author?: string;
  files: Array<{ path?: string; content?: string }>;
  premium: boolean;
}

function sourceDraft(item: AceternitySource, officialUrl: string, install: string): Draft<AceternitySource> {
  return {
    sourceId: "aceternity",
    itemId: item.name,
    title: item.title || item.name,
    officialUrl,
    install,
    kind: "source",
    licenseName: "Aceternity License",
    licenseUrl: ACETERNITY_TERMS_URL,
    attribution: item.author
      ? `${item.author}. The author retains ownership under the Aceternity License.`
      : "The author retains ownership under the Aceternity License.",
    termsUrl: ACETERNITY_TERMS_URL,
    requiredNotices: notice(),
    redistribution: "forbidden",
    content: item,
    scanText: item.files.map((file) => file.content ?? "").join("\n"),
    notes: item.premium
      ? [
          "Fetched from the official registry with ACETERNITY_PRO_TOKEN. Do not redistribute this as a competing library or template.",
          "The token was not written into the payload.",
        ]
      : ["Fetched from the public free registry. One item, for an end product."],
  };
}

function premiumBlocked(name: string, reason: string): Draft<AceternitySource> {
  return {
    sourceId: "aceternity",
    itemId: name,
    title: name,
    officialUrl: `${SITE}/pricing`,
    install: `Premium items use the official registry with a Bearer token. See ${INSTALL_DOCS}. Set ACETERNITY_PRO_TOKEN to the All-Access API key. Command shape: npx shadcn@latest add @aceternity/${name}`,
    kind: "source",
    licenseName: "Aceternity License",
    licenseUrl: ACETERNITY_TERMS_URL,
    attribution: "The author retains ownership under the Aceternity License.",
    termsUrl: ACETERNITY_TERMS_URL,
    requiredNotices: notice(),
    redistribution: "forbidden",
    content: null,
    block: { reason },
    publicFields: {
      installation: INSTALL_DOCS,
      registryPattern: "https://ui.aceternity.com/registry/{name}.json",
      env: "ACETERNITY_PRO_TOKEN",
    },
  };
}

function premiumNeedsToken(name: string): Draft<AceternitySource> {
  const requirement = ACETERNITY_ALL_ACCESS;
  return {
    sourceId: "aceternity",
    itemId: name,
    title: name,
    officialUrl: `${SITE}/pricing`,
    install: `Premium items use the official registry with a Bearer token. See ${INSTALL_DOCS}. Set ACETERNITY_PRO_TOKEN to the All-Access API key. Command shape: npx shadcn@latest add @aceternity/${name}`,
    kind: "source",
    licenseName: "Aceternity License",
    licenseUrl: ACETERNITY_TERMS_URL,
    attribution: "The author retains ownership under the Aceternity License.",
    termsUrl: ACETERNITY_TERMS_URL,
    requiredNotices: notice(),
    redistribution: "forbidden",
    content: null,
    needsToken: requirement,
    publicFields: {
      installation: INSTALL_DOCS,
      registryPattern: "https://ui.aceternity.com/registry/{name}.json",
      env: requirement.envVar,
      product: requirement.product,
      registerUrls: requirement.registerUrls,
    },
  };
}

export async function getAceternityItem(
  net: Net,
  env: EnvConfig,
  fetchImpl: typeof fetch,
  id: string,
): Promise<Draft<AceternitySource>> {
  const name = id.replace(/^pro:/, "").trim();
  const forcedPremium = id.startsWith("pro:");
  if (!/^[a-z0-9-]+$/i.test(name)) {
    return premiumBlocked(name.slice(0, 80), "The component name is not a registry slug. No source was fetched.");
  }
  let catalog: FreeItem[];
  try {
    catalog = await freeCatalog(net);
  } catch (error) {
    const message = error instanceof UpstreamError ? error.message : "The free catalog could not be loaded.";
    return premiumBlocked(
      name,
      `Refusing to fetch registry source because the free catalog could not be verified. ${message}`,
    );
  }
  const free = catalog.find((item) => item.name === name);
  if (!free || forcedPremium) {
    if (!env.aceternityProToken) {
      return premiumNeedsToken(name);
    }
    const registryUrl = `https://ui.aceternity.com/registry/${name}.json`;
    const payload = await fetchJsonUncached<RegistryItem>(fetchImpl, registryUrl, `${SITE}/components/${name}`, {
      Authorization: `Bearer ${env.aceternityProToken}`,
    });
    return sourceDraft(toSource(name, payload, registryUrl, true), `${SITE}/components/${name}`, `npx shadcn@latest add @aceternity/${name}`);
  }
  const registryUrl = `https://ui.aceternity.com/registry/${free.name}.json`;
  const payload = await fetchJsonUncached<RegistryItem>(fetchImpl, registryUrl, free.documentationUrl || `${SITE}/components/${free.name}`, {});
  return sourceDraft(
    toSource(free.name, payload, registryUrl, false),
    free.documentationUrl || `${SITE}/components/${free.name}`,
    free.installCommand || `npx shadcn@latest add @aceternity/${free.name}`,
  );
}

function toSource(name: string, payload: RegistryItem, registryUrl: string, premium: boolean): AceternitySource {
  const files = (payload.files ?? []).map((file) => ({ path: file.path ?? file.target, content: file.content }));
  if (!files.some((file) => file.content)) {
    throw new UpstreamError("Official registry item did not include file content.", 200, registryUrl);
  }
  return {
    registryUrl,
    name: payload.name || name,
    title: payload.title,
    dependencies: payload.dependencies,
    author: payload.author,
    files,
    premium,
  };
}
