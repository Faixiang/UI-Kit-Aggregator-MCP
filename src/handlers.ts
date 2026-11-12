import { release } from "./release.js";
import { readEnv } from "./env.js";
import type { EnvConfig } from "./types.js";
import { createNet, UpstreamError, type Net } from "./net.js";
import {
  ACETERNITY_LICENSE,
  ACETERNITY_TERMS_URL,
  ANIME_LICENSE,
  ANIME_TERMS_URL,
  MOTION_PROMPT_LICENSE,
  MOTION_PROMPT_TERMS_URL,
  CULT_UI_LICENSE,
  CULT_UI_TERMS_URL,
  MAGIC_UI_LICENSE,
  MAGIC_UI_PRO_TERMS_URL,
  MAGIC_UI_TERMS_URL,
  MOTIONSITES_SUMMARY,
  MOTIONSITES_TERMS_URL,
  MOTIONSITES_TERMS_URL_EN,
  REACT_BITS_LICENSE,
  REACT_BITS_PRO_SUMMARY,
  REACT_BITS_PRO_TERMS_URL,
  REACT_BITS_TERMS_URL,
  UIVERSE_LICENSE,
  UIVERSE_TERMS_URL,
} from "./compliance/texts.js";
import { classifyUse } from "./compliance/gate.js";
import {
  ACETERNITY_ALL_ACCESS,
  REACT_BITS_PRO_ACCESS,
  TOKEN_FLOW_INSTRUCTION,
  buildTokenRequest,
  tokenAskReason,
  type TokenRequirement,
} from "./compliance/token.js";
import { getAceternityItem, searchAceternity } from "./sources/aceternity.js";
import { getMotionPromptItem, searchMotionPrompt } from "./sources/motion-prompt.js";
import { getCultUiItem, searchCultUi } from "./sources/cult-ui.js";
import { getMagicUiItem, searchMagicUi } from "./sources/magic-ui.js";
import { getAnimeItem, searchAnime } from "./sources/anime.js";
import { getMotionsitesItem, searchMotionsites } from "./sources/motionsites.js";
import { getReactBitsItem, searchReactBits } from "./sources/react-bits.js";
import { getUiverseItem, searchUiverse } from "./sources/uiverse.js";
import { SOURCE_IDS, type Draft, type SourceId } from "./types.js";

export interface Deps {
  env: EnvConfig;
  net: Net;
  fetchImpl: typeof fetch;
}

export function defaultDeps(): Deps {
  const env = readEnv();
  return { env, net: createNet(env), fetchImpl: globalThis.fetch };
}

const SOURCE_INFO = [
  {
    id: "motionsites" as const,
    name: "MotionSites",
    homepage: "https://motionsites.dev/en",
    specialty: "AI website prompt library for conceptual sites such as landing pages, SaaS marketing pages, and portfolios. Choose this for full-page design prompts, not drop-in components.",
    purpose: "Prompt catalog for conceptual websites. Public previews only in this server. Prompt bodies stay on the official plugin/MCP.",
    licenseName: "MotionSites Terms of Service",
    licenseUrl: MOTIONSITES_TERMS_URL,
    alsoSee: MOTIONSITES_TERMS_URL_EN,
    authEnv: [] as string[],
    summary: "Personal, non-transferable license for purchased or member prompts. Previews are public. Prompt text may not be republished, scraped, or mirrored.",
  },
  {
    id: "react-bits" as const,
    name: "React Bits",
    homepage: "https://reactbits.dev",
    specialty: "React animation components: text effects, backgrounds, and UI micro-interactions, in JavaScript or TypeScript with CSS or Tailwind. Choose this for copy-and-paste React components.",
    purpose: "Free animated React components (JS/TS, CSS/Tailwind) from the official shadcn registry, plus public Pro metadata.",
    licenseName: "MIT License + Commons Clause",
    licenseUrl: REACT_BITS_TERMS_URL,
    alsoSee: REACT_BITS_PRO_TERMS_URL,
    authEnv: ["REACTBITS_LICENSE_KEY"],
    summary: "Use in an application, website, or product is allowed. Selling or redistributing the components, tools, or sounds themselves is not. Pro source needs REACTBITS_LICENSE_KEY.",
  },
  {
    id: "uiverse" as const,
    name: "Uiverse",
    homepage: "https://uiverse.io/",
    specialty: "Community HTML, CSS, Tailwind, and React snippets, including hover effects, buttons, and cards. Choose this for small, standalone UI widgets.",
    purpose: "Community HTML/CSS and Tailwind elements. Official site when reachable; otherwise the MIT galaxy mirror.",
    licenseName: "MIT License",
    licenseUrl: UIVERSE_TERMS_URL,
    alsoSee: "https://github.com/uiverse-io/galaxy",
    authEnv: ["GITHUB_TOKEN"],
    summary: "MIT. Keep the copyright notice. Creator and Uiverse.io credit is appreciated, not required. Third-party assets inside a snippet (for example Font Awesome, CC BY 4.0) stay flagged. AI Design Systems are blocked.",
  },
  {
    id: "anime" as const,
    name: "Anime.js",
    homepage: "https://animejs.com",
    specialty: "Lightweight JavaScript animation engine for timelines, easing, and animating DOM, CSS, or SVG elements. Choose this when you need an animation library or its official docs and examples, not a component kit.",
    purpose: "JavaScript animation engine. Official docs and examples.",
    licenseName: "MIT License",
    licenseUrl: ANIME_TERMS_URL,
    alsoSee: "https://github.com/juliangarnier/anime",
    authEnv: [] as string[],
    summary: "MIT. Copyright (c) 2025 Julian Garnier. Install with npm i animejs.",
  },
  {
    id: "aceternity" as const,
    name: "Aceternity UI",
    homepage: "https://ui.aceternity.com",
    specialty: "React and Tailwind component library with advanced visual effects, including 3D, parallax, spotlight, aurora, glow, and shader-based visuals. Choose this for polished, cinematic UI blocks.",
    purpose: "Free Tailwind and Motion components from the official catalog and registry. Premium blocks need an All-Access token.",
    licenseName: "Aceternity License",
    licenseUrl: ACETERNITY_TERMS_URL,
    alsoSee: "https://ui.aceternity.com/installation",
    authEnv: ["ACETERNITY_PRO_TOKEN"],
    summary: "Unlimited personal and commercial end products, including modifications. Do not redistribute the item as source, stock, or a marketplace theme/template.",
  },
  {
    id: "motion-prompt" as const,
    name: "Motion Prompt",
    homepage: "https://showheyohtaki.github.io/motion-prompt/",
    specialty: "Motion vocabulary and prompt library for describing animations, camera moves, and page transitions to AI. Choose this for named effect terms, copyable prompts, and motion demos, not drop-in UI components.",
    purpose: "Named motion, camera, and landing-page effect vocabulary with official copyable prompts and demo specs. Not an installable component kit.",
    licenseName: "MIT License",
    licenseUrl: MOTION_PROMPT_TERMS_URL,
    alsoSee: "https://github.com/showheyohtaki/motion-prompt",
    authEnv: [] as string[],
    summary: "MIT. Copyright (c) 2026 Shohei Ohtaki. Keep the copyright notice. This is a prompt and naming vocabulary, not a drop-in component kit.",
  },
  {
    id: "cult-ui" as const,
    name: "Cult UI",
    homepage: "https://www.cult-ui.com",
    specialty: "Distinctive React / shadcn-style UI components from the official Cult UI registry. Choose this for copy-and-paste Cult components, not a general animation engine.",
    purpose: "Free MIT React and shadcn/ui components from the official Cult UI registry.",
    licenseName: "MIT License",
    licenseUrl: CULT_UI_TERMS_URL,
    alsoSee: "https://github.com/nolly-studio/cult-ui",
    authEnv: [] as string[],
    summary: "MIT. Copyright (c) 2023 Jordan-Gilliam. Keep the copyright notice. Official registry: https://www.cult-ui.com/r/registry.json.",
  },
  {
    id: "magic-ui" as const,
    name: "Magic UI",
    homepage: "https://magicui.design",
    specialty: "Free React and Tailwind animated components (official free / MIT catalog only). Choose this for copy-and-paste Magic UI free blocks; do not use this source for Magic UI Pro.",
    purpose: "Free React and Tailwind animated components from the official Magic UI MIT registry. Magic UI Pro is not indexed or returned.",
    licenseName: "MIT License",
    licenseUrl: MAGIC_UI_TERMS_URL,
    alsoSee: "https://github.com/magicuidesign/magicui",
    authEnv: [] as string[],
    summary: "MIT for the official free catalog only. Copyright (c) Magic UI. Keep the copyright notice. Magic UI Pro is a separate paid license and is not indexed or returned.",
  },
];

export function sourceSpecialtyGuide(): string {
  return SOURCE_INFO.map((source) => `${source.name} (\`${source.id}\`): ${source.specialty}`).join(" ");
}

function errorBody(sourceId: SourceId, error: unknown, officialUrl: string) {
  if (error instanceof UpstreamError) {
    return { sourceId, message: error.message, officialUrl: error.officialUrl, httpStatus: error.httpStatus };
  }
  return {
    sourceId,
    message: error instanceof Error ? error.message : "Unexpected source error",
    officialUrl,
  };
}

export function createHandlers(deps: Deps = defaultDeps()) {
  return {
    listSources() {
      return {
        sources: SOURCE_INFO.map((source) => ({
          ...source,
          compliance: {
            sourceId: source.id,
            itemId: null,
            licenseName: source.licenseName,
            licenseUrl: source.licenseUrl,
            attribution: source.summary,
            status: "allowed" as const,
            reason: "Source profile only. No third-party source code is included.",
            warnings: [],
            requiredNotices: [source.summary],
            termsUrl: source.licenseUrl,
          },
        })),
        note: `Use each source's specialty to pick the right catalog, then call search_ui_kits. Every content payload has already passed the license gate. ${TOKEN_FLOW_INSTRUCTION}`,
      };
    },

    async search(input: { query: string; sources?: SourceId[]; limit?: number; variant?: string }) {
      const limit = input.limit ?? 5;
      const selected = input.sources?.length ? input.sources : [...SOURCE_IDS];
      const only = selected.length === 1 ? selected[0] : undefined;
      const errors: unknown[] = [];
      const hits = [];

      const jobs = selected.map(async (sourceId) => {
        try {
          if (sourceId === "motionsites") {
            return searchMotionsites(input.query, limit, only === "motionsites").map((draft) => release(draft));
          }
          if (sourceId === "react-bits") {
            return (await searchReactBits(deps.net, input.query, limit, input.variant)).map((draft) => release(draft));
          }
          if (sourceId === "uiverse") {
            const result = await searchUiverse(deps.net, input.query, limit, { codeSearch: Boolean(deps.env.githubToken) });
            if (result.error) errors.push(errorBody("uiverse", result.error, "https://github.com/uiverse-io/galaxy"));
            return result.hits.map((draft) => release(draft));
          }
          if (sourceId === "anime") {
            return (await searchAnime(deps.net, input.query, limit)).map((draft) => release(draft));
          }
          if (sourceId === "aceternity") {
            return (await searchAceternity(deps.net, input.query, limit)).map((draft) => release(draft));
          }
          if (sourceId === "motion-prompt") {
            return (await searchMotionPrompt(deps.net, input.query, limit)).map((draft) => release(draft));
          }
          if (sourceId === "cult-ui") {
            return (await searchCultUi(deps.net, input.query, limit)).map((draft) => release(draft));
          }
          if (sourceId === "magic-ui") {
            return (await searchMagicUi(deps.net, input.query, limit)).map((draft) => release(draft));
          }
          return [];
        } catch (error) {
          const official = SOURCE_INFO.find((source) => source.id === sourceId)?.homepage ?? "";
          errors.push(errorBody(sourceId, error, official));
          return [];
        }
      });

      const groups = await Promise.all(jobs);
      for (const group of groups) hits.push(...group);
      return {
        query: input.query,
        sources: selected,
        hits,
        errors,
        note: `Hits are metadata (or a blocked or needs_token decision). Call get_item for one component, doc excerpt, or snippet. The gate runs again there. ${TOKEN_FLOW_INSTRUCTION}`,
      };
    },

    async getItem(input: { source: SourceId; id: string; variant?: string; intendedUse?: string }) {
      try {
        const draft = await loadItem(deps, input.source, input.id, input.variant);
        return release(draft as Draft<unknown>, input.intendedUse);
      } catch (error) {
        const official = SOURCE_INFO.find((source) => source.id === input.source)?.homepage ?? "";
        return {
          sourceId: input.source,
          itemId: input.source === "motionsites" ? null : input.id,
          contentOmitted: true,
          error: errorBody(input.source, error, official),
        };
      }
    },

    getLicense(input: { source: SourceId; itemId?: string }) {
      const bodies: Record<SourceId, { licenseName: string; licenseUrl: string; termsUrl: string; attribution: string; notice: string; redistribution: string }> = {
        motionsites: {
          licenseName: "MotionSites Terms of Service",
          licenseUrl: MOTIONSITES_TERMS_URL,
          termsUrl: MOTIONSITES_TERMS_URL,
          attribution: "Prompt text stays with MotionSites. Output you generate with a third-party tool is yours.",
          notice: `${MOTIONSITES_SUMMARY}\n\nEnglish terms: ${MOTIONSITES_TERMS_URL_EN}`,
          redistribution: "forbidden",
        },
        "react-bits": {
          licenseName: input.itemId?.startsWith("pro:") || input.itemId?.startsWith("starter:")
            ? "React Bits Pro License Agreement"
            : "MIT License + Commons Clause",
          licenseUrl: input.itemId?.startsWith("pro:") || input.itemId?.startsWith("starter:") ? REACT_BITS_PRO_TERMS_URL : REACT_BITS_TERMS_URL,
          termsUrl: input.itemId?.startsWith("pro:") || input.itemId?.startsWith("starter:") ? REACT_BITS_PRO_TERMS_URL : REACT_BITS_TERMS_URL,
          attribution: "Copyright (c) 2026 David Haz",
          notice: input.itemId?.startsWith("pro:") || input.itemId?.startsWith("starter:") ? REACT_BITS_PRO_SUMMARY : REACT_BITS_LICENSE,
          redistribution: "forbidden",
        },
        uiverse: {
          licenseName: "MIT License",
          licenseUrl: UIVERSE_TERMS_URL,
          termsUrl: UIVERSE_TERMS_URL,
          attribution: "Copyright (c) 2023 Uiverse.io",
          notice: UIVERSE_LICENSE,
          redistribution: "allowed",
        },
        anime: {
          licenseName: "MIT License",
          licenseUrl: ANIME_TERMS_URL,
          termsUrl: ANIME_TERMS_URL,
          attribution: "Copyright (c) 2025 Julian Garnier",
          notice: ANIME_LICENSE,
          redistribution: "allowed",
        },
        aceternity: {
          licenseName: "Aceternity License",
          licenseUrl: ACETERNITY_TERMS_URL,
          termsUrl: ACETERNITY_TERMS_URL,
          attribution: "The author retains ownership of the Item.",
          notice: ACETERNITY_LICENSE,
          redistribution: "forbidden",
        },
        "motion-prompt": {
          licenseName: "MIT License",
          licenseUrl: MOTION_PROMPT_TERMS_URL,
          termsUrl: MOTION_PROMPT_TERMS_URL,
          attribution: "Copyright (c) 2026 Shohei Ohtaki",
          notice: MOTION_PROMPT_LICENSE,
          redistribution: "allowed",
        },
        "cult-ui": {
          licenseName: "MIT License",
          licenseUrl: CULT_UI_TERMS_URL,
          termsUrl: CULT_UI_TERMS_URL,
          attribution: "Copyright (c) 2023 Jordan-Gilliam",
          notice: CULT_UI_LICENSE,
          redistribution: "allowed",
        },
        "magic-ui": {
          licenseName: input.itemId && /^(pro|premium|paid):/i.test(input.itemId)
            ? "Magic UI Pro License"
            : "MIT License",
          licenseUrl: input.itemId && /^(pro|premium|paid):/i.test(input.itemId) ? MAGIC_UI_PRO_TERMS_URL : MAGIC_UI_TERMS_URL,
          termsUrl: input.itemId && /^(pro|premium|paid):/i.test(input.itemId) ? MAGIC_UI_PRO_TERMS_URL : MAGIC_UI_TERMS_URL,
          attribution: input.itemId && /^(pro|premium|paid):/i.test(input.itemId)
            ? "Magic UI Pro is a separate paid license from the free MIT catalog."
            : "Copyright (c) Magic UI",
          notice: input.itemId && /^(pro|premium|paid):/i.test(input.itemId)
            ? "Magic UI Pro is a separate paid license (https://pro.magicui.design/license). This server does not index, fetch, or return Pro source."
            : MAGIC_UI_LICENSE,
          redistribution: input.itemId && /^(pro|premium|paid):/i.test(input.itemId) ? "forbidden" : "allowed",
        },
      };
      const body = bodies[input.source];
      const tokenRequirement = licenseTokenRequirement(input.source, input.itemId, deps.env.aceternityProToken, deps.env.reactBitsLicenseKey);
      const hardLocked =
        (input.source === "magic-ui" && Boolean(input.itemId && /^(pro|premium|paid):/i.test(input.itemId))) ||
        (input.source === "motionsites" && input.itemId != null && !["official-access", "official-mcp", "membership"].includes(input.itemId));
      const paidLocked = hardLocked || Boolean(tokenRequirement);
      const itemId = input.source === "motionsites" && hardLocked ? null : (input.itemId ?? null);
      return {
        sourceId: input.source,
        itemId,
        ...body,
        sourceAccess: hardLocked ? "blocked" : tokenRequirement ? "needs_token" : "see get_item",
        sourceAccessReason: hardLocked
          ? "Reading these public terms is allowed. Fetching the protected body is blocked. This is a hard license or catalog block, not a missing-token case."
          : tokenRequirement
            ? tokenAskReason(tokenRequirement, itemId)
            : "get_item applies the same license and returns content only when the gate allows it.",
        ...(tokenRequirement ? { tokenRequest: buildTokenRequest(tokenRequirement) } : {}),
        compliance: {
          sourceId: input.source,
          itemId,
          licenseName: body.licenseName,
          licenseUrl: body.licenseUrl,
          attribution: body.attribution,
          status: "allowed" as const,
          reason: "These are the published terms. This call does not include component or prompt source.",
          warnings: hardLocked
            ? ["Protected source for this item is blocked. The terms text above is public."]
            : tokenRequirement
              ? [tokenAskReason(tokenRequirement, itemId)]
              : [],
          requiredNotices: [body.notice],
          termsUrl: body.termsUrl,
          ...(tokenRequirement ? { tokenRequest: buildTokenRequest(tokenRequirement) } : {}),
        },
      };
    },

    checkCompliance(input: { source: SourceId; itemId?: string; proposedUse: string }) {
      const use = classifyUse(input.proposedUse);
      const license = this.getLicense({ source: input.source, itemId: input.itemId });
      const forbidden = license.redistribution === "forbidden";
      let status: "allowed" | "flagged" | "blocked" = "allowed";
      let reason = "The described use fits an end product under the published terms.";
      const warnings: string[] = [];
      if (input.source === "motionsites" && /prompt (text|body|source)|paste the prompt|republish the prompt/i.test(input.proposedUse)) {
        status = "blocked";
        reason = "MotionSites prompt text cannot be republished, collected, or returned by this server.";
      } else if (forbidden && use === "redistribute") {
        status = "blocked";
        reason = "That use redistributes the kit, template, sounds, or source itself. The license does not allow it.";
      } else if (forbidden && use === "unspecified") {
        status = "flagged";
        reason = "The use is not clearly an end product. Redistribution of the item itself would be blocked.";
        warnings.push("Say whether this is a client/marketing/product site, or a library/template you would publish.");
      } else if (input.source === "uiverse") {
        warnings.push("If the snippet embeds Font Awesome or another third-party asset, get_item will flag it and keep that notice.");
      }
      if (input.source === "react-bits" && /sound/i.test(input.itemId ?? "") && use === "redistribute") {
        status = "blocked";
        reason = "The Commons Clause forbids selling or redistributing React Bits sounds themselves, or offering the sound tools as a hosted service.";
      }
      return {
        sourceId: input.source,
        itemId: license.itemId,
        proposedUse: input.proposedUse,
        useClass: use,
        compliance: {
          sourceId: input.source,
          itemId: license.itemId,
          licenseName: license.licenseName,
          licenseUrl: license.licenseUrl,
          attribution: license.attribution,
          status,
          reason,
          warnings,
          requiredNotices: [license.notice],
          termsUrl: license.termsUrl,
        },
      };
    },
  };
}

function licenseTokenRequirement(
  source: SourceId,
  itemId: string | undefined,
  aceternityProToken: string | undefined,
  reactBitsLicenseKey: string | undefined,
): TokenRequirement | undefined {
  if (source === "aceternity" && itemId?.startsWith("pro:") && !aceternityProToken) {
    return ACETERNITY_ALL_ACCESS;
  }
  if (
    source === "react-bits" &&
    (itemId?.startsWith("pro:") || itemId?.startsWith("starter:")) &&
    !reactBitsLicenseKey
  ) {
    return REACT_BITS_PRO_ACCESS;
  }
  return undefined;
}

async function loadItem(deps: Deps, source: SourceId, id: string, variant?: string) {
  if (source === "motionsites") return getMotionsitesItem(id);
  if (source === "react-bits") return getReactBitsItem(deps.net, deps.env, deps.fetchImpl, id, variant);
  if (source === "uiverse") return getUiverseItem(deps.net, id);
  if (source === "anime") return getAnimeItem(deps.net, id);
  if (source === "aceternity") return getAceternityItem(deps.net, deps.env, deps.fetchImpl, id);
  if (source === "motion-prompt") return getMotionPromptItem(deps.net, id);
  if (source === "cult-ui") return getCultUiItem(deps.net, id);
  if (source === "magic-ui") return getMagicUiItem(deps.net, id);
  throw new Error(`Unknown source: ${source}`);
}

export type Handlers = ReturnType<typeof createHandlers>;
