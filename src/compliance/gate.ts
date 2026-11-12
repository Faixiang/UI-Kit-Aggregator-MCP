import type { Compliance, ComplianceStatus, ContentKind, SourceId } from "../types.js";
import { buildTokenRequest, tokenAskReason, type TokenRequirement } from "./token.js";

export type UseClass = "end_product" | "redistribute" | "unspecified";

const REDISTRIBUTE = [
  /redistribut/,
  /republish/,
  /re-?licens/,
  /sublicens/,
  /resell/,
  /re-sell/,
  /\bsell\b[^.]{0,40}\b(component|library|kit|template|prompt|sound)s?\b/,
  /component library/,
  /component pack/,
  /ui kit/,
  /marketplace/,
  /template pack/,
  /stock (image|source|file)/,
  /give away/,
  /public repo/,
  /prompt collection/,
  /competing (library|template|kit)/,
  /mirror (the )?(catalog|registry|library)/,
  /hosted service/,
  /as a port/,
];

const END_PRODUCT = [
  /end product/,
  /marketing site/,
  /client/,
  /landing page/,
  /commercial/,
  /personal (project|site|app|website)/,
  /in (my|our|a|the) (app|site|website|product|project)/,
  /production (app|site|website)/,
  /saas/,
];

export function classifyUse(proposedUse: string | undefined): UseClass {
  const text = proposedUse?.trim().toLowerCase() ?? "";
  if (!text) return "unspecified";
  const redistribute = REDISTRIBUTE.some((pattern) => pattern.test(text));
  const endProduct = END_PRODUCT.some((pattern) => pattern.test(text));
  if (redistribute) return "redistribute";
  if (endProduct) return "end_product";
  return "unspecified";
}

export interface ThirdPartyFinding {
  obligation: string;
  /** The notice line itself. Callers must keep it, not strip it. */
  excerpt: string;
}

const NOTICE_RULES: Array<{ test: RegExp; obligation: string }> = [
  {
    test: /font[\s-]?awesome|fontawesome\.com/i,
    obligation:
      "Font Awesome assets are under their own license (icons: CC BY 4.0). Keep the Font Awesome notice and give attribution. https://fontawesome.com/license/free",
  },
  {
    test: /creativecommons\.org\/licenses\/by\/4\.0|CC\s*BY\s*4\.0/i,
    obligation:
      "A CC BY 4.0 notice is present. Credit the author and link the license. Do not remove the notice. https://creativecommons.org/licenses/by/4.0/",
  },
  {
    test: /simple[\s-]?icons/i,
    obligation:
      "A Simple Icons notice is present. Preserve it and follow that project's license (commonly CC0, but the notice in the file controls).",
  },
];

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const endBreak = text.indexOf("\n", index);
  const end = endBreak === -1 ? text.length : endBreak;
  return text.slice(start, end).trim().slice(0, 240);
}

export function scanThirdPartyNotices(text: string | null | undefined): ThirdPartyFinding[] {
  if (!text) return [];
  const findings: ThirdPartyFinding[] = [];
  const seen = new Set<string>();
  for (const rule of NOTICE_RULES) {
    const match = rule.test.exec(text);
    if (!match || match.index === undefined) continue;
    if (seen.has(rule.obligation)) continue;
    seen.add(rule.obligation);
    findings.push({ obligation: rule.obligation, excerpt: lineAround(text, match.index) });
  }
  const copyright = /copyright\s*(?:\(c\)|©)\s*[^\n]{0,160}/gi;
  for (const match of text.matchAll(copyright)) {
    const excerpt = match[0].trim().slice(0, 240);
    if (/uiverse\.io|julian garnier|david haz|shohei ohtaki|jordan-gilliam|jordan gilliam|nolly studio|magic ui|mit license/i.test(excerpt)) continue;
    const obligation = `Third-party copyright notice must be kept: ${excerpt}`;
    if (seen.has(obligation)) continue;
    seen.add(obligation);
    findings.push({ obligation, excerpt });
  }
  if (/all rights reserved/i.test(text) && !/mit license/i.test(text) && !/permission is hereby granted/i.test(text)) {
    findings.push({
      obligation:
        "The file says \"All rights reserved\" and does not include a known open-source grant. The license for this file is unclear, so the body was omitted.",
      excerpt: "All rights reserved",
    });
  }
  return findings;
}

export function licenseIsUnclear(licenseName: string | null | undefined): boolean {
  if (!licenseName?.trim()) return true;
  return /^(unknown|unclear)$/i.test(licenseName.trim()) || /license (is )?unclear|could not (be )?determine/i.test(licenseName);
}

export interface GateInput<T> {
  sourceId: SourceId;
  itemId: string | null;
  licenseName: string | null;
  licenseUrl: string;
  attribution: string;
  termsUrl: string;
  requiredNotices?: string[];
  content: T | null;
  scanText?: string | null;
  kind: ContentKind;
  intendedUse?: string;
  redistribution: "allowed" | "forbidden";
  block?: { reason: string };
  /**
   * Missing token/key for a source that officially supports one.
   * Distinct from `block`: the gate returns needs_token and asks the user
   * to configure the token or skip. The body is omitted and not fetched.
   */
  needsToken?: TokenRequirement;
  /** Present only so tests can prove it is ignored. Never honored. */
  skip_license_check?: unknown;
  skipLicenseCheck?: unknown;
}

export interface GateResult<T> {
  compliance: Compliance;
  content: T | null;
}

function base(input: GateInput<unknown>, status: ComplianceStatus, reason: string, warnings: string[]): Compliance {
  return {
    sourceId: input.sourceId,
    itemId: input.kind === "prompt" && status === "blocked" ? null : input.itemId,
    licenseName: input.licenseName?.trim() || "Unclear",
    licenseUrl: input.licenseUrl,
    attribution: input.attribution,
    status,
    reason,
    warnings,
    requiredNotices: input.requiredNotices ?? [],
    termsUrl: input.termsUrl,
  };
}

/**
 * Single license gate. There is no skip path. Blocked and needs_token results always have content null.
 * Flagged results keep the original content and add warnings. Unclear licenses are blocked, not flagged.
 * A missing token is needs_token (ask the user to configure or skip), not a silent blocked failure.
 */
export function gate<T>(input: GateInput<T>): GateResult<T> {
  const notices = input.requiredNotices ?? [];
  const unclear = licenseIsUnclear(input.licenseName);

  // Hard license blocks first. A missing token is never a substitute for these.
  if (input.block || input.kind === "prompt" || unclear) {
    const reason = input.block?.reason
      ?? (input.kind === "prompt"
        ? "Prompt text is not returned. Purchased and member prompts are under a personal, non-transferable license and may not be republished by this server."
        : "The license for this item could not be determined, so the content was omitted.");
    return {
      compliance: base(
        input,
        "blocked",
        reason,
        unclear && !input.block
          ? ["Unclear licenses are blocked, not flagged."]
          : [],
      ),
      content: null,
    };
  }

  if (input.needsToken) {
    const compliance = base(
      input,
      "needs_token",
      tokenAskReason(input.needsToken, input.itemId),
      [],
    );
    compliance.tokenRequest = buildTokenRequest(input.needsToken);
    return { compliance, content: null };
  }

  const use = classifyUse(input.intendedUse);
  if (input.redistribution === "forbidden" && use === "redistribute") {
    return {
      compliance: base(
        input,
        "blocked",
        "The proposed use redistributes the kit, prompts, or source itself. That is outside the license. Content was omitted.",
        ["Use in an end product (a website, app, or client project) is a different question from republishing the item as a library, template pack, or marketplace listing."],
      ),
      content: null,
    };
  }

  const scanTarget = input.scanText ?? (typeof input.content === "string" ? input.content : null);
  const findings = scanThirdPartyNotices(scanTarget);
  const unclearFinding = findings.find((finding) => /license for this file is unclear/i.test(finding.obligation));
  if (unclearFinding) {
    return {
      compliance: base(
        input,
        "blocked",
        "A notice in the file conflicts with the documented license, and the file-level license is unclear. Content was omitted.",
        [unclearFinding.obligation],
      ),
      content: null,
    };
  }

  if (findings.length > 0) {
    return {
      compliance: base(
        input,
        "flagged",
        "The base license is known. The file also carries a third-party notice with extra obligations. The notice was not removed.",
        findings.map((finding) => `${finding.obligation} Notice: ${finding.excerpt}`),
      ),
      content: input.content,
    };
  }

  const warnings: string[] = [];
  if (input.redistribution === "forbidden" && use === "unspecified" && input.intendedUse?.trim()) {
    warnings.push(
      "The proposed use was not specific enough to confirm it is only an end product. Redistributing this item as a library, template, or marketplace product would be blocked.",
    );
  }
  if (notices.length === 0 && (input.kind === "source" || input.kind === "docs")) {
    return {
      compliance: base(
        input,
        "blocked",
        "The license name is set, but no notice text was attached. Content was omitted rather than returned without attribution.",
        ["Call get_license and include the notice before copying this material."],
      ),
      content: null,
    };
  }

  return {
    compliance: base(
      input,
      "allowed",
      "License is known and this response is limited to what that license allows for an end product or for public metadata.",
      warnings,
    ),
    content: input.content,
  };
}
