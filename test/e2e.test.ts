import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = "SECRET_PROMPT_BODY_DO_NOT_LEAK";

interface ToolPayload {
  compliance?: {
    status?: string;
    reason?: string;
    attribution?: string;
    requiredNotices?: string[];
    termsUrl?: string;
    licenseName?: string;
  };
  content?: unknown;
  title?: string;
  officialUrl?: string;
  itemId?: string | null;
  hits?: Array<{ itemId?: string; compliance?: { status?: string }; officialUrl?: string; title?: string }>;
  sources?: unknown[];
  error?: { message?: string; officialUrl?: string };
}

function textOf(result: { content?: unknown }): string {
  const parts = Array.isArray(result.content) ? result.content : [];
  return parts.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : "")).join("\n");
}

function parse(result: { content?: unknown }): ToolPayload {
  return JSON.parse(textOf(result)) as ToolPayload;
}

/**
 * The stdio child starts with a minimal env. Copy proxy and CA settings from
 * this process so live official catalogs remain reachable (some hosts reset
 * connections without the sandbox egress tunnel).
 */
function networkEnv(): Record<string, string> {
  const keep = new Set([
    "NODE_USE_SYSTEM_CA",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
    "ALL_PROXY",
    "all_proxy",
    "SAND_HTTP_PROXY_NAME",
  ]);
  const copied: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (keep.has(key) || key.startsWith("SAND_EGRESS_")) copied[key] = value;
  }
  return copied;
}


function isNetworkMiss(payload: ToolPayload): boolean {
  const blob = JSON.stringify(payload);
  const unreachable = /Could not reach|fetch failed|ECONNRESET|ETIMEDOUT/i.test(blob);
  if (!unreachable) return false;
  if (payload.hits) return (payload.hits.length ?? 0) === 0;
  return payload.compliance?.status == null;
}

async function callToolStable(
  client: Client,
  request: { name: string; arguments: Record<string, unknown> },
  attempts = 4,
): Promise<ToolPayload> {
  let last: ToolPayload | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = parse(await client.callTool(request));
    if (!isNetworkMiss(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return last as ToolPayload;
}

test("live stdio server gates real official content", { timeout: 180_000 }, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, "src/index.ts")],
    cwd: root,
    stderr: "pipe",
    env: {
      ...getDefaultEnvironment(),
      ...networkEnv(),
      ACETERNITY_PRO_TOKEN: "",
      REACTBITS_LICENSE_KEY: "",
      GITHUB_TOKEN: "",
    },
  });
  const stderr: string[] = [];
  transport.stderr?.on("data", (chunk) => {
    stderr.push(String(chunk));
  });
  const client = new Client({ name: "ui-kit-aggregator-e2e", version: "0.1.0" });
  await client.connect(transport);

  const report: Array<Record<string, unknown>> = [];
  const record = (label: string, payload: ToolPayload) => {
    const serialized = payload.content === undefined ? 0 : JSON.stringify(payload.content).length;
    report.push({
      call: label,
      status: payload.compliance?.status ?? (payload.hits ? "search" : "error"),
      hasContent: payload.content !== undefined,
      contentBytes: serialized,
      title: payload.title ?? null,
      officialUrl: payload.officialUrl ?? null,
      licenseName: payload.compliance?.licenseName ?? null,
      reason: payload.compliance?.reason?.slice(0, 220) ?? payload.error?.message ?? null,
      hitCount: payload.hits?.length ?? null,
    });
  };

  try {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(toolNames, ["check_compliance", "get_item", "get_license", "list_sources", "search_ui_kits"]);

    const sources = await callToolStable(client, { name: "list_sources", arguments: {} });
    assert.equal(sources.sources?.length, 9);
    report.push({ call: "list_sources", status: "allowed", sources: 9 });

    const search = await callToolStable(client, {
      name: "search_ui_kits",
      arguments: { query: "bento grid", sources: ["aceternity"], limit: 3 },
    });
    record("search_ui_kits aceternity bento grid", search);
    assert.ok((search.hits?.length ?? 0) >= 1, "search should return a free Aceternity hit");
    assert.equal(search.hits?.[0]?.compliance?.status, "allowed");
    assert.match(search.hits?.[0]?.officialUrl ?? "", /ui\.aceternity\.com/);

    const bento = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "aceternity", id: "bento-grid", intendedUse: "use this in a client marketing site" },
    });
    record("get_item aceternity bento-grid", bento);

    const anime = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "anime", id: "docs:getting-started/installation", intendedUse: "use this in a client marketing site" },
    });
    record("get_item anime installation docs", anime);

    const bitsSearch = await callToolStable(client, {
      name: "search_ui_kits",
      arguments: { query: "split text", sources: ["react-bits"], limit: 3 },
    });
    record("search_ui_kits react-bits split text", bitsSearch);
    const freeHit = bitsSearch.hits?.find((hit) => hit.itemId && !hit.itemId.startsWith("pro:") && !hit.itemId.startsWith("starter:"));
    let bits: ToolPayload | undefined;
    if (freeHit?.itemId) {
      bits = await callToolStable(client, {
        name: "get_item",
        arguments: { source: "react-bits", id: freeHit.itemId, intendedUse: "use this in a client marketing site" },
      });
      record(`get_item react-bits ${freeHit.itemId}`, bits);
    }


    const motionSearch = await callToolStable(client, {
      name: "search_ui_kits",
      arguments: { query: "pop-in", sources: ["motion-prompt"], limit: 3 },
    });
    record("search_ui_kits motion-prompt pop-in", motionSearch);
    assert.ok((motionSearch.hits?.length ?? 0) >= 1, "search should return a Motion Prompt hit");
    assert.equal(motionSearch.hits?.[0]?.compliance?.status, "allowed");
    assert.match(motionSearch.hits?.[0]?.officialUrl ?? "", /showheyohtaki\.github\.io\/motion-prompt/);

    const motionItem = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "motion-prompt", id: motionSearch.hits?.[0]?.itemId ?? "001", intendedUse: "use this in a client marketing site" },
    });
    record("get_item motion-prompt", motionItem);
    assert.equal(motionItem.compliance?.status, "allowed");
    assert.ok(motionItem.content !== undefined, "Motion Prompt get_item should return catalog/prompt content");
    assert.match(motionItem.officialUrl ?? "", /showheyohtaki\.github\.io\/motion-prompt/);
    assert.match(JSON.stringify(motionItem.content ?? {}), /promptUrl|Pop-in|pop-in/i);

    const cultSearch = await callToolStable(client, {
      name: "search_ui_kits",
      arguments: { query: "halo button", sources: ["cult-ui"], limit: 3 },
    });
    record("search_ui_kits cult-ui halo button", cultSearch);
    assert.ok((cultSearch.hits?.length ?? 0) >= 1, "search should return a Cult UI hit");
    assert.equal(cultSearch.hits?.[0]?.compliance?.status, "allowed");
    assert.match(cultSearch.hits?.[0]?.officialUrl ?? "", /cult-ui\.com/);

    const cultItem = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "cult-ui", id: cultSearch.hits?.[0]?.itemId ?? "halo-button", intendedUse: "use this in a client marketing site" },
    });
    record("get_item cult-ui", cultItem);
    assert.equal(cultItem.compliance?.status, "allowed");
    assert.ok(cultItem.content !== undefined, "Cult UI get_item should return official registry source");
    assert.match(cultItem.officialUrl ?? "", /cult-ui\.com/);
    assert.equal(cultItem.compliance?.licenseName, "MIT License");

    const magicSearch = await callToolStable(client, {
      name: "search_ui_kits",
      arguments: { query: "shine border", sources: ["magic-ui"], limit: 3 },
    });
    record("search_ui_kits magic-ui shine border", magicSearch);
    assert.ok((magicSearch.hits?.length ?? 0) >= 1, "search should return a Magic UI free hit");
    assert.equal(magicSearch.hits?.[0]?.compliance?.status, "allowed");
    assert.match(magicSearch.hits?.[0]?.officialUrl ?? "", /magicui\.design/);
    assert.equal(magicSearch.hits?.every((hit) => !String(hit.itemId ?? "").startsWith("pro:")), true);

    const magicItem = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "magic-ui", id: magicSearch.hits?.[0]?.itemId ?? "shine-border", intendedUse: "use this in a client marketing site" },
    });
    record("get_item magic-ui", magicItem);
    assert.equal(magicItem.compliance?.status, "allowed");
    assert.ok(magicItem.content !== undefined, "Magic UI get_item should return official free registry source");
    assert.match(magicItem.officialUrl ?? "", /magicui\.design/);
    assert.equal(magicItem.compliance?.licenseName, "MIT License");
    assert.equal(JSON.stringify(magicItem).includes("pro.magicui.design/r/"), false);

    const magicPro = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "magic-ui", id: "pro:hero-section" },
    });
    record("get_item magic-ui pro without fetching", magicPro);
    assert.equal(magicPro.compliance?.status, "blocked");
    assert.notEqual(magicPro.compliance?.status, "needs_token");
    assert.equal(magicPro.content, undefined);
    assert.equal(/configure\/add the token|add a token/i.test(JSON.stringify(magicPro)), false);

    const allowedPayloads = [bento, anime, bits, cultItem, magicItem].filter((payload): payload is ToolPayload => {
      if (!payload || payload.compliance?.status !== "allowed" || payload.content === undefined) return false;
      const body = JSON.stringify(payload.content);
      return body.length > 80 && (body.includes("BentoGrid") || body.includes("animejs") || body.includes("export") || body.includes("function") || body.includes("Halo") || body.includes("Shine") || body.includes("files"));
    });
    assert.ok(
      allowedPayloads.length >= 1,
      `expected at least one allowed official payload with real content.\n${JSON.stringify(report, null, 2)}\nstderr:\n${stderr.join("")}`,
    );
    for (const payload of allowedPayloads) {
      assert.ok(payload.compliance?.attribution);
      assert.ok((payload.compliance?.requiredNotices?.length ?? 0) > 0);
      assert.ok(payload.compliance?.licenseName);
      assert.ok(payload.compliance?.termsUrl);
    }

    const prompt = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "motionsites", id: `prompt:${secret}` },
    });
    record("get_item motionsites prompt body", prompt);
    assert.equal(prompt.compliance?.status, "blocked");
    assert.equal(prompt.content, undefined);
    assert.equal(JSON.stringify(prompt).includes(secret), false);
    assert.match(prompt.compliance?.termsUrl ?? "", /motionsites\.dev\/terms-of-service/);

    const premium = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "aceternity", id: "pro:hero-section-with-hub" },
    });
    record("get_item aceternity pro without token", premium);
    assert.equal(premium.compliance?.status, "needs_token");
    assert.notEqual(premium.compliance?.status, "blocked");
    assert.equal(premium.content, undefined);
    assert.equal(JSON.stringify(premium).includes("export "), false);
    assert.match(premium.compliance?.reason ?? "", /Aceternity All-Access/);
    assert.match(premium.compliance?.reason ?? "", /ACETERNITY_PRO_TOKEN/);
    assert.match(premium.compliance?.reason ?? "", /configure\/add the token, or skip this item/i);

    const bitsPro = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "react-bits", id: "pro:integrations-6" },
    });
    record("get_item react-bits pro without key", bitsPro);
    assert.equal(bitsPro.compliance?.status, "needs_token");
    assert.notEqual(bitsPro.compliance?.status, "blocked");
    assert.equal(bitsPro.content, undefined);
    assert.equal(JSON.stringify(bitsPro).includes("export "), false);
    assert.match(bitsPro.compliance?.reason ?? "", /React Bits Pro/);
    assert.match(bitsPro.compliance?.reason ?? "", /REACTBITS_LICENSE_KEY/);
    assert.match(bitsPro.compliance?.reason ?? "", /configure\/add the token, or skip this item/i);

    const referoSearch = await callToolStable(client, {
      name: "search_ui_kits",
      arguments: { query: "fintech", sources: ["refero-styles"], limit: 3 },
    });
    record("search_ui_kits refero-styles fintech", referoSearch);
    assert.ok((referoSearch.hits?.length ?? 0) >= 1, "search should return a public Refero Styles hit");
    assert.equal(referoSearch.hits?.[0]?.compliance?.status, "allowed");
    assert.match(referoSearch.hits?.[0]?.officialUrl ?? "", /styles\.refero\.design\/style\//);
    assert.equal(/Style Reference/.test(JSON.stringify(referoSearch.hits?.[0]?.content ?? "")), false);

    let referoItem: ToolPayload | undefined;
    for (const hit of referoSearch.hits ?? []) {
      if (!hit.itemId) continue;
      const candidate = await callToolStable(client, {
        name: "get_item",
        arguments: {
          source: "refero-styles",
          id: hit.itemId,
          intendedUse: "use this DESIGN.md in a client marketing site",
        },
      });
      record(`get_item refero-styles ${hit.itemId}`, candidate);
      if (
        (candidate.compliance?.status === "allowed" || candidate.compliance?.status === "flagged") &&
        candidate.content !== undefined
      ) {
        referoItem = candidate;
        break;
      }
    }
    assert.ok(referoItem, `Refero Styles get_item should return a public DESIGN.md body.\n${JSON.stringify(report, null, 2)}`);
    assert.match(JSON.stringify(referoItem.content ?? {}), /Style Reference|designMd/);
    assert.equal(JSON.stringify(referoItem.content ?? {}).includes("api.refero.design"), false);

    const referoPaid = await callToolStable(client, {
      name: "get_item",
      arguments: { source: "refero-styles", id: "paid:design-md" },
    });
    record("get_item refero-styles paid without fetching", referoPaid);
    assert.equal(referoPaid.compliance?.status, "blocked");
    assert.notEqual(referoPaid.compliance?.status, "needs_token");
    assert.equal(referoPaid.content, undefined);
    assert.equal(/configure\/add the token|add a token/i.test(JSON.stringify(referoPaid)), false);

    const license = await callToolStable(client, {
      name: "get_license",
      arguments: { source: "anime" },
    });
    record("get_license anime", license);
    assert.equal(license.compliance?.status, "allowed");
    assert.match(JSON.stringify(license), /Julian Garnier/);

    console.log(`E2E_REPORT ${JSON.stringify(report)}`);
  } finally {
    await client.close();
  }
});
