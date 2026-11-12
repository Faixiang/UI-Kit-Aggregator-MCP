/**
 * Uniform missing-token / ask-user flow for every source.
 * Hard license blocks (unclear licenses, disallowed prompts, Magic UI Pro,
 * and other catalogs this server does not support) must not use this path.
 */

export interface TokenRequirement {
  /** Product that issues the token, e.g. "Aceternity All-Access". */
  product: string;
  /** Process environment variable the server reads. Not collected in the tool call. */
  envVar: string;
  /** Official pages where the user can register or retrieve the token. */
  registerUrls: string[];
}

export interface TokenRequest {
  product: string;
  envVar: string;
  registerUrls: string[];
  askUser: "configure_or_skip";
  instructionToCaller: string;
}

/** Known official token gates. Future sources should add a requirement here or pass an equivalent object. */
export const ACETERNITY_ALL_ACCESS: TokenRequirement = {
  product: "Aceternity All-Access",
  envVar: "ACETERNITY_PRO_TOKEN",
  registerUrls: [
    "https://ui.aceternity.com/pricing",
    "https://ui.aceternity.com/pro",
    "https://ui.aceternity.com/dashboard/token",
  ],
};

export const REACT_BITS_PRO_ACCESS: TokenRequirement = {
  product: "React Bits Pro",
  envVar: "REACTBITS_LICENSE_KEY",
  registerUrls: [
    "https://www.reactbits.dev/pro",
    "https://pro.reactbits.dev/docs/installation",
  ],
};

export const TOKEN_CALLER_INSTRUCTION =
  "Ask the user that question. Only retry or fetch after the user confirms and the token is in place. If they skip, stop and do not fetch. Do not treat this as a quiet failure or a hard license block. This server does not collect the secret in the tool call; configure the environment variable outside this process.";

/**
 * Shared tool and server instruction for the calling AI.
 * Missing token → tell the user and ask configure vs skip. Hard blocks stay blocked.
 */
export const TOKEN_FLOW_INSTRUCTION =
  "When a source or item requires a token or license key that is not configured, the result status is \"needs_token\" (not \"blocked\" and not \"allowed\"). Do not treat that as a quiet failure. Tell the user that this specific content needs a token, name the product (for example Aceternity All-Access or React Bits Pro) and the environment variable (for example ACETERNITY_PRO_TOKEN or REACTBITS_LICENSE_KEY), point them to the official register URLs in the result, and ask whether to configure/add the token or skip this item. Only retry or fetch after the user confirms and the token is in place; if they skip, stop and do not fetch. This server does not collect the secret in the tool call. If the required token is already configured, fetch proceeds when the license otherwise allows it. Hard compliance blocks stay \"blocked\" with the body omitted: unclear licenses, disallowed scrape or prompt types, MotionSites prompt bodies, Magic UI Pro, Refero Styles paid MCP bodies, and other paid catalogs this server does not support, and redistribution the license forbids. Magic UI Pro and the paid Refero MCP are not missing-token cases and must not be offered as \"add a token\". There is no skip_license_check.";

export function tokenAskReason(requirement: TokenRequirement, itemLabel?: string | null): string {
  const target = itemLabel
    ? `This content (${itemLabel}) needs a ${requirement.product} token/key.`
    : `This content needs a ${requirement.product} token/key.`;
  return [
    target,
    `${requirement.envVar} is not configured on this server, so the body was not fetched.`,
    `Register or get a key at: ${requirement.registerUrls.join(" ")}.`,
    "Ask the user: configure/add the token, or skip this item?",
    TOKEN_CALLER_INSTRUCTION,
  ].join(" ");
}

export function buildTokenRequest(requirement: TokenRequirement): TokenRequest {
  return {
    product: requirement.product,
    envVar: requirement.envVar,
    registerUrls: [...requirement.registerUrls],
    askUser: "configure_or_skip",
    instructionToCaller: TOKEN_CALLER_INSTRUCTION,
  };
}
