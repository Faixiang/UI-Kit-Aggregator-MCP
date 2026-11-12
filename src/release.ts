import { gate } from "./compliance/gate.js";
import type { Draft, Released } from "./types.js";

export function release<T>(draft: Draft<T>, intendedUse?: string): Released<T> {
  const decision = gate({
    sourceId: draft.sourceId,
    itemId: draft.itemId,
    licenseName: draft.licenseName,
    licenseUrl: draft.licenseUrl,
    attribution: draft.attribution,
    termsUrl: draft.termsUrl,
    requiredNotices: draft.requiredNotices,
    content: draft.content,
    scanText: draft.scanText ?? (typeof draft.content === "string" ? draft.content : null),
    kind: draft.kind,
    intendedUse,
    redistribution: draft.redistribution,
    block: draft.block,
    needsToken: draft.needsToken,
  });

  const released: Released<T> = {
    sourceId: draft.sourceId,
    itemId: decision.compliance.itemId,
    title: draft.title,
    officialUrl: draft.officialUrl,
    install: draft.install,
    notes: draft.notes ?? [],
    compliance: decision.compliance,
  };
  if (
    (decision.compliance.status === "allowed" || decision.compliance.status === "flagged") &&
    decision.content !== null &&
    decision.content !== undefined
  ) {
    released.content = decision.content;
  }
  if (draft.publicFields) released.publicFields = draft.publicFields;
  if (decision.compliance.tokenRequest) released.tokenRequest = decision.compliance.tokenRequest;
  return released;
}
