import {
  MOTIONSITES_SUMMARY,
  MOTIONSITES_TERMS_URL,
  MOTIONSITES_TERMS_URL_EN,
} from "../compliance/texts.js";
import type { Draft } from "../types.js";

const PLUGIN = "/plugin marketplace add kvalen-code/Motionsites-Dev";
const MCP_ENDPOINT = "https://motionsites.ai/api/mcp";
const MCP_DOCS = "https://motionsites.ai/mcp";

const NOTICE = [
  MOTIONSITES_SUMMARY,
  "Do not paste prompt bodies into a public repository or into this tool's responses.",
].join("\n\n");

interface Entry {
  id: string;
  title: string;
  blurb: string;
  officialUrl: string;
  install: string;
  haystack: string;
}

const ENTRIES: Entry[] = [
  {
    id: "official-access",
    title: "MotionSites official catalog access",
    blurb:
      "Public previews (screenshots, video, descriptions) are on motionsites.dev. Full prompt bodies stay locked until purchase or membership. This server does not scrape, cache, or return prompt text. After you have official access, connect MotionSites' own plugin or MCP and let that server read prompts for your account.",
    officialUrl: "https://motionsites.dev/en",
    install: PLUGIN,
    haystack: "motionsites prompt landing saas portfolio hero pricing testimonial section website membership catalog preview",
  },
  {
    id: "official-mcp",
    title: "MotionSites official MCP",
    blurb:
      "Official hosted MCP at https://motionsites.ai/api/mcp. Sign in with your MotionSites account. Free accounts can open a limited number of prompts; paid plans unlock the catalog. This aggregator does not proxy that endpoint and does not accept a MotionSites password.",
    officialUrl: MCP_DOCS,
    install: `MCP endpoint: ${MCP_ENDPOINT}`,
    haystack: "mcp plugin claude cursor agent motionsites connect official",
  },
  {
    id: "membership",
    title: "MotionSites membership",
    blurb:
      "Membership is what unlocks prompt bodies on the official site. This server cannot unlock them. Plans are listed on the membership page.",
    officialUrl: "https://motionsites.dev/en/membership",
    install: PLUGIN,
    haystack: "membership pricing plan purchase unlock member prompts",
  },
];

const PUBLIC = {
  plugin: PLUGIN,
  mcpEndpoint: MCP_ENDPOINT,
  mcpDocs: MCP_DOCS,
  catalog: "https://motionsites.dev/en",
  terms: [MOTIONSITES_TERMS_URL, MOTIONSITES_TERMS_URL_EN],
};

function draftFrom(entry: Entry, kind: "metadata"): Draft<string> {
  return {
    sourceId: "motionsites",
    itemId: entry.id,
    title: entry.title,
    officialUrl: entry.officialUrl,
    install: entry.install,
    kind,
    licenseName: "MotionSites Terms of Service",
    licenseUrl: MOTIONSITES_TERMS_URL,
    attribution:
      "MotionSites prompt text is licensed personally and is not transferable. Previews are public. This response is a pointer to the official site, not a prompt.",
    termsUrl: MOTIONSITES_TERMS_URL,
    requiredNotices: [NOTICE],
    redistribution: "forbidden",
    content: entry.blurb,
    notes: [
      "Prompt bodies are blocked even if you already bought them. Use the official plugin or MCP with your own account.",
      `Also see ${MOTIONSITES_TERMS_URL_EN}`,
    ],
    publicFields: PUBLIC,
  };
}

function score(query: string, haystack: string): number {
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(q)) return 5 + q.length;
  let total = 0;
  for (const token of q.split(/[^a-z0-9]+/).filter((token) => token.length > 2)) {
    if (h.includes(token)) total += 2;
  }
  return total;
}

export function searchMotionsites(query: string, limit: number, onlyThisSource: boolean): Draft<string>[] {
  const ranked = ENTRIES.map((entry) => ({ entry, score: score(query, `${entry.title} ${entry.haystack}`) }))
    .filter((row) => row.score > 0 || onlyThisSource)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked.map((row) => draftFrom(row.entry, "metadata"));
}

export function getMotionsitesItem(id: string): Draft<string> {
  const entry = ENTRIES.find((item) => item.id === id);
  if (entry) return draftFrom(entry, "metadata");
  return {
    sourceId: "motionsites",
    itemId: id,
    title: "MotionSites prompt body",
    officialUrl: "https://motionsites.dev/en",
    install: PLUGIN,
    kind: "prompt",
    licenseName: "MotionSites Terms of Service",
    licenseUrl: MOTIONSITES_TERMS_URL,
    attribution: "Prompt text is not owned by the buyer and may not be republished.",
    termsUrl: MOTIONSITES_TERMS_URL,
    requiredNotices: [NOTICE],
    redistribution: "forbidden",
    content: null,
    block: {
      reason:
        "Prompt bodies are locked until purchase or membership, and the terms forbid scraping, bulk download, mirroring, and republishing prompt text. This server does not return them. Connect the official plugin (`/plugin marketplace add kvalen-code/Motionsites-Dev`) or the official MCP at https://motionsites.ai/api/mcp with your own account. Terms: https://motionsites.dev/terms-of-service/zh and https://motionsites.ai/terms",
    },
    notes: ["The requested id was not echoed, so a prompt pasted into the id cannot leak back out."],
    publicFields: PUBLIC,
  };
}
