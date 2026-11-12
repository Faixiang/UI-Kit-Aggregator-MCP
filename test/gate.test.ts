import assert from "node:assert/strict";
import { test } from "node:test";
import { ANIME_LICENSE, CULT_UI_LICENSE, MAGIC_UI_LICENSE, MOTION_PROMPT_LICENSE, REACT_BITS_LICENSE } from "../src/compliance/texts.js";
import { gate } from "../src/compliance/gate.js";
import { ACETERNITY_ALL_ACCESS, REACT_BITS_PRO_ACCESS } from "../src/compliance/token.js";

const secret = "SECRET_PROMPT_BODY_DO_NOT_LEAK";

test("Anime.js MIT content is allowed and keeps the copyright notice", () => {
  const result = gate({
    sourceId: "anime",
    itemId: "docs:animation",
    licenseName: "MIT License",
    licenseUrl: "https://github.com/juliangarnier/anime/blob/master/LICENSE.md",
    attribution: "Copyright (c) 2025 Julian Garnier",
    termsUrl: "https://github.com/juliangarnier/anime/blob/master/LICENSE.md",
    requiredNotices: [ANIME_LICENSE],
    content: "import { animate } from 'animejs';",
    kind: "docs",
    redistribution: "allowed",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(result.compliance.status, "allowed");
  assert.equal(result.content, "import { animate } from 'animejs';");
  assert.match(result.compliance.requiredNotices.join("\n"), /Copyright \(c\) 2025 Julian Garnier/);
  assert.equal(result.compliance.licenseName, "MIT License");
});


test("Motion Prompt MIT content is allowed and keeps the copyright notice", () => {
  const prompt = "Bring the logo in with a pop-in, about 0.4 s, with a slight overshoot.";
  const result = gate({
    sourceId: "motion-prompt",
    itemId: "001",
    licenseName: "MIT License",
    licenseUrl: "https://github.com/showheyohtaki/motion-prompt/blob/main/LICENSE",
    attribution: "Copyright (c) 2026 Shohei Ohtaki",
    termsUrl: "https://github.com/showheyohtaki/motion-prompt/blob/main/LICENSE",
    requiredNotices: [MOTION_PROMPT_LICENSE],
    content: prompt,
    kind: "docs",
    redistribution: "allowed",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(result.compliance.status, "allowed");
  assert.equal(result.content, prompt);
  assert.match(result.compliance.requiredNotices.join("\n"), /Copyright \(c\) 2026 Shohei Ohtaki/);
  assert.equal(result.compliance.licenseName, "MIT License");
});

test("MotionSites prompt body is blocked and the body is not copied into the decision", () => {
  const result = gate({
    sourceId: "motionsites",
    itemId: `prompt:${secret}`,
    licenseName: "MotionSites Terms of Service",
    licenseUrl: "https://motionsites.dev/terms-of-service/zh",
    attribution: "Prompt text is not transferable.",
    termsUrl: "https://motionsites.dev/terms-of-service/zh",
    requiredNotices: ["Personal, non-transferable license."],
    content: secret,
    kind: "prompt",
    redistribution: "forbidden",
    block: {
      reason: "Prompt bodies are locked. Terms: https://motionsites.dev/terms-of-service/zh",
    },
    skip_license_check: true,
  });
  assert.equal(result.compliance.status, "blocked");
  assert.equal(result.content, null);
  assert.equal(result.compliance.itemId, null);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.match(result.compliance.termsUrl, /motionsites\.dev\/terms-of-service/);
});

test("Aceternity Pro without a token is needs_token, not a silent block", () => {
  const result = gate({
    sourceId: "aceternity",
    itemId: "pro:hero-section-with-hub",
    licenseName: "Aceternity License",
    licenseUrl: "https://ui.aceternity.com/licence",
    attribution: "The author retains ownership.",
    termsUrl: "https://ui.aceternity.com/licence",
    requiredNotices: ["Aceternity License"],
    content: "export const Paywalled = true;",
    kind: "source",
    redistribution: "forbidden",
    needsToken: ACETERNITY_ALL_ACCESS,
  });
  assert.equal(result.compliance.status, "needs_token");
  assert.notEqual(result.compliance.status, "blocked");
  assert.notEqual(result.compliance.status, "allowed");
  assert.equal(result.content, null);
  assert.equal(JSON.stringify(result).includes("Paywalled"), false);
  assert.match(result.compliance.reason, /Aceternity All-Access/);
  assert.match(result.compliance.reason, /ACETERNITY_PRO_TOKEN/);
  assert.match(result.compliance.reason, /configure\/add the token, or skip this item/i);
  assert.equal(result.compliance.tokenRequest?.envVar, "ACETERNITY_PRO_TOKEN");
  assert.equal(result.compliance.tokenRequest?.product, "Aceternity All-Access");
  assert.equal(result.compliance.tokenRequest?.askUser, "configure_or_skip");
  assert.ok(result.compliance.tokenRequest?.registerUrls.some((url) => url.includes("ui.aceternity.com/pricing")));
  assert.ok(result.compliance.tokenRequest?.registerUrls.some((url) => url.includes("ui.aceternity.com/dashboard/token")));
});

test("React Bits Pro without a key is needs_token, not a silent block", () => {
  const result = gate({
    sourceId: "react-bits",
    itemId: "pro:integrations-6",
    licenseName: "React Bits Pro License Agreement",
    licenseUrl: "https://pro.reactbits.dev/license",
    attribution: "Copyright David Haz.",
    termsUrl: "https://pro.reactbits.dev/license",
    requiredNotices: ["React Bits Pro License"],
    content: "export const Paywalled = true;",
    kind: "source",
    redistribution: "forbidden",
    needsToken: REACT_BITS_PRO_ACCESS,
  });
  assert.equal(result.compliance.status, "needs_token");
  assert.notEqual(result.compliance.status, "blocked");
  assert.equal(result.content, null);
  assert.equal(JSON.stringify(result).includes("Paywalled"), false);
  assert.match(result.compliance.reason, /React Bits Pro/);
  assert.match(result.compliance.reason, /REACTBITS_LICENSE_KEY/);
  assert.match(result.compliance.reason, /configure\/add the token, or skip this item/i);
  assert.equal(result.compliance.tokenRequest?.envVar, "REACTBITS_LICENSE_KEY");
  assert.ok(result.compliance.tokenRequest?.registerUrls.some((url) => url.includes("reactbits.dev/pro")));
});

test("an unclear license is blocked rather than flagged", () => {
  const result = gate({
    sourceId: "uiverse",
    itemId: "unknown",
    licenseName: null,
    licenseUrl: "https://uiverse.io/",
    attribution: "",
    termsUrl: "https://uiverse.io/",
    content: "button { color: red }",
    kind: "source",
    redistribution: "allowed",
  });
  assert.equal(result.compliance.status, "blocked");
  assert.notEqual(result.compliance.status, "flagged");
  assert.equal(result.content, null);
  assert.match(result.compliance.reason, /could not be determined/i);
});

test("a Uiverse snippet with a Font Awesome notice is flagged and the notice stays", () => {
  const html = `<!-- From Uiverse.io by Ada -->
<!-- Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0) -->
<button class="fa">Go</button>`;
  const result = gate({
    sourceId: "uiverse",
    itemId: "Buttons/Ada_example.html",
    licenseName: "MIT License",
    licenseUrl: "https://github.com/uiverse-io/galaxy/blob/main/LICENSE",
    attribution: "Copyright (c) 2023 Uiverse.io",
    termsUrl: "https://github.com/uiverse-io/galaxy/blob/main/LICENSE",
    requiredNotices: ["Copyright (c) 2023 Uiverse.io"],
    content: html,
    kind: "source",
    redistribution: "allowed",
    intendedUse: "use this button in a client marketing site",
  });
  assert.equal(result.compliance.status, "flagged");
  assert.equal(result.content, html);
  assert.match(result.content ?? "", /Font Awesome Free/);
  assert.match(result.compliance.warnings.join("\n"), /CC BY 4\.0/);
});

test("React Bits redistribution of the components is blocked", () => {
  const result = gate({
    sourceId: "react-bits",
    itemId: "SplitText-TS-TW",
    licenseName: "MIT License + Commons Clause",
    licenseUrl: "https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md",
    attribution: "Copyright (c) 2026 David Haz",
    termsUrl: "https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md",
    requiredNotices: [REACT_BITS_LICENSE],
    content: "export function SplitText(){ return null }",
    kind: "source",
    redistribution: "forbidden",
    intendedUse: "republish this as a component library on a marketplace",
  });
  assert.equal(result.compliance.status, "blocked");
  assert.equal(result.content, null);
  assert.equal(JSON.stringify(result).includes("export function SplitText"), false);
});

test("Aceternity redistribution as a template pack is blocked", () => {
  const result = gate({
    sourceId: "aceternity",
    itemId: "bento-grid",
    licenseName: "Aceternity License",
    licenseUrl: "https://ui.aceternity.com/licence",
    attribution: "The author retains ownership.",
    termsUrl: "https://ui.aceternity.com/licence",
    requiredNotices: ["Aceternity License"],
    content: "export const BentoGrid = () => null",
    kind: "source",
    redistribution: "forbidden",
    intendedUse: "create a theme template to sell on a marketplace",
  });
  assert.equal(result.compliance.status, "blocked");
  assert.equal(result.content, null);
});

test("using React Bits inside a client site is allowed", () => {
  const result = gate({
    sourceId: "react-bits",
    itemId: "SplitText-TS-TW",
    licenseName: "MIT License + Commons Clause",
    licenseUrl: "https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md",
    attribution: "Copyright (c) 2026 David Haz",
    termsUrl: "https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md",
    requiredNotices: [REACT_BITS_LICENSE],
    content: "export function SplitText(){ return null }",
    kind: "source",
    redistribution: "forbidden",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(result.compliance.status, "allowed");
  assert.match(result.compliance.requiredNotices.join("\n"), /Copyright \(c\) 2026 David Haz/);
  assert.match(result.compliance.requiredNotices.join("\n"), /Commons Clause/);
});

test("Cult UI MIT content is allowed and keeps the copyright notice", () => {
  const source = "export function HaloButton(){ return null }";
  const result = gate({
    sourceId: "cult-ui",
    itemId: "halo-button",
    licenseName: "MIT License",
    licenseUrl: "https://github.com/nolly-studio/cult-ui/blob/main/LICENSE.md",
    attribution: "Copyright (c) 2023 Jordan-Gilliam",
    termsUrl: "https://github.com/nolly-studio/cult-ui/blob/main/LICENSE.md",
    requiredNotices: [CULT_UI_LICENSE],
    content: source,
    kind: "source",
    redistribution: "allowed",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(result.compliance.status, "allowed");
  assert.equal(result.content, source);
  assert.match(result.compliance.requiredNotices.join("\n"), /Copyright \(c\) 2023 Jordan-Gilliam/);
  assert.equal(result.compliance.licenseName, "MIT License");
});

test("Magic UI free MIT content is allowed and Pro items are blocked", () => {
  const source = "export function ShineBorder(){ return null }";
  const allowed = gate({
    sourceId: "magic-ui",
    itemId: "shine-border",
    licenseName: "MIT License",
    licenseUrl: "https://github.com/magicuidesign/magicui/blob/main/LICENSE.md",
    attribution: "Copyright (c) Magic UI",
    termsUrl: "https://github.com/magicuidesign/magicui/blob/main/LICENSE.md",
    requiredNotices: [MAGIC_UI_LICENSE],
    content: source,
    kind: "source",
    redistribution: "allowed",
    intendedUse: "use this in a client marketing site",
  });
  assert.equal(allowed.compliance.status, "allowed");
  assert.equal(allowed.content, source);
  assert.match(allowed.compliance.requiredNotices.join("\n"), /Copyright \(c\) Magic UI/);
  const blocked = gate({
    sourceId: "magic-ui",
    itemId: "pro:hero-section",
    licenseName: "Magic UI Pro License",
    licenseUrl: "https://pro.magicui.design/license",
    attribution: "Magic UI Pro is a separate paid license.",
    termsUrl: "https://pro.magicui.design/license",
    requiredNotices: ["Magic UI Pro is not returned."],
    content: "export const Paywalled = true;",
    kind: "source",
    redistribution: "forbidden",
    block: {
      reason: "Magic UI Pro is a separate paid license and is not indexed or fetched. Terms: https://pro.magicui.design/license",
    },
  });
  assert.equal(blocked.compliance.status, "blocked");
  assert.notEqual(blocked.compliance.status, "needs_token");
  assert.equal(blocked.content, null);
  assert.equal(JSON.stringify(blocked).includes("Paywalled"), false);
  assert.equal(blocked.compliance.tokenRequest, undefined);
  assert.equal(/configure\/add the token|add a token/i.test(blocked.compliance.reason), false);
});
