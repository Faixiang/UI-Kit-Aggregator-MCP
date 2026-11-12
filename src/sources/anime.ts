import { ANIME_LICENSE, ANIME_TERMS_URL } from "../compliance/texts.js";
import type { Net } from "../net.js";
import type { Draft } from "../types.js";

const DOCS = "https://animejs.com/documentation/";
const REPO = "https://github.com/juliangarnier/anime";
const EXAMPLES = "https://api.github.com/repos/juliangarnier/anime/contents/examples?ref=master";

interface DocPage {
  id: string;
  title: string;
  url: string;
}

interface ExampleEntry {
  name: string;
}

function decode(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function docsDraft(page: DocPage, blurb: string): Draft<string> {
  return {
    sourceId: "anime",
    itemId: `docs:${page.id}`,
    title: page.title,
    officialUrl: page.url,
    install: "npm i animejs\nimport { animate } from 'animejs';",
    kind: "metadata",
    licenseName: "MIT License",
    licenseUrl: ANIME_TERMS_URL,
    attribution: "Copyright (c) 2025 Julian Garnier",
    termsUrl: ANIME_TERMS_URL,
    requiredNotices: [ANIME_LICENSE],
    redistribution: "allowed",
    content: blurb,
    notes: ["Official documentation page. get_item returns an excerpt and the code samples published on that page."],
  };
}

async function docIndex(net: Net): Promise<DocPage[]> {
  const html = await net.fetchText(DOCS, DOCS);
  const pages = new Map<string, DocPage>();
  const re = /<a[^>]+href="(https:\/\/animejs\.com\/documentation\/([^"#]+))"[^>]*>([^<]+)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const url = match[1];
    const id = match[2]?.replace(/\/$/, "");
    const title = decode(match[3] ?? "").trim();
    if (!url || !id || !title) continue;
    if (!pages.has(id)) pages.set(id, { id, title, url });
  }
  return [...pages.values()];
}

async function exampleIndex(net: Net): Promise<ExampleEntry[]> {
  const payload = await net.fetchJson<Array<{ name?: string; type?: string }>>(EXAMPLES, `${REPO}/tree/master/examples`, {
    github: true,
  });
  return payload.filter((entry) => entry.type === "dir" && entry.name && entry.name !== "assets").map((entry) => ({ name: entry.name as string }));
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

export async function searchAnime(net: Net, query: string, limit: number): Promise<Draft<string>[]> {
  const [docs, examples] = await Promise.all([docIndex(net), exampleIndex(net).catch(() => [] as ExampleEntry[])]);
  const hits: Array<{ score: number; draft: Draft<string> }> = [];
  for (const page of docs) {
    const value = score(query, `${page.title} ${page.id}`);
    if (value > 0) {
      hits.push({
        score: value,
        draft: docsDraft(page, `${page.title} — official Anime.js documentation.`),
      });
    }
  }
  for (const example of examples) {
    const value = score(query, example.name);
    if (value > 0) {
      hits.push({
        score: value + 1,
        draft: {
          sourceId: "anime",
          itemId: `example:${example.name}`,
          title: `Example: ${example.name}`,
          officialUrl: `${REPO}/tree/master/examples/${example.name}`,
          install: "npm i animejs\nimport { animate } from 'animejs';",
          kind: "metadata",
          licenseName: "MIT License",
          licenseUrl: ANIME_TERMS_URL,
          attribution: "Copyright (c) 2025 Julian Garnier",
          termsUrl: ANIME_TERMS_URL,
          requiredNotices: [ANIME_LICENSE],
          redistribution: "allowed",
          content: `Official example in juliangarnier/anime under the MIT license. get_item fetches index.js from that folder.`,
        },
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map((hit) => hit.draft);
}

export interface AnimeDoc {
  url: string;
  title: string;
  excerpt: string;
  examples: Array<{ code: string }>;
}

export interface AnimeExample {
  name: string;
  files: Array<{ path: string; content: string }>;
  repoUrl: string;
}

function safeDocsId(id: string): string | null {
  const path = id.replace(/^docs:/, "").replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9/-]+$/.test(path) || path.includes("..")) return null;
  return path;
}

function safeExample(id: string): string | null {
  const name = id.replace(/^example:/, "");
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  return name;
}

function excerptFromHtml(html: string): AnimeDoc {
  const title = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim();
  const examples: Array<{ code: string }> = [];
  const codeRe = /<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>/gi;
  for (const match of html.matchAll(codeRe)) {
    if (examples.length >= 3) break;
    const code = decode(match[1] ?? "").replace(/^\n/, "").trim();
    if (code) examples.push({ code: code.slice(0, 4000) });
  }
  const withoutCode = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<pre[\s\S]*?<\/pre>/gi, " ");
  const text = decode(withoutCode.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 3500);
  return { url: "", title, excerpt: text, examples };
}

export async function getAnimeItem(net: Net, id: string): Promise<Draft<AnimeDoc | AnimeExample>> {
  if (id.startsWith("example:") || (!id.startsWith("docs:") && /^[a-z0-9-]+$/.test(id))) {
    const name = safeExample(id);
    if (!name) return unclear(id);
    const files: Array<{ path: string; content: string }> = [];
    for (const file of ["index.js", "index.html"]) {
      const url = `https://raw.githubusercontent.com/juliangarnier/anime/master/examples/${name}/${file}`;
      try {
        const content = await net.fetchText(url, `${REPO}/tree/master/examples/${name}`);
        files.push({ path: `examples/${name}/${file}`, content });
      } catch {
        /* the other file may exist */
      }
    }
    if (files.length === 0) return unclear(id);
    const example: AnimeExample = { name, files, repoUrl: `${REPO}/tree/master/examples/${name}` };
    return {
      sourceId: "anime",
      itemId: `example:${name}`,
      title: `Example: ${name}`,
      officialUrl: example.repoUrl,
      install: "npm i animejs\nimport { animate } from 'animejs';",
      kind: "docs",
      licenseName: "MIT License",
      licenseUrl: ANIME_TERMS_URL,
      attribution: "Copyright (c) 2025 Julian Garnier",
      termsUrl: ANIME_TERMS_URL,
      requiredNotices: [ANIME_LICENSE],
      redistribution: "allowed",
      content: example,
      scanText: files.map((file) => file.content).join("\n"),
      notes: ["Fetched from the official juliangarnier/anime repository. Include the MIT notice with any copy you keep."],
    };
  }

  const path = safeDocsId(id.startsWith("docs:") ? id : `docs:${id}`);
  if (!path) return unclear(id);
  const url = `https://animejs.com/documentation/${path}`;
  const html = await net.fetchText(url, url);
  const doc = excerptFromHtml(html);
  doc.url = url;
  if (!doc.excerpt && doc.examples.length === 0) return unclear(id);
  return {
    sourceId: "anime",
    itemId: `docs:${path}`,
    title: doc.title || path,
    officialUrl: url,
    install: "npm i animejs\nimport { animate } from 'animejs';",
    kind: "docs",
    licenseName: "MIT License",
    licenseUrl: ANIME_TERMS_URL,
    attribution: "Copyright (c) 2025 Julian Garnier",
    termsUrl: ANIME_TERMS_URL,
    requiredNotices: [ANIME_LICENSE],
    redistribution: "allowed",
    content: doc,
    scanText: `${doc.excerpt}\n${doc.examples.map((example) => example.code).join("\n")}`,
    notes: ["Excerpt and code samples are taken from the official documentation page, not rewritten."],
  };
}

function unclear(id: string): Draft<AnimeDoc> {
  return {
    sourceId: "anime",
    itemId: null,
    title: "Anime.js item",
    officialUrl: DOCS,
    install: "npm i animejs",
    kind: "docs",
    licenseName: null,
    licenseUrl: ANIME_TERMS_URL,
    attribution: "Copyright (c) 2025 Julian Garnier",
    termsUrl: ANIME_TERMS_URL,
    requiredNotices: [ANIME_LICENSE],
    redistribution: "allowed",
    content: null,
    block: {
      reason: `No official Anime.js document or example matched that id. Nothing was invented. Start at ${DOCS}`,
    },
  };
}
