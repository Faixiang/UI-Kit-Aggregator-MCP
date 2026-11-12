import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createHandlers, sourceSpecialtyGuide, type Deps } from "./handlers.js";
import { TOKEN_FLOW_INSTRUCTION } from "./compliance/token.js";
import { SOURCE_IDS, type SourceId } from "./types.js";

const sourceEnum = z.enum(SOURCE_IDS);
const variantEnum = z.enum(["TS-TW", "TS-CSS", "JS-TW", "JS-CSS", "TS", "JS"]);
const specialties = sourceSpecialtyGuide();
const sourceIdHelp =
  "Limit to these source ids. Default: all eight. motionsites: AI website prompts for landing pages, SaaS, and portfolios; react-bits: React animation components, text effects, and micro-interactions; uiverse: community HTML/CSS/Tailwind/React snippets such as hover effects, buttons, and cards; anime: lightweight JS animation engine for timelines, easing, and any-element animation; aceternity: React/Tailwind components with advanced 3D, parallax, spotlight, aurora, glow, and shader effects; motion-prompt: motion vocabulary and copyable prompts for describing animations, camera moves, and page transitions to AI, not drop-in UI components; cult-ui: distinctive React / shadcn-style UI components from the official Cult UI registry, for copy-and-paste Cult components, not a general animation engine; magic-ui: free React and Tailwind animated components from the official Magic UI MIT catalog only, not Magic UI Pro.";

function textResult(data: unknown, isError = false) {
  return {
    isError,
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createMcpServer(deps?: Deps): McpServer {
  const handlers = createHandlers(deps);
  const server = new McpServer(
    { name: "ui-kit-aggregator-mcp", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: TOKEN_FLOW_INSTRUCTION },
  );

  server.registerTool(
    "list_sources",
    {
      title: "List UI sources",
      description:
        `List the eight animation/UI sources with each site's specialty, license summary, and which environment variables unlock paid official registries. Use the specialties to pick a source: ${specialties} Does not return component source or MotionSites prompt text. ${TOKEN_FLOW_INSTRUCTION}`,
      annotations: { readOnlyHint: true },
    },
    async () => textResult(handlers.listSources()),
  );

  server.registerTool(
    "search_ui_kits",
    {
      title: "Search UI kits",
      description:
        `One-shot search across MotionSites, React Bits, Uiverse, Anime.js, Aceternity UI, Motion Prompt, Cult UI, and Magic UI. Pick a source by specialty: ${specialties} Each hit already passed the license gate and includes compliance, a short blurb, the official URL, and install/use instructions. Filter with sources. This does not return full source; call get_item for one allowed item. ${TOKEN_FLOW_INSTRUCTION}`,
      inputSchema: {
        query: z.string().min(1).describe("What you are building or the component you need, in plain language."),
        sources: z.array(sourceEnum).optional().describe(sourceIdHelp),
        limit: z.number().int().min(1).max(10).optional().describe("Maximum hits per source. Default 5."),
        variant: variantEnum.optional().describe("React Bits code variant. Default prefers TS-TW."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const payload = await handlers.search({
        query: args.query,
        sources: args.sources as SourceId[] | undefined,
        limit: args.limit,
        variant: args.variant,
      });
      return textResult(payload);
    },
  );

  server.registerTool(
    "get_item",
    {
      title: "Get one gated item",
      description:
        `Fetch one official doc excerpt, example, or component source after the license gate. Choose the source by specialty: ${specialties} If the required token or key is already configured, the fetch proceeds when the license otherwise allows it. If the item requires a token or key that is not configured, status is "needs_token" (not "blocked"): the body is omitted and you must tell the user this content needs a token, name the product and env var, and ask whether to configure/add the token or skip the item. Only retry after the user confirms and the token is in place; if they skip, stop and do not fetch. Hard license blocks stay "blocked" with the body omitted: unclear licenses, disallowed scrape or prompt types, MotionSites prompt bodies, Magic UI Pro and other paid catalogs this server does not support. Magic UI Pro is not a missing-token case — do not offer to add a token. Pass intendedUse when the use might be redistribution rather than an end product. ${TOKEN_FLOW_INSTRUCTION}`,
      inputSchema: {
        source: sourceEnum.describe(sourceIdHelp),
        id: z.string().min(1).describe("Item id from search_ui_kits."),
        variant: variantEnum.optional().describe("React Bits variant override."),
        intendedUse: z.string().optional().describe("Example: 'client marketing site' or 'republish as a component library'."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const payload = await handlers.getItem({
        source: args.source,
        id: args.id,
        variant: args.variant,
        intendedUse: args.intendedUse,
      });
      const failed = payload && typeof payload === "object" && "error" in payload;
      return textResult(payload, Boolean(failed));
    },
  );

  server.registerTool(
    "get_license",
    {
      title: "Get license terms",
      description:
        `Read the license name, URL, attribution, and notice for a source without fetching component or prompt source. Specialties: ${specialties} Use this before copying anything into a repository. If a listed item would need a token that is not configured, sourceAccess is "needs_token" and asks configure-or-skip; Magic UI Pro and similar unsupported catalogs stay blocked. ${TOKEN_FLOW_INSTRUCTION}`,
      inputSchema: {
        source: sourceEnum.describe(sourceIdHelp),
        itemId: z.string().optional().describe("Optional item id. Pro/starter ids select the paid license text."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => textResult(handlers.getLicense({ source: args.source, itemId: args.itemId })),
  );

  server.registerTool(
    "check_compliance",
    {
      title: "Check a proposed use",
      description:
        `Decide whether a proposed use is allowed for a chosen source. Specialties: ${specialties} End products (a client marketing site, an app, a website) are treated differently from republishing the kit as a component library, template pack, or marketplace product. Does not return source. This tool judges the proposed use, not a missing token. ${TOKEN_FLOW_INSTRUCTION}`,
      inputSchema: {
        source: sourceEnum.describe(sourceIdHelp),
        itemId: z.string().optional(),
        proposedUse: z.string().min(1).describe("How the material would be used."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => textResult(handlers.checkCompliance(args)),
  );

  return server;
}
