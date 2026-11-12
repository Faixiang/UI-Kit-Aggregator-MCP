import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHandlers, type Deps } from "../src/handlers.js";
import { createNet } from "../src/net.js";
import { createMcpServer } from "../src/server.js";
import type { EnvConfig } from "../src/types.js";

const env: EnvConfig = {
  cacheTtlMs: 1000,
  transport: "stdio",
  host: "127.0.0.1",
  port: 3847,
};

function routes(map: Record<string, string | unknown>): typeof fetch {
  return async (input) => {
    const url = String(input);
    const key = Object.keys(map).find((route) => url.includes(route));
    if (!key) return new Response(`missing ${url}`, { status: 404 });
    const body = map[key];
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
  };
}

function deps(fetchImpl: typeof fetch): Deps {
  return { env, net: createNet(env, fetchImpl, () => 1_000), fetchImpl };
}

test("list_sources names all nine libraries and their licenses", () => {
  const listed = createHandlers(deps(async () => {
    throw new Error("list_sources must not use the network");
  })).listSources();
  assert.equal(listed.sources.length, 9);
  assert.deepEqual(
    listed.sources.map((source) => source.id),
    ["motionsites", "react-bits", "uiverse", "anime", "aceternity", "motion-prompt", "cult-ui", "magic-ui", "refero-styles"],
  );
  for (const source of listed.sources) {
    assert.equal(source.compliance.status, "allowed");
    assert.ok(source.licenseName);
    assert.ok(source.licenseUrl);
    assert.ok(source.specialty && source.specialty.length > 20);
  }
  assert.match(listed.sources[0]?.specialty ?? "", /landing pages/i);
  assert.match(listed.sources[1]?.specialty ?? "", /React animation components/i);
  assert.match(listed.sources[2]?.specialty ?? "", /hover effects/i);
  assert.match(listed.sources[3]?.specialty ?? "", /animation engine/i);
  assert.match(listed.sources[4]?.specialty ?? "", /spotlight/i);
  assert.match(listed.sources[5]?.specialty ?? "", /motion vocabulary and prompt library/i);
  assert.match(listed.sources[5]?.specialty ?? "", /not drop-in UI components/i);
  assert.match(listed.sources[6]?.specialty ?? "", /Cult UI registry/i);
  assert.match(listed.sources[6]?.specialty ?? "", /not a general animation engine/i);
  assert.match(listed.sources[7]?.specialty ?? "", /official free \/ MIT catalog only/i);
  assert.match(listed.sources[7]?.specialty ?? "", /do not use this source for Magic UI Pro/i);
  assert.match(listed.sources[8]?.specialty ?? "", /official catalog of AI-readable design systems/i);
  assert.match(listed.sources[8]?.specialty ?? "", /DESIGN\.md/i);
  assert.match(listed.sources[8]?.specialty ?? "", /Cursor and Claude Code/i);
  assert.equal(listed.sources[8]?.licenseName, "Refero Terms of Use");
  assert.match(listed.sources[8]?.licenseUrl ?? "", /doc\.refero\.design\/legal\/terms-of-use/);
  assert.deepEqual(listed.sources[8]?.authEnv, []);
});

test("search returns gated React Bits metadata and does not inline source", async () => {
  const fetchImpl = routes({
    "/r/registry.json": {
      items: [
        {
          name: "SplitText-TS-TW",
          title: "SplitText",
          description: "Splits text into animated characters.",
          dependencies: [],
          files: [{ path: "SplitText/SplitText.tsx" }],
        },
      ],
    },
    "/llms.txt": "- [Split Text](https://www.reactbits.dev/text-animations/split-text): Animated split text. CLI: `SplitText`.",
    "/pro-manifest.json": { components: [], blocks: [], appUi: [], templates: [] },
  });
  const result = await createHandlers(deps(fetchImpl)).search({
    query: "split text",
    sources: ["react-bits"],
    limit: 3,
  });
  assert.equal(result.errors.length, 0);
  assert.ok(result.hits.length >= 1);
  const hit = result.hits[0];
  assert.equal(hit?.compliance.status, "allowed");
  assert.equal(hit?.itemId, "SplitText-TS-TW");
  assert.match(hit?.officialUrl ?? "", /reactbits\.dev/);
  assert.match(hit?.install ?? "", /@react-bits\/SplitText-TS-TW/);
  assert.equal(JSON.stringify(hit).includes("SplitText.tsx"), false);
});

test("MotionSites search never fetches, and a prompt id is blocked", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    throw new Error("motionsites must not be fetched");
  };
  const handlers = createHandlers(deps(fetchImpl));
  const found = await handlers.search({ query: "saas landing hero", sources: ["motionsites"], limit: 5 });
  assert.equal(called, false);
  assert.ok(found.hits.some((hit) => hit.itemId === "official-access"));
  assert.ok(found.hits.every((hit) => hit.compliance.status === "allowed"));
  const blocked = await handlers.getItem({ source: "motionsites", id: "prompt:SECRET_PROMPT_BODY_DO_NOT_LEAK" });
  assert.equal(blocked.compliance && "status" in blocked.compliance ? blocked.compliance.status : "", "blocked");
  assert.equal("content" in blocked, false);
  assert.equal(JSON.stringify(blocked).includes("SECRET_PROMPT_BODY_DO_NOT_LEAK"), false);
  assert.match(JSON.stringify(blocked), /terms-of-service/);
});

test("Uiverse Font Awesome snippet is flagged and a proprietary snippet is blocked", async () => {
  const html = `<!-- From Uiverse.io by Ada - Tags: button -->
<!-- Font Awesome Free by @fontawesome - https://fontawesome.com (Icons: CC BY 4.0) -->
<button>Go</button>`;
  const fetchImpl = routes({
    "Buttons/Ada_go.html": html,
    "Buttons/Ada_closed.html": "All rights reserved. Proprietary widget.",
  });
  const handlers = createHandlers(deps(fetchImpl));
  const flagged = await handlers.getItem({ source: "uiverse", id: "Buttons/Ada_go.html" });
  assert.equal(flagged.compliance?.status, "flagged");
  assert.match(JSON.stringify(flagged.content), /Font Awesome Free/);
  const blocked = await handlers.getItem({ source: "uiverse", id: "Buttons/Ada_closed.html" });
  assert.equal(blocked.compliance?.status, "blocked");
  assert.equal("content" in blocked, false);
  assert.equal(JSON.stringify(blocked).includes("Proprietary widget"), false);
});

test("Aceternity name outside the free catalog is needs_token without a key and does not fetch the registry", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/components")) {
      return new Response(JSON.stringify({ components: [{ name: "bento-grid", title: "Bento Grid", description: "A grid." }], blocks: [], hooks: [] }), { status: 200 });
    }
    return new Response("paid", { status: 200 });
  };
  const result = await createHandlers(deps(fetchImpl)).getItem({
    source: "aceternity",
    id: "pro:hero-section-with-hub",
  });
  assert.equal(result.compliance?.status, "needs_token");
  assert.notEqual(result.compliance?.status, "blocked");
  assert.equal("content" in result, false);
  assert.equal(calls.some((url) => url.includes("/registry/")), false);
  assert.match(result.compliance?.termsUrl ?? "", /ui\.aceternity\.com\/licence/);
  assert.match(result.compliance?.reason ?? "", /Aceternity All-Access/);
  assert.match(result.compliance?.reason ?? "", /ACETERNITY_PRO_TOKEN/);
  assert.match(result.compliance?.reason ?? "", /configure\/add the token, or skip this item/i);
  assert.equal(result.tokenRequest?.envVar, "ACETERNITY_PRO_TOKEN");
});

test("React Bits Pro without a key is needs_token and does not call the paid registry", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response("paid", { status: 200 });
  };
  const result = await createHandlers(deps(fetchImpl)).getItem({
    source: "react-bits",
    id: "pro:integrations-6",
  });
  assert.equal(result.compliance?.status, "needs_token");
  assert.notEqual(result.compliance?.status, "blocked");
  assert.equal("content" in result, false);
  assert.equal(calls.some((url) => url.includes("pro.reactbits.dev")), false);
  assert.match(result.compliance?.reason ?? "", /React Bits Pro/);
  assert.match(result.compliance?.reason ?? "", /REACTBITS_LICENSE_KEY/);
  assert.match(result.compliance?.reason ?? "", /configure\/add the token, or skip this item/i);
  assert.equal(result.tokenRequest?.envVar, "REACTBITS_LICENSE_KEY");
  assert.ok((result.tokenRequest?.registerUrls ?? []).some((url) => url.includes("reactbits.dev/pro")));
});

test("a dummy Aceternity token is enough for the official registry fetch to proceed", async () => {
  const dummy = "TEST-DUMMY-NOT-A-REAL-KEY";
  const envWithToken = { ...env, aceternityProToken: dummy };
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/components")) {
      return new Response(JSON.stringify({ components: [{ name: "bento-grid", title: "Bento Grid" }], blocks: [], hooks: [] }), { status: 200 });
    }
    if (url.includes("/registry/hero.json")) {
      return new Response(JSON.stringify({
        name: "hero",
        title: "Hero",
        files: [{ path: "hero.tsx", content: "export function Hero(){ return null }" }],
      }), { status: 200 });
    }
    return new Response("missing", { status: 404 });
  };
  const result = await createHandlers({ env: envWithToken, net: createNet(envWithToken, fetchImpl, () => 1_000), fetchImpl }).getItem({
    source: "aceternity",
    id: "pro:hero",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(result.compliance?.status, "allowed");
  assert.match(JSON.stringify(result.content ?? {}), /export function Hero/);
  assert.equal(JSON.stringify(result).includes(dummy), false);
  assert.equal(calls.some((url) => url.includes("/registry/hero.json")), true);
});

test("a dummy React Bits license key is enough for the official paid registry fetch to proceed", async () => {
  const dummy = "TEST-DUMMY-NOT-A-REAL-KEY";
  const envWithToken = { ...env, reactBitsLicenseKey: dummy };
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/api/r/pro/integrations-6.json")) {
      return new Response(JSON.stringify({
        name: "integrations-6",
        title: "Integrations 6",
        files: [{ path: "integrations-6.tsx", content: "export function Integrations(){ return null }" }],
      }), { status: 200 });
    }
    return new Response("missing", { status: 404 });
  };
  const result = await createHandlers({ env: envWithToken, net: createNet(envWithToken, fetchImpl, () => 1_000), fetchImpl }).getItem({
    source: "react-bits",
    id: "pro:integrations-6",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(result.compliance?.status, "allowed");
  assert.match(JSON.stringify(result.content ?? {}), /export function Integrations/);
  assert.equal(JSON.stringify(result).includes(dummy), false);
  assert.equal(calls.some((url) => url.includes("/api/r/pro/integrations-6.json")), true);
});

test("check_compliance blocks republishing Aceternity and allows a client site", async () => {
  const handlers = createHandlers(deps(async () => new Response("{}", { status: 200 })));
  const blocked = await handlers.checkCompliance({
    source: "aceternity",
    itemId: "bento-grid",
    proposedUse: "sell this as a template pack on a marketplace",
  });
  assert.equal(blocked.compliance.status, "blocked");
  const allowed = await handlers.checkCompliance({
    source: "react-bits",
    itemId: "SplitText-TS-TW",
    proposedUse: "use this in a client marketing site",
  });
  assert.equal(allowed.compliance.status, "allowed");
});


test("Motion Prompt search and get_item return MIT catalog entries", async () => {
  const catalog = {
    version: "test",
    site: "https://showheyohtaki.github.io/motion-prompt/",
    repo: "https://github.com/showheyohtaki/motion-prompt",
    count: 1,
    packs: [
      {
        pack: "motion",
        title: { en: "Motion graphics moves" },
        categories: [{ slug: "entrances-text", en: "Entrances & text" }],
      },
    ],
    elements: [
      {
        id: "001",
        pack: "motion",
        no: "01",
        slug: "pop-in",
        category: "entrances-text",
        width: 539,
        height: 208,
        cycle: 4.7,
        name: { en: "Pop-in", ja: "ポップイン" },
        meaning: { en: "Pops into view with a small bounce" },
        ask: { en: "Bring the logo in with a pop-in, about 0.4 s, with a slight overshoot." },
        summary: { en: "An app icon pops in with a bounce." },
        spec: { en: ["One pop per 2.35 s."] },
        use: { en: "Use it to bring in a small element." },
        tags: ["pop", "pop-in", "spring"],
      },
    ],
  };
  const promptBody = "Please use \"Pop-in\" (ポップイン), one of the names in \"Motion graphics moves\".\nMotion Prompt #001";
  const fetchImpl = routes({
    "/api/v1/catalog.json": catalog,
    "/api/v1/en/p/001.txt": promptBody,
  });
  const handlers = createHandlers(deps(fetchImpl));
  const found = await handlers.search({ query: "pop-in bounce", sources: ["motion-prompt"], limit: 3 });
  assert.equal(found.errors.length, 0);
  assert.ok(found.hits.length >= 1);
  const hit = found.hits[0];
  assert.equal(hit?.compliance.status, "allowed");
  assert.equal(hit?.itemId, "001");
  assert.equal(hit?.officialUrl, "https://showheyohtaki.github.io/motion-prompt/#001");
  assert.match(hit?.install ?? "", /npx skills add showheyohtaki\/motion-prompt/);
  const item = await handlers.getItem({ source: "motion-prompt", id: "pop-in", intendedUse: "use this in a client marketing site" });
  assert.equal(item.compliance && "status" in item.compliance ? item.compliance.status : "", "allowed");
  assert.equal(item.itemId, "001");
  assert.match(item.officialUrl ?? "", /motion-prompt\/#001/);
  assert.equal(item.compliance && "licenseName" in item.compliance ? item.compliance.licenseName : "", "MIT License");
  const body = JSON.stringify(item.content ?? {});
  assert.match(body, /Pop-in/);
  assert.match(body, /Motion Prompt #001/);
  assert.match(body, /api\/v1\/en\/p\/001\.txt/);
  const missing = await handlers.getItem({ source: "motion-prompt", id: "does-not-exist" });
  assert.equal(missing.compliance && "status" in missing.compliance ? missing.compliance.status : "", "blocked");
  assert.equal("content" in missing, false);
});


test("Cult UI search and get_item return MIT registry items", async () => {
  const fetchImpl = routes({
    "/r/registry.json": {
      items: [
        {
          name: "halo-button",
          type: "registry:ui",
          title: "Halo Button",
          description: "Primary action button with an animated gradient rim.",
          dependencies: ["motion"],
          files: [{ path: "registry/default/ui/halo-button.tsx" }],
        },
        {
          name: "halo-button-demo",
          type: "registry:component",
          description: "Demo only",
        },
      ],
    },
    "/llms.txt": "- [Halo Button](https://www.cult-ui.com/docs/components/halo-button.md): Primary action button with an animated gradient rim.",
    "/r/halo-button.json": {
      name: "halo-button",
      title: "Halo Button",
      description: "Primary action button with an animated gradient rim.",
      dependencies: ["motion"],
      files: [{ path: "registry/default/ui/halo-button.tsx", content: "export function HaloButton(){ return null }" }],
    },
  });
  const handlers = createHandlers(deps(fetchImpl));
  const found = await handlers.search({ query: "halo button", sources: ["cult-ui"], limit: 3 });
  assert.equal(found.errors.length, 0);
  assert.ok(found.hits.length >= 1);
  const hit = found.hits[0];
  assert.equal(hit?.compliance.status, "allowed");
  assert.equal(hit?.itemId, "halo-button");
  assert.match(hit?.officialUrl ?? "", /cult-ui\.com\/docs\/components\/halo-button/);
  assert.match(hit?.install ?? "", /@cult-ui\/halo-button/);
  assert.equal(JSON.stringify(hit).includes("export function HaloButton"), false);
  const item = await handlers.getItem({ source: "cult-ui", id: "halo-button", intendedUse: "use this in a client marketing site" });
  assert.equal(item.compliance && "status" in item.compliance ? item.compliance.status : "", "allowed");
  assert.equal(item.compliance && "licenseName" in item.compliance ? item.compliance.licenseName : "", "MIT License");
  assert.match(JSON.stringify(item.content ?? {}), /HaloButton/);
  const missing = await handlers.getItem({ source: "cult-ui", id: "does-not-exist" });
  assert.equal(missing.compliance && "status" in missing.compliance ? missing.compliance.status : "", "blocked");
  assert.equal("content" in missing, false);
});

test("Magic UI search returns free MIT items and Pro ids are blocked without calling pro.magicui.design", async () => {
  const calls: string[] = [];
  const map: Record<string, unknown> = {
    "/r/registry.json": {
      items: [
        {
          name: "shine-border",
          type: "registry:ui",
          title: "Shine Border",
          description: "Shine border is an animated background border effect.",
          files: [{ path: "registry/magicui/shine-border.tsx" }],
        },
        {
          name: "paid-hero",
          type: "registry:ui",
          title: "Paid Hero",
          description: "A Magic UI Pro only block.",
          premium: true,
        },
        {
          name: "shine-border-demo",
          type: "registry:example",
          title: "Shine Border Demo",
          description: "Example usage",
        },
      ],
    },
    "/llms.txt": "- [Shine Border](https://magicui.design/docs/components/shine-border): Shine border is an animated background border effect.",
    "/r/shine-border.json": {
      name: "shine-border",
      title: "Shine Border",
      description: "Shine border is an animated background border effect.",
      files: [{ path: "registry/magicui/shine-border.tsx", content: "export function ShineBorder(){ return null }" }],
    },
  };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(map).find((route) => url.includes(route));
    if (!key) return new Response(`missing ${url}`, { status: 404 });
    const body = map[key];
    const textBody = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(textBody, { status: 200, headers: { "content-type": "application/json" } });
  };
  const handlers = createHandlers(deps(fetchImpl));
  const found = await handlers.search({ query: "shine border", sources: ["magic-ui"], limit: 5 });
  assert.equal(found.errors.length, 0);
  assert.ok(found.hits.some((hit) => hit.itemId === "shine-border"));
  assert.equal(found.hits.every((hit) => hit.itemId !== "paid-hero"), true);
  assert.equal(found.hits[0]?.compliance.status, "allowed");
  assert.match(found.hits.find((hit) => hit.itemId === "shine-border")?.officialUrl ?? "", /magicui\.design\/docs\/components\/shine-border/);
  const item = await handlers.getItem({ source: "magic-ui", id: "shine-border", intendedUse: "use this in a client marketing site" });
  assert.equal(item.compliance && "status" in item.compliance ? item.compliance.status : "", "allowed");
  assert.equal(item.compliance && "licenseName" in item.compliance ? item.compliance.licenseName : "", "MIT License");
  assert.match(JSON.stringify(item.content ?? {}), /ShineBorder/);
  const blocked = await handlers.getItem({ source: "magic-ui", id: "pro:hero-section" });
  assert.equal(blocked.compliance && "status" in blocked.compliance ? blocked.compliance.status : "", "blocked");
  assert.notEqual(blocked.compliance && "status" in blocked.compliance ? blocked.compliance.status : "", "needs_token");
  assert.equal("content" in blocked, false);
  assert.equal("tokenRequest" in blocked, false);
  assert.equal(/configure\/add the token|add a token/i.test(JSON.stringify(blocked)), false);
  assert.equal(calls.some((url) => url.includes("pro.magicui.design")), false);
  const paid = await handlers.getItem({ source: "magic-ui", id: "paid-hero" });
  assert.equal(paid.compliance && "status" in paid.compliance ? paid.compliance.status : "", "blocked");
  assert.equal("content" in paid, false);
  assert.equal(calls.some((url) => url.includes("pro.magicui.design")), false);
});

test("Refero Styles searches public listings and gates DESIGN.md bodies", async () => {
  const intercomId = "12255b63-e506-4bc1-a4cd-d05487de32f3";
  const columnId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const designMd = `# Intercom — Style Reference
> Warm cream editorial spread

**Theme:** light

## Tokens — Colors

Electric Violet #0007cb on a warm cream canvas. Use this DESIGN.md as reference for a marketing site.
Saans at weight 300. Sharp 4px corners. This paragraph exists so the public body is long enough to keep.
`;
  const calls: string[] = [];
  const pages: Record<string, string> = {
    "https://styles.refero.design/": listingHtml([
      {
        id: intercomId,
        url: "https://intercom.com",
        siteName: "Intercom",
        northStar: "Warm cream editorial spread",
        colorScheme: "light",
        colors: [{ name: "Electric Violet", hex: "#0007cb" }],
        fonts: ["Saans"],
      },
    ]),
    "https://styles.refero.design/sitemaps/collections.xml": `<?xml version="1.0"?><urlset>
      <url><loc>https://styles.refero.design/design-styles/fintech-websites</loc></url>
      <url><loc>https://styles.refero.design/ai-agents/design-prompts</loc></url>
    </urlset>`,
    "https://styles.refero.design/design-styles/fintech-websites": listingHtml([
      {
        id: columnId,
        url: "https://column.com",
        siteName: "Column",
        northStar: "deep navy ledger under cool dawn",
        colorScheme: "light",
        colors: [{ name: "Navy", hex: "#0b1f33" }],
        fonts: ["GT America"],
      },
    ]),
    [`https://styles.refero.design/style/${intercomId}`]: `<title>Intercom design system | Refero Styles</title><pre><code>${designMd}</code></pre>`,
    [`https://styles.refero.design/style/${columnId}`]: `<title>Column design system | Refero Styles</title>
      <pre><code># Column — Style Reference
> deep navy ledger

## Tokens — Colors

Navy #0b1f33. Copyright (c) Saans Foundry must stay on this reconstruction.
${"Spacing rhythm stays editorial. ".repeat(8)}</code></pre>`,
  };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const body = pages[url];
    if (body === undefined) return new Response(`missing ${url}`, { status: 404 });
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  };
  const handlers = createHandlers(deps(fetchImpl));
  const found = await handlers.search({ query: "intercom cream", sources: ["refero-styles"], limit: 3 });
  assert.equal(found.errors.length, 0);
  assert.equal(found.hits[0]?.itemId, intercomId);
  assert.equal(found.hits[0]?.compliance.status, "allowed");
  assert.equal(found.hits[0]?.officialUrl, `https://styles.refero.design/style/${intercomId}`);
  assert.equal(JSON.stringify(found.hits[0]).includes("Electric Violet #0007cb on a warm cream canvas"), false);
  assert.equal(calls.some((url) => url.includes("/api/") || url.includes("api.refero.design")), false);
  assert.equal(calls.some((url) => url.includes("/ai-agents/")), false);

  const fintech = await handlers.search({ query: "fintech navy", sources: ["refero-styles"], limit: 3 });
  assert.equal(fintech.errors.length, 0);
  assert.ok(fintech.hits.some((hit) => hit.itemId === columnId));
  assert.equal(calls.some((url) => url.includes("/design-styles/fintech-websites")), true);
  assert.equal(calls.some((url) => url.includes("/ai-agents/")), false);

  const item = await handlers.getItem({
    source: "refero-styles",
    id: intercomId,
    intendedUse: "use this DESIGN.md in a client marketing site",
  });
  assert.equal(item.compliance && "status" in item.compliance ? item.compliance.status : "", "allowed");
  assert.match(JSON.stringify(item.content ?? {}), /Warm cream editorial spread/);
  assert.match(JSON.stringify(item.content ?? {}), /Intercom/);
  assert.equal(calls.some((url) => url.includes("/api/") || url.includes("api.refero.design")), false);

  const flagged = await handlers.getItem({
    source: "refero-styles",
    id: columnId,
    intendedUse: "use this DESIGN.md in a client marketing site",
  });
  assert.equal(flagged.compliance && "status" in flagged.compliance ? flagged.compliance.status : "", "flagged");
  assert.match(JSON.stringify(flagged.content ?? {}), /Copyright \(c\) Saans Foundry/);
  assert.match(JSON.stringify(flagged.compliance ?? {}), /Copyright \(c\) Saans Foundry/);

  const secret = "UNIQUE_DESIGN_MD_BODY_DO_NOT_LEAK";
  const reservedId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
  pages[`https://styles.refero.design/style/${reservedId}`] = `<title>Reserved design system | Refero Styles</title><pre><code># Reserved — Style Reference
> locked preview

## Tokens — Colors

${secret}
${"Public page withheld the rest of this style reference. ".repeat(6)}
All rights reserved.
</code></pre>`;
  const unclear = await handlers.getItem({ source: "refero-styles", id: reservedId });
  assert.equal(unclear.compliance && "status" in unclear.compliance ? unclear.compliance.status : "", "blocked");
  assert.equal("content" in unclear, false);
  assert.equal(JSON.stringify(unclear).includes(secret), false);

  const republished = await handlers.getItem({
    source: "refero-styles",
    id: columnId,
    intendedUse: "republish this DESIGN.md as a design library",
  });
  assert.equal(republished.compliance && "status" in republished.compliance ? republished.compliance.status : "", "blocked");
  assert.equal("content" in republished, false);

  const paidCalls = calls.length;
  const paid = await handlers.getItem({ source: "refero-styles", id: "paid:SECRET_DESIGN_MD" });
  assert.equal(paid.compliance && "status" in paid.compliance ? paid.compliance.status : "", "blocked");
  assert.notEqual(paid.compliance && "status" in paid.compliance ? paid.compliance.status : "", "needs_token");
  assert.equal("content" in paid, false);
  assert.equal("tokenRequest" in paid, false);
  assert.equal(JSON.stringify(paid).includes("SECRET_DESIGN_MD"), false);
  assert.equal(/configure\/add the token|add a token/i.test(JSON.stringify(paid)), false);
  assert.equal(calls.length, paidCalls);
  assert.match(JSON.stringify(paid), /doc\.refero\.design\/legal\/terms-of-use/);

  const trained = await handlers.checkCompliance({
    source: "refero-styles",
    itemId: intercomId,
    proposedUse: "train a model on this catalog and publish the dataset",
  });
  assert.equal(trained.compliance.status, "blocked");
  const clientSite = await handlers.checkCompliance({
    source: "refero-styles",
    itemId: intercomId,
    proposedUse: "use this DESIGN.md in a client marketing site",
  });
  assert.equal(clientSite.compliance.status, "allowed");
});

function listingHtml(styles: unknown[]): string {
  const payload = JSON.stringify({ initialPage: { styles, nextCursor: null, nextPage: null } });
  const push = JSON.stringify([1, payload]);
  return `<!doctype html><script>self.__next_f.push(${push})</script>`;
}

test("the MCP server lists tools and has no skip switch", async () => {
  const server = createMcpServer(deps(async () => new Response("{}", { status: 200 })));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "unit", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["check_compliance", "get_item", "get_license", "list_sources", "search_ui_kits"]);
  for (const tool of listed.tools) {
    const schema = JSON.stringify(tool.inputSchema ?? {});
    assert.equal(schema.includes("skip_license"), false, tool.name);
    assert.match(tool.description ?? "", /needs_token/, tool.name);
    assert.match(tool.description ?? "", /configure\/add the token or skip/i, tool.name);
  }
  const result = await client.callTool({ name: "list_sources", arguments: {} });
  const text = (result.content as Array<{ text?: string }>).map((part) => part.text ?? "").join("\n");
  const payload = JSON.parse(text) as { sources: unknown[] };
  assert.equal(payload.sources.length, 9);
  await client.close();
  await server.close();
});
