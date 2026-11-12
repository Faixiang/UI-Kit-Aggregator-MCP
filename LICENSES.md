# Third-party terms

This repository's own code is under the MIT license in `LICENSE`. That grant does **not** cover the nine catalogs. Nothing in this project is a claim of ownership over those works, and this tree does not vendor their source.

The gate quotes the texts below so an agent can show attribution. The quotations are the license files supplied with this project, or clauses read from the public terms pages. If a summary and a linked document ever disagree, the document at the URL wins.

| Source | Name used by the gate | URL |
| --- | --- | --- |
| React Bits (free registry) | MIT License + Commons Clause | https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md |
| React Bits Pro | React Bits Pro License Agreement | https://pro.reactbits.dev/license |
| Uiverse galaxy | MIT License | https://github.com/uiverse-io/galaxy/blob/main/LICENSE |
| Anime.js | MIT License | https://github.com/juliangarnier/anime/blob/master/LICENSE.md |
| Aceternity UI | Aceternity License | https://ui.aceternity.com/licence |
| MotionSites | MotionSites Terms of Service | https://motionsites.dev/terms-of-service/zh and https://motionsites.ai/terms |
| Motion Prompt | MIT License | https://github.com/showheyohtaki/motion-prompt/blob/main/LICENSE |
| Cult UI | MIT License | https://github.com/nolly-studio/cult-ui/blob/main/LICENSE.md |
| Magic UI (free registry) | MIT License | https://github.com/magicuidesign/magicui/blob/main/LICENSE.md |
| Magic UI Pro (not indexed) | Magic UI Pro License | https://pro.magicui.design/license |
| Refero Styles (public pages) | Refero Terms of Use | https://doc.refero.design/legal/terms-of-use |

## React Bits (free)

Copyright (c) 2026 David Haz. MIT plus the Commons Clause. Use inside an application, website, or product is allowed, including commercial products. Selling, sublicensing, or redistributing the components themselves (alone, bundled, or as a port) is not. The same restriction covers the React Bits tools and the sound library: do not sell, sublicense, or redistribute the tools or sounds, and do not offer the tools or a substantially similar copy as a hosted service. Exports you make with the tools can be used in a product; do not sell those exports on their own as a pack. The full text shipped with this project is in `src/compliance/texts.ts` (`REACT_BITS_LICENSE`).

## React Bits Pro

Separate paid license at https://pro.reactbits.dev/license. One developer, personal and non-transferable. Building client and commercial end products is allowed. Redistributing the product, re-exposing the registry, or sharing the license key is not. The public file https://www.reactbits.dev/pro-manifest.json is metadata only. `REACTBITS_LICENSE_KEY` is the variable named on https://pro.reactbits.dev/docs/installation. Registries:

- `https://pro.reactbits.dev/api/r/starter/{name}.json`
- `https://pro.reactbits.dev/api/r/pro/{name}.json`

The installation page sends them with an `Authorization` header. This server uses `Bearer <REACTBITS_LICENSE_KEY>` and does not store the response.

## Uiverse

Galaxy mirror: MIT, Copyright (c) 2023 Uiverse.io. The copyright notice must stay with copies. Attribution to the creator and to Uiverse.io is appreciated, not required by that MIT text. The website describes the community elements as free for personal and commercial use. A snippet can embed a third-party asset (Font Awesome icons are CC BY 4.0 and need attribution). Those notices are flagged and kept. Uiverse AI Design Systems are a different, paid product and are blocked. The mirror can lag the site (the last widely noted bulk update was around 2024-09).

## Anime.js

MIT, Copyright (c) 2025 Julian Garnier. Full text in `ANIME_LICENSE`. Install: `npm i animejs`, then `import { animate } from 'animejs'`.

## Aceternity UI

The Aceternity License (https://ui.aceternity.com/licence) is an ongoing, non-exclusive, worldwide license to use the Item. You may create unlimited end products for yourself or clients, sell or distribute those end products, modify the Item, and use it in more than one project. You may not redistribute the Item as stock or source files, sell or distribute the Item or derivative works on a marketplace, or create themes, templates, or derivative products to sell on a marketplace. The author keeps ownership. Some items include third-party components under their own licenses. Free items are listed at https://ui.aceternity.com/api/components and installed from `https://ui.aceternity.com/registry/{name}.json`. Premium blocks, templates, and pages need an All-Access license and `ACETERNITY_PRO_TOKEN` as a Bearer token, as documented at https://ui.aceternity.com/installation.

## MotionSites

Purchased or member prompts are under a personal, non-transferable license. You may use them for personal and commercial projects, including client work, and you may keep what the AI tool generates. You may not resell, republish, relicense, or give away the prompt text; post it to a public repository or collection; scrape, bulk-download, or mirror the catalog; or share accounts. Previews are public. Prompt bodies stay locked until purchase or membership. This server does not fetch them. Official access is the plugin `/plugin marketplace add kvalen-code/Motionsites-Dev` or the MCP at https://motionsites.ai/api/mcp (docs: https://motionsites.ai/mcp).

## Motion Prompt

MIT, Copyright (c) 2026 Shohei Ohtaki (大滝昇平 / @showheyohtaki). Full text in `MOTION_PROMPT_LICENSE`. Official catalog: https://showheyohtaki.github.io/motion-prompt/api/v1/catalog.json. Gallery: https://showheyohtaki.github.io/motion-prompt/. This is a naming and prompt vocabulary, not a component kit. Keep the copyright notice with any copy you keep.

## Cult UI

MIT, Copyright (c) 2023 Jordan-Gilliam. Official license file: https://github.com/nolly-studio/cult-ui/blob/main/LICENSE.md (raw: https://raw.githubusercontent.com/nolly-studio/cult-ui/main/LICENSE.md). Full text in `CULT_UI_LICENSE`. Keep the copyright notice with copies. Official registry index: https://www.cult-ui.com/r/registry.json. One item: `https://www.cult-ui.com/r/{name}.json`. Docs map: https://www.cult-ui.com/llms.txt. Install: `npx shadcn@latest add @cult-ui/{name}`.

## Magic UI (free catalog only)

MIT, Copyright (c) Magic UI. Official license file: https://github.com/magicuidesign/magicui/blob/main/LICENSE.md (raw: https://raw.githubusercontent.com/magicuidesign/magicui/main/LICENSE.md). Full text in `MAGIC_UI_LICENSE`. Keep the copyright notice with copies. Official free registry index: https://magicui.design/r/registry.json. One free item: `https://magicui.design/r/{name}.json`. Docs map: https://magicui.design/llms.txt. Install: `npx shadcn@latest add @magicui/{name}`.

Magic UI Pro is a separate paid license at https://pro.magicui.design/license. This server does not add, index, fetch, or return Pro catalogs or bodies. Requests for Pro/paid ids are blocked and no request is made to pro.magicui.design.

## Refero Styles

Refero Terms of Use: https://doc.refero.design/legal/terms-of-use (last updated August 3, 2026). Refero Inc. owns the Refero Styles catalog, including the DESIGN.md files it prepares. This project does not own, relicense, or mirror that catalog. Screenshots, logos, trademarks, and product names remain with their respective owners.

Section 10 allows Refero Content to be used for lawful design research, inspiration, internal reference, and ordinary product design work, including commercial end products, and as reference material in client or internal design work. It does not allow resale, redistribution, or syndication of the content; scraping or systematic extraction outside documented download features; model training, fine-tuning, evaluation, or dataset creation; or publishing the catalog as a standalone library or competing product.

The public catalog pages used here are the homepage https://styles.refero.design/, the collection URLs listed in https://styles.refero.design/sitemaps/collections.xml under `/design-styles/` and `/examples/` when the query matches that page, and one style page `https://styles.refero.design/style/{uuid}`. Search returns the public card (name, north star, colors, fonts). `get_item` returns the DESIGN.md printed on that one public page. Full text of the summary shipped with the gate is `REFERO_STYLES_SUMMARY` in `src/compliance/texts.ts`.

The official Refero MCP at https://api.refero.design/mcp is a paid Pro, Team, or Lifetime interface (OAuth or Bearer token). This server does not call it and does not collect a Refero token. Requests that ask for that paid body are blocked, not `needs_token`. The site robots.txt disallows `/api/`, and those routes are behind a bot challenge. This server does not call `https://styles.refero.design/api/`.
