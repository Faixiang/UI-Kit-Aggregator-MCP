import { REFERO_STYLES_SUMMARY, REFERO_STYLES_TERMS_URL } from "../compliance/texts.js";
import { UpstreamError, type Net } from "../net.js";
import type { Draft } from "../types.js";

const HOME = "https://styles.refero.design/";
const COLLECTIONS = "https://styles.refero.design/sitemaps/collections.xml";
const PAID_MCP = "https://api.refero.design/mcp";
const STYLE_PAGE = (id: string) => `https://styles.refero.design/style/${id}`;

const NOTICE = [
  REFERO_STYLES_SUMMARY,
  "Refero Inc. owns the Refero Styles catalog. This project does not. Third-party product names, screenshots, logos, and trademarks stay with their owners. Do not republish these DESIGN.md files as a library or dataset.",
];

const INSTALL =
  "Follow the DESIGN.md from the official Refero Styles page in Cursor or Claude Code. This is a design reference, not an npm package.";

const STOP_WORDS = new Set([
  "and",
  "for",
  "from",
  "the",
  "with",
  "your",
  "into",
  "design",
  "style",
  "styles",
  "website",
  "websites",
  "site",
  "sites",
  "page",
  "pages",
  "official",
  "catalog",
]);

interface PublicStyle {
  id: string;
  siteName: string;
  url: string;
  northStar: string;
  colorScheme: string;
  colors: Array<{ name: string; hex: string }>;
  fonts: string[];
  /** Public collection title, such as "fintech websites", when the card came from that page. */
  collection: string;
}

export interface ReferoStyleBody {
  designMd: string;
  siteName: string;
  sourceUrl: string | null;
  northStar: string | null;
  stylePage: string;
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

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/** Paid Refero MCP ids are a hard block. This source has no user-configurable key. */
export function isReferoPaidId(id: string): boolean {
  const raw = id.trim();
  return /^(pro|premium|paid|mcp):/i.test(raw) || /api\.refero\.design/i.test(raw);
}

function styleUuid(id: string): string | null {
  const trimmed = id.trim();
  const fromUrl = /styles\.refero\.design\/style\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(trimmed);
  const candidate = fromUrl?.[1] ?? trimmed;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate.toLowerCase()
    : null;
}

function isStylesHost(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "styles.refero.design";
  } catch {
    return false;
  }
}

function flightText(html: string): string {
  const parts: string[] = [];
  const re = /self\.__next_f\.push\(([\s\S]*?)\)\s*<\/script>/g;
  for (const match of html.matchAll(re)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      if (Array.isArray(data) && typeof data[1] === "string") parts.push(data[1]);
    } catch {
      /* a non-JSON push is not catalog data */
    }
  }
  return parts.join("");
}

function jsonValueAt(text: string, start: number): string | null {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStyle(value: unknown): PublicStyle | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = styleUuid(asString(record.id));
  const siteName = asString(record.siteName);
  if (!id || !siteName) return null;
  const colors = Array.isArray(record.colors)
    ? record.colors.flatMap((color) => {
        if (!color || typeof color !== "object") return [];
        const entry = color as Record<string, unknown>;
        const name = asString(entry.name);
        const hex = asString(entry.hex);
        return name || hex ? [{ name, hex }] : [];
      })
    : [];
  const fonts = Array.isArray(record.fonts) ? record.fonts.map(asString).filter(Boolean) : [];
  return {
    id,
    siteName,
    url: asString(record.url),
    northStar: asString(record.northStar),
    colorScheme: asString(record.colorScheme),
    colors,
    fonts,
    collection: "",
  };
}

function parseStyleObject(raw: string): PublicStyle | null {
  try {
    return normalizeStyle(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * The homepage embeds initialPage.styles. Collection pages inline each card as
 * "style":{"id":...}. Both are public flight data, not the protected /api route.
 */
function stylesFromHtml(html: string): PublicStyle[] {
  const text = flightText(html);
  const found: PublicStyle[] = [];
  const marker = text.indexOf("\"initialPage\":");
  if (marker >= 0) {
    const brace = text.indexOf("{", marker);
    const raw = brace >= 0 ? jsonValueAt(text, brace) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { styles?: unknown[] };
        for (const style of parsed.styles ?? []) {
          const normalized = normalizeStyle(style);
          if (normalized) found.push(normalized);
        }
      } catch {
        /* collection pages use the card shape below */
      }
    }
  }
  const card = "\"style\":{\"id\":";
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf(card, cursor);
    if (at < 0) break;
    const brace = text.indexOf("{", at);
    const raw = brace >= 0 ? jsonValueAt(text, brace) : null;
    if (!raw) break;
    const normalized = parseStyleObject(raw);
    if (normalized) found.push(normalized);
    cursor = at + card.length;
  }
  const byId = new Map<string, PublicStyle>();
  for (const style of found) byId.set(style.id, style);
  return [...byId.values()];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function designMdFromHtml(html: string): string | null {
  const blocks = html.matchAll(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi);
  for (const block of blocks) {
    const text = decodeHtml(block[1] ?? "").trim();
    if (text.length < 200) continue;
    if (!text.startsWith("#")) continue;
    if (!/Style Reference|## Tokens/i.test(text)) continue;
    return text;
  }
  return null;
}

function siteNameFromHtml(html: string, designMd: string): string {
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
  const decoded = title ? decodeHtml(title) : "";
  const fromTitle = decoded.replace(/\s+design system\s*\|.*$/i, "").replace(/\s*\|\s*Refero Styles\s*$/i, "").trim();
  if (fromTitle && !/^refero styles$/i.test(fromTitle)) return fromTitle;
  const heading = /^#\s+(.+?)\s+[—–-]\s+Style Reference/i.exec(designMd)?.[1]?.trim();
  return heading || "Refero Styles";
}

function northStarFromDesignMd(designMd: string): string | null {
  const line = /^>\s*(.+)$/m.exec(designMd)?.[1]?.trim();
  return line || null;
}

function sourceUrlFromHtml(html: string): string | null {
  const text = flightText(html);
  const match = /"url":"(https?:\/\/[^"]+)","siteName":/i.exec(text);
  const url = match?.[1];
  if (!url || url.includes("styles.refero.design") || url.includes("images.refero.design")) return null;
  return url;
}

function blurb(style: PublicStyle): string {
  const colors = style.colors
    .slice(0, 6)
    .map((color) => [color.name, color.hex].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  const fonts = style.fonts.slice(0, 6).join(", ");
  return [
    style.siteName,
    style.northStar,
    style.colorScheme ? `Theme: ${style.colorScheme}.` : "",
    colors ? `Colors: ${colors}.` : "",
    fonts ? `Fonts: ${fonts}.` : "",
    style.collection ? `Collection: ${style.collection}.` : "",
    style.url ? `Source site: ${style.url}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 700);
}

function metaDraft(style: PublicStyle): Draft<string> {
  return {
    sourceId: "refero-styles",
    itemId: style.id,
    title: style.siteName,
    officialUrl: STYLE_PAGE(style.id),
    install: INSTALL,
    kind: "metadata",
    licenseName: "Refero Terms of Use",
    licenseUrl: REFERO_STYLES_TERMS_URL,
    attribution: "Refero Inc. owns this Refero Styles entry. This project does not.",
    termsUrl: REFERO_STYLES_TERMS_URL,
    requiredNotices: NOTICE,
    redistribution: "forbidden",
    content: blurb(style),
    notes: [
      "Public Refero Styles listing only. get_item reads the DESIGN.md on that one public style page.",
      "The paid Refero MCP and https://styles.refero.design/api/ are not called. No Refero token is collected.",
    ],
  };
}

function baseDraft(id: string | null, title: string, officialUrl: string): Omit<Draft<ReferoStyleBody>, "content" | "block"> {
  return {
    sourceId: "refero-styles",
    itemId: id,
    title,
    officialUrl,
    install: INSTALL,
    kind: "docs",
    licenseName: "Refero Terms of Use",
    licenseUrl: REFERO_STYLES_TERMS_URL,
    attribution: "Refero Inc. owns this Refero Styles entry. Third-party marks stay with their owners. This project does not own the catalog.",
    termsUrl: REFERO_STYLES_TERMS_URL,
    requiredNotices: NOTICE,
    redistribution: "forbidden",
  };
}

function blocked(id: string | null, title: string, officialUrl: string, reason: string): Draft<ReferoStyleBody> {
  return {
    ...baseDraft(id, title, officialUrl),
    content: null,
    block: { reason },
    publicFields: {
      paidMcp: PAID_MCP,
      publicCatalog: HOME,
    },
  };
}

function listingUrls(xml: string, query: string): string[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1] ?? "");
  const ranked = locs.flatMap((loc) => {
    if (!isStylesHost(loc)) return [];
    const path = new URL(loc).pathname;
    if (!path.startsWith("/design-styles/") && !path.startsWith("/examples/")) return [];
    const slug = path.split("/").filter(Boolean).pop() ?? "";
    const slugTokens = new Set(slug.split("-").filter(Boolean));
    let total = 0;
    for (const token of tokens) {
      if (slugTokens.has(token)) total += 5;
      else if (slug.includes(token)) total += 2;
    }
    return total > 0 ? [{ loc, total }] : [];
  });
  ranked.sort((a, b) => b.total - a.total);
  return ranked.slice(0, 2).map((entry) => entry.loc);
}

async function publicStyles(net: Net, query: string): Promise<PublicStyle[]> {
  const homeHtml = await net.fetchText(HOME, HOME);
  const homeStyles = stylesFromHtml(homeHtml);
  if (homeStyles.length === 0) {
    throw new UpstreamError(
      "The public Refero Styles homepage did not include a style list. No paid catalog was requested.",
      200,
      HOME,
    );
  }
  let extra: PublicStyle[] = [];
  try {
    const xml = await net.fetchText(COLLECTIONS, HOME);
    const pages = listingUrls(xml, query);
    const groups = await Promise.all(
      pages.map(async (page) => {
        try {
          const html = await net.fetchText(page, page);
          const label = new URL(page).pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? "";
          return stylesFromHtml(html).map((style) => ({ ...style, collection: label }));
        } catch {
          return [];
        }
      }),
    );
    extra = groups.flat();
  } catch {
    extra = [];
  }
  const byId = new Map<string, PublicStyle>();
  for (const style of homeStyles) byId.set(style.id, style);
  for (const style of extra) {
    const existing = byId.get(style.id);
    if (!existing) byId.set(style.id, style);
    else if (!existing.collection && style.collection) byId.set(style.id, { ...existing, collection: style.collection });
  }
  return [...byId.values()];
}

export async function searchReferoStyles(net: Net, query: string, limit: number): Promise<Draft<string>[]> {
  const styles = await publicStyles(net, query);
  return styles
    .map((style) => {
      const hay = [
        style.siteName,
        style.northStar,
        style.url,
        style.colorScheme,
        style.fonts.join(" "),
        style.collection,
        style.colors.map((color) => `${color.name} ${color.hex}`).join(" "),
      ].join(" ");
      return { style, score: score(query, hay) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => metaDraft(row.style));
}

export async function getReferoStyleItem(net: Net, id: string): Promise<Draft<ReferoStyleBody>> {
  const raw = id.trim();
  if (isReferoPaidId(raw)) {
    return blocked(
      null,
      "Refero Styles paid catalog",
      REFERO_STYLES_TERMS_URL,
      `This id asks for paid Refero MCP or API content. That body was not fetched. There is no Refero token on this server, and a missing key is not offered for this catalog. Public pages: ${HOME} Terms: ${REFERO_STYLES_TERMS_URL}`,
    );
  }
  const uuid = styleUuid(raw);
  if (!uuid) {
    return blocked(
      null,
      "Refero Styles",
      HOME,
      `The item id is not a public Refero Styles UUID. No page was fetched. Terms: ${REFERO_STYLES_TERMS_URL}`,
    );
  }
  const officialUrl = STYLE_PAGE(uuid);
  const html = await net.fetchText(officialUrl, officialUrl);
  const designMd = designMdFromHtml(html);
  if (!designMd) {
    const paywalled = /sign in to|upgrade to (?:pro|view)|subscribe to unlock|paid plan required/i.test(html);
    return blocked(
      uuid,
      "Refero Styles",
      officialUrl,
      paywalled
        ? `This style page does not expose a public DESIGN.md body and mentions a paid or signed-in plan. The paid Refero MCP was not called. Terms: ${REFERO_STYLES_TERMS_URL}`
        : `This public style page did not include a DESIGN.md body. The paid Refero MCP was not called. Terms: ${REFERO_STYLES_TERMS_URL}`,
    );
  }
  const siteName = siteNameFromHtml(html, designMd);
  const content: ReferoStyleBody = {
    designMd,
    siteName,
    sourceUrl: sourceUrlFromHtml(html),
    northStar: northStarFromDesignMd(designMd),
    stylePage: officialUrl,
  };
  return {
    ...baseDraft(uuid, siteName, officialUrl),
    content,
    scanText: designMd,
    notes: [
      "DESIGN.md was read from the public style page only. One page, not a catalog mirror.",
      "Paid Refero MCP (https://api.refero.design/mcp) and /api/ routes were not called. Use this as design reference for an end product. Do not republish it as a library or dataset.",
    ],
  };
}
