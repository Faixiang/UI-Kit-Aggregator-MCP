import { MOTION_PROMPT_LICENSE, MOTION_PROMPT_TERMS_URL } from "../compliance/texts.js";
import type { Net } from "../net.js";
import type { Draft } from "../types.js";

const SITE = "https://showheyohtaki.github.io/motion-prompt/";
const CATALOG_URL = `${SITE}api/v1/catalog.json`;
const REPO = "https://github.com/showheyohtaki/motion-prompt";
const ATTRIBUTION = "Copyright (c) 2026 Shohei Ohtaki";
const INSTALL = "npx skills add showheyohtaki/motion-prompt";

type Localized = Record<string, string>;
type LocalizedList = Record<string, string[]>;

interface CatalogCategory extends Localized {
  slug: string;
}

interface CatalogPack {
  pack: string;
  order?: number;
  title?: Localized;
  categories?: CatalogCategory[];
}

interface CatalogElement {
  id: string;
  pack: string;
  no?: string;
  slug: string;
  category: string;
  width?: number;
  height?: number;
  cycle?: number;
  name?: Localized;
  meaning?: Localized;
  ask?: Localized;
  summary?: Localized;
  spec?: LocalizedList;
  use?: Localized;
  tags?: string[];
}

interface Catalog {
  version?: string;
  site?: string;
  repo?: string;
  count?: number;
  packs?: CatalogPack[];
  elements?: CatalogElement[];
}

export interface MotionPromptEntry {
  id: string;
  slug: string;
  pack: string;
  packTitle: string;
  category: string;
  categoryTitle: string;
  name: string;
  names: Localized;
  meaning: string;
  ask: string;
  summary: string;
  spec: string[];
  use: string;
  tags: string[];
  width?: number;
  height?: number;
  cycle?: number;
  officialUrl: string;
  promptUrl: string;
  elementUrl: string;
  kitUrl: string;
  repo: string;
  prompt?: string;
}

function pick(field: Localized | undefined, lang = "en"): string {
  if (!field) return "";
  return (field[lang] || field.en || Object.values(field)[0] || "").trim();
}

function pickList(field: LocalizedList | undefined, lang = "en"): string[] {
  if (!field) return [];
  const list = field[lang] || field.en || Object.values(field)[0];
  return Array.isArray(list) ? list : [];
}

function allText(field: Localized | LocalizedList | undefined): string {
  if (!field) return "";
  return Object.values(field).flat().join(" ");
}

function galleryUrl(id: string): string {
  return `${SITE}#${id}`;
}

function promptUrl(id: string, lang = "en"): string {
  return `${SITE}api/v1/${lang}/p/${id}.txt`;
}

function elementUrl(id: string, lang = "en"): string {
  return `${SITE}api/v1/${lang}/e/${id}.txt`;
}

function kitUrl(pack: string): string {
  return `${SITE}api/v1/kit/${pack}.js`;
}

function packTitleOf(catalog: Catalog, packId: string): string {
  const pack = catalog.packs?.find((entry) => entry.pack === packId);
  return pick(pack?.title) || packId;
}

function categoryTitleOf(catalog: Catalog, packId: string, slug: string): string {
  const pack = catalog.packs?.find((entry) => entry.pack === packId);
  const category = pack?.categories?.find((entry) => entry.slug === slug);
  return pick(category) || slug;
}

function baseDraft(partial: Omit<Draft<unknown>, "sourceId" | "licenseName" | "licenseUrl" | "attribution" | "termsUrl" | "requiredNotices" | "redistribution">): Draft<unknown> {
  return {
    sourceId: "motion-prompt",
    licenseName: "MIT License",
    licenseUrl: MOTION_PROMPT_TERMS_URL,
    attribution: ATTRIBUTION,
    termsUrl: MOTION_PROMPT_TERMS_URL,
    requiredNotices: [MOTION_PROMPT_LICENSE],
    redistribution: "allowed",
    ...partial,
  };
}

async function loadCatalog(net: Net): Promise<Catalog> {
  return net.fetchJson<Catalog>(CATALOG_URL, SITE);
}

function score(query: string, haystack: string): number {
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(q)) return 8 + Math.min(q.length, 40);
  let total = 0;
  for (const token of q.split(/[^a-z0-9]+/).filter((token) => token.length > 1)) {
    if (h.includes(token)) total += 3;
  }
  return total;
}

function haystack(catalog: Catalog, element: CatalogElement): string {
  const pack = catalog.packs?.find((entry) => entry.pack === element.pack);
  return [
    element.id,
    element.no,
    element.slug,
    element.pack,
    element.category,
    (element.tags ?? []).join(" "),
    allText(element.name),
    allText(element.meaning),
    allText(element.ask),
    allText(element.summary),
    allText(element.spec),
    allText(element.use),
    allText(pack?.title),
    ...(pack?.categories ?? []).flatMap((category) => [category.slug, allText(category)]),
  ].join(" ");
}

function metadataDraft(catalog: Catalog, element: CatalogElement): Draft<string> {
  const name = pick(element.name) || element.slug;
  const meaning = pick(element.meaning);
  const packTitle = packTitleOf(catalog, element.pack);
  const categoryTitle = categoryTitleOf(catalog, element.pack, element.category);
  const blurb = [meaning || name, `${packTitle} / ${categoryTitle}.`].filter(Boolean).join(" — ");
  return baseDraft({
    itemId: element.id,
    title: name,
    officialUrl: galleryUrl(element.id),
    install: INSTALL,
    kind: "metadata",
    content: `${blurb} Official demo: ${galleryUrl(element.id)}. Copyable prompt: ${promptUrl(element.id)}.`,
    notes: [
      "Official Motion Prompt catalog entry (MIT). This is a named effect and copyable prompt, not a drop-in UI component.",
    ],
    publicFields: {
      slug: element.slug,
      pack: element.pack,
      category: element.category,
      promptUrl: promptUrl(element.id),
      elementUrl: elementUrl(element.id),
    },
  }) as Draft<string>;
}

export async function searchMotionPrompt(net: Net, query: string, limit: number): Promise<Draft<string>[]> {
  const catalog = await loadCatalog(net);
  const hits: Array<{ score: number; draft: Draft<string> }> = [];
  for (const element of catalog.elements ?? []) {
    if (!element.id || !element.slug) continue;
    const value = score(query, haystack(catalog, element));
    if (value > 0) hits.push({ score: value, draft: metadataDraft(catalog, element) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map((hit) => hit.draft);
}

function normalizeId(raw: string): string {
  return raw.trim().replace(/^#/, "").replace(/^motion-prompt:/, "");
}

function findElement(catalog: Catalog, rawId: string): CatalogElement | undefined {
  const id = normalizeId(rawId);
  if (!id) return undefined;
  const elements = catalog.elements ?? [];
  const padded = /^\d{1,3}$/.test(id) ? id.padStart(3, "0") : id;
  const byId = elements.find((element) => element.id === padded);
  if (byId) return byId;
  const bySlug = elements.filter((element) => element.slug === id);
  if (bySlug.length === 1) return bySlug[0];
  const packSlug = id.match(/^([a-z0-9-]+)[:/]([a-z0-9-]+)$/i);
  if (packSlug) {
    return elements.find((element) => element.pack === packSlug[1] && element.slug === packSlug[2]);
  }
  const idSlug = id.match(/^(\d{3})-([a-z0-9-]+)$/i);
  if (idSlug) {
    return elements.find((element) => element.id === idSlug[1] && element.slug === idSlug[2]);
  }
  return undefined;
}

function unclear(id: string): Draft<MotionPromptEntry> {
  return baseDraft({
    itemId: null,
    title: "Motion Prompt item",
    officialUrl: SITE,
    install: INSTALL,
    kind: "docs",
    content: null,
    block: {
      reason: `No official Motion Prompt catalog entry matched that id. Nothing was invented. Start at ${SITE} or ${CATALOG_URL}`,
    },
  }) as Draft<MotionPromptEntry>;
}

export async function getMotionPromptItem(net: Net, id: string): Promise<Draft<MotionPromptEntry>> {
  const catalog = await loadCatalog(net);
  const element = findElement(catalog, id);
  if (!element?.id) return unclear(id);

  let promptText: string | undefined;
  try {
    promptText = (await net.fetchText(promptUrl(element.id), galleryUrl(element.id))).trim();
  } catch {
    promptText = undefined;
  }

  const entry: MotionPromptEntry = {
    id: element.id,
    slug: element.slug,
    pack: element.pack,
    packTitle: packTitleOf(catalog, element.pack),
    category: element.category,
    categoryTitle: categoryTitleOf(catalog, element.pack, element.category),
    name: pick(element.name) || element.slug,
    names: element.name ?? {},
    meaning: pick(element.meaning),
    ask: pick(element.ask),
    summary: pick(element.summary),
    spec: pickList(element.spec),
    use: pick(element.use),
    tags: element.tags ?? [],
    width: element.width,
    height: element.height,
    cycle: element.cycle,
    officialUrl: galleryUrl(element.id),
    promptUrl: promptUrl(element.id),
    elementUrl: elementUrl(element.id),
    kitUrl: kitUrl(element.pack),
    repo: catalog.repo || REPO,
  };
  if (promptText) entry.prompt = promptText;

  const scanText = [
    entry.name,
    entry.meaning,
    entry.ask,
    entry.summary,
    entry.spec.join("\n"),
    entry.use,
    entry.tags.join(" "),
    promptText ?? "",
  ].join("\n");

  return baseDraft({
    itemId: element.id,
    title: entry.name,
    officialUrl: entry.officialUrl,
    install: INSTALL,
    kind: "docs",
    content: entry,
    scanText,
    notes: [
      "Fetched from the official Motion Prompt catalog (MIT). Include the MIT notice with any copy you keep. This is a vocabulary and prompt entry, not a drop-in UI component.",
    ],
  }) as Draft<MotionPromptEntry>;
}
