import type { TokenRequest, TokenRequirement } from "./compliance/token.js";

export const SOURCE_IDS = [
  "motionsites",
  "react-bits",
  "uiverse",
  "anime",
  "aceternity",
  "motion-prompt",
  "cult-ui",
  "magic-ui",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export type ComplianceStatus = "allowed" | "flagged" | "blocked" | "needs_token";

export type ContentKind = "metadata" | "source" | "docs" | "prompt";

export interface Compliance {
  sourceId: SourceId;
  itemId: string | null;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  status: ComplianceStatus;
  reason: string;
  warnings: string[];
  requiredNotices: string[];
  termsUrl: string;
  /** Present only when status is needs_token. */
  tokenRequest?: TokenRequest;
}

export interface Draft<T> {
  sourceId: SourceId;
  itemId: string | null;
  title: string;
  officialUrl: string;
  install: string;
  kind: ContentKind;
  licenseName: string | null;
  licenseUrl: string;
  attribution: string;
  termsUrl: string;
  requiredNotices: string[];
  redistribution: "allowed" | "forbidden";
  content: T | null;
  /** Text scanned for third-party notices. Defaults to string content. */
  scanText?: string | null;
  /** When set, the gate blocks and drops content. */
  block?: { reason: string };
  /**
   * When set, the required token/key is missing. The gate returns status
   * needs_token (not blocked), omits the body, and asks the user to configure or skip.
   */
  needsToken?: TokenRequirement;
  notes?: string[];
  /** Extra non-content fields that are safe to return even when content is blocked. */
  publicFields?: Record<string, unknown>;
}

export interface Released<T> {
  sourceId: SourceId;
  itemId: string | null;
  title: string;
  officialUrl: string;
  install: string;
  notes: string[];
  compliance: Compliance;
  content?: T;
  publicFields?: Record<string, unknown>;
  /** Present only when compliance.status is needs_token. */
  tokenRequest?: TokenRequest;
}

export interface SourceErrorBody {
  sourceId: SourceId;
  message: string;
  officialUrl: string;
  httpStatus?: number;
}

export interface EnvConfig {
  aceternityProToken?: string;
  reactBitsLicenseKey?: string;
  githubToken?: string;
  cacheTtlMs: number;
  transport: string;
  host: string;
  port: number;
}
