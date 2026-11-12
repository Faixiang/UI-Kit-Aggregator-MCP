import { UIVERSE_LICENSE, UIVERSE_TERMS_URL } from "../compliance/texts.js";
import { UpstreamError, type Net } from "../net.js";
import type { Draft } from "../types.js";

const SITE = "https://uiverse.io/";
const REPO = "https://github.com/uiverse-io/galaxy";
const TREE = "https://api.github.com/repos/uiverse-io/galaxy/git/trees/main?recursive=1";

const CATEGORIES: Array<{ dir: string; words: string[] }> = [
  { dir: "Buttons", words: ["button", "buttons", "btn"] },
  { dir: "Cards", words: ["card", "cards"] },
  { dir: "Checkboxes", words: ["checkbox", "checkboxes"] },
  { dir: "Forms", words: ["form", "forms", "login"] },
  { dir: "Inputs", words: ["input", "inputs", "field"] },
  { dir: "Notifications", words: ["notification", "notifications", "toast", "alert"] },
  { dir: "Patterns", words: ["pattern", "patterns"] },
  { dir: "Radio-buttons", words: ["radio"] },
  { dir: "Toggle-switches", words: ["toggle", "switch", "switches"] },
  { dir: "Tooltips", words: ["tooltip", "tooltips"] },
  { dir: "loaders", words: ["loader", "loaders", "loading", "spinner"] },
];

const CATEGORY_DIRS = new Set(CATEGORIES.map((category) => category.dir));

interface TreeFile {
  path: string;
}

function attribution(): string {
  return "Copyright (c) 2023 Uiverse.io. MIT License. Attribution to the element creator and Uiverse.io is appreciated, not required. Keep the MIT notice.";
}

function baseDraft<T>(partial: Omit<Draft<T>, "sourceId" | "licenseName" | "licenseUrl" | "attribution" | "termsUrl" | "requiredNotices" | "redistribution"> & { requiredNotices?: string[]; licenseName?: string | null }): Draft<T> {
  return {
    sourceId: "uiverse",
    licenseName: partial.licenseName === undefined ? "MIT License" : partial.licenseName,
    licenseUrl: UIVERSE_TERMS_URL,
    attribution: attribution(),
    termsUrl: UIVERSE_TERMS_URL,
    requiredNotices: partial.requiredNotices ?? [UIVERSE_LICENSE],
    redistribution: "allowed",
    ...partial,
  };
}

function blockedDesignSystems(): Draft<string | null> {
  return baseDraft({
    itemId: "ai-design-systems",
    title: "Uiverse AI Design Systems",
    officialUrl: SITE,
    install: "Not available through this server.",
    kind: "metadata",
    content: null,
    block: {
      reason:
        "Uiverse AI Design Systems are a separate paid product, not the MIT community elements in uiverse-io/galaxy. Source was omitted. See https://uiverse.io/.",
    },
    notes: ["Community HTML/CSS elements from the galaxy mirror are a different catalog and stay on the MIT license."],
  });
}

function safePath(id: string): string | null {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.html$/.test(id)) return null;
  const dir = id.split("/")[0];
  if (!dir || !CATEGORY_DIRS.has(dir)) return null;
  return id;
}

function previewUrl(path: string): string {
  const file = path.split("/")[1] ?? "";
  const match = /^([^_]+)_(.+)\.html$/.exec(file);
  if (!match?.[1] || !match[2]) return SITE;
  return `https://uiverse.io/${match[1]}/${match[2]}`;
}

async function listFiles(net: Net): Promise<TreeFile[]> {
  const payload = await net.fetchJson<{ truncated?: boolean; tree?: Array<{ path?: string; type?: string }> }>(
    TREE,
    REPO,
    { github: true, timeoutMs: 30_000 },
  );
  const files: TreeFile[] = [];
  for (const node of payload.tree ?? []) {
    if (node.type !== "blob" || !node.path?.endsWith(".html")) continue;
    const dir = node.path.split("/")[0];
    if (!dir || !CATEGORY_DIRS.has(dir)) continue;
    files.push({ path: node.path });
  }
  return files;
}

function categoryHits(query: string): string[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const dirs = new Set<string>();
  for (const category of CATEGORIES) {
    if (category.words.some((word) => tokens.includes(word) || query.toLowerCase().includes(word))) {
      dirs.add(category.dir);
    }
  }
  return [...dirs];
}

export async function searchUiverse(
  net: Net,
  query: string,
  limit: number,
  options?: { codeSearch?: boolean },
): Promise<{ hits: Array<Draft<string | null>>; error?: UpstreamError }> {
  if (/\bai design systems?\b/i.test(query)) {
    return { hits: [blockedDesignSystems()] };
  }
  const dirs = categoryHits(query);
  try {
    const codeHits = options?.codeSearch ? await searchCode(net, query, limit) : [];
    if (codeHits.length > 0) {
      return { hits: codeHits.map((path) => fileHit(path, "Matched via GitHub code search over uiverse-io/galaxy (MIT). The mirror can lag the website.")) };
    }
    const files = await listFiles(net);
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
    const ranked = files
      .map((file) => {
        const path = file.path.toLowerCase();
        let score = 0;
        if (dirs.some((dir) => file.path.startsWith(`${dir}/`))) score += 5;
        for (const token of tokens) if (path.includes(token)) score += 2;
        return { file, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    if (ranked.length === 0 && dirs.length > 0) {
      const fallback = files.filter((file) => dirs.some((dir) => file.path.startsWith(`${dir}/`))).slice(0, limit);
      return {
        hits: fallback.map((file) =>
          fileHit(
            file.path,
            "Filename on the galaxy mirror is author plus a random slug, not a description. Pass GITHUB_TOKEN to search tags inside the HTML comments. The mirror may be stale relative to uiverse.io.",
          ),
        ),
      };
    }
    return {
      hits: ranked.map((row) =>
        fileHit(row.file.path, "Path match on the MIT-licensed galaxy mirror. Confirm the element on uiverse.io when the site is reachable. The mirror may be stale."),
      ),
    };
  } catch (error) {
    if (dirs.length === 0) {
      return { hits: [], error: error instanceof UpstreamError ? error : new UpstreamError("Uiverse galaxy index failed.", undefined, REPO) };
    }
    return {
      hits: dirs.slice(0, limit).map((dir) =>
        baseDraft({
          itemId: `category:${dir}`,
          title: `Uiverse ${dir}`,
          officialUrl: `${REPO}/tree/main/${dir}`,
          install: "Pick one HTML file from that folder and call get_item with its path. Do not vendor the whole folder as a component pack.",
          kind: "metadata",
          content: `Category index only. The galaxy git tree could not be listed (${error instanceof Error ? error.message : "upstream error"}). Browse ${REPO}/tree/main/${dir} or ${SITE}.`,
          notes: ["uiverse.io often answers automated clients with HTTP 403. This server does not try to bypass that."],
        }),
      ),
      error: error instanceof UpstreamError ? error : undefined,
    };
  }
}

async function searchCode(net: Net, query: string, limit: number): Promise<string[]> {
  const q = `${query} repo:uiverse-io/galaxy extension:html`;
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=${limit}`;
  try {
    const payload = await net.fetchJson<{ items?: Array<{ path?: string }> }>(url, REPO, { github: true });
    return (payload.items ?? []).map((item) => item.path).filter((path): path is string => !!path && !!safePath(path));
  } catch {
    return [];
  }
}

function fileHit(path: string, blurb: string): Draft<string> {
  return baseDraft({
    itemId: path,
    title: path,
    officialUrl: previewUrl(path),
    install: "Copy the HTML into the end product and keep the MIT copyright notice. Creator credit is appreciated.",
    kind: "metadata",
    content: blurb,
    notes: [
      `GitHub file: ${REPO}/blob/main/${path}`,
      "Paid Uiverse AI Design Systems are not part of this catalog.",
    ],
  });
}

export interface UiverseFile {
  path: string;
  html: string;
  creator: string | null;
  tags: string[];
  githubUrl: string;
  previewUrl: string;
}

export async function getUiverseItem(net: Net, id: string): Promise<Draft<UiverseFile | null>> {
  if (id === "ai-design-systems" || /\bai design systems?\b/i.test(id)) {
    return blockedDesignSystems() as Draft<UiverseFile | null>;
  }
  if (id.startsWith("category:")) {
    return baseDraft({
      itemId: id,
      title: id,
      officialUrl: REPO,
      install: "Search again for a file path, then get_item that path.",
      kind: "metadata",
      content: null,
      block: { reason: "That id is a category, not one MIT element. Content was omitted. Search uiverse for a file path." },
    });
  }
  const path = safePath(id);
  if (!path) {
    return baseDraft({
      itemId: null,
      title: "Uiverse item",
      officialUrl: SITE,
      install: "Use a galaxy path such as Tooltips/Author_slug.html from search_ui_kits.",
      kind: "source",
      licenseName: null,
      content: null,
      block: {
        reason:
          "The id is not a documented uiverse-io/galaxy HTML element, so the license cannot be tied to the MIT galaxy LICENSE. Content was omitted.",
      },
    });
  }
  const rawUrl = `https://raw.githubusercontent.com/uiverse-io/galaxy/main/${path}`;
  const html = await net.fetchText(rawUrl, `${REPO}/blob/main/${path}`);
  const header = /<!--\s*From Uiverse\.io by\s+(.+?)\s+-\s+Tags:\s*([\s\S]*?)-->/i.exec(html);
  const creator = header?.[1]?.trim() ?? null;
  const tags = header?.[2]?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
  const file: UiverseFile = {
    path,
    html,
    creator,
    tags,
    githubUrl: `${REPO}/blob/main/${path}`,
    previewUrl: previewUrl(path),
  };
  return baseDraft({
    itemId: path,
    title: path,
    officialUrl: file.previewUrl,
    install: "Paste this HTML/CSS into the end product. Keep the MIT notice and any third-party notice already in the file.",
    kind: "source",
    content: file,
    scanText: html,
    notes: [
      creator ? `Creator on the file: ${creator}. Credit is appreciated, not required by MIT.` : "No creator header was parsed. MIT notice is still required.",
      "The galaxy mirror may be stale (last widely noted update around 2024-09). Prefer the element page on uiverse.io when it loads.",
      `Source file: ${file.githubUrl}`,
    ],
  });
}

