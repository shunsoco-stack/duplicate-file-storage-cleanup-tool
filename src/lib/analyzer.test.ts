import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  analyzeStorage,
  buildCleanupPlan,
  formatBytes,
  normalizeStem,
} from "@/lib/analyzer";
import { DEMO_FILES, DEMO_SCAN_DATE } from "@/lib/demo-data";
import type { ReviewState } from "@/lib/types";

describe("storage analysis", () => {
  it("derives exact duplicate groups and impact from SHA-256", () => {
    const analysis = analyzeStorage(DEMO_FILES, DEFAULT_THRESHOLDS, DEMO_SCAN_DATE);
    expect(analysis.summary.fileCount).toBe(40);
    expect(analysis.summary.duplicateGroupCount).toBe(6);
    expect(analysis.summary.duplicateMemberCount).toBe(15);
    expect(analysis.summary.redundantCopyCount).toBe(9);
    expect(analysis.summary.emptyFileCount).toBe(3);
    expect(analysis.summary.largeFileCount).toBe(12);
    expect(analysis.summary.reclaimableBytes).toBeGreaterThan(3.4 * 1024 ** 3);
  });

  it("does not treat a matching filename with a different hash as exact duplicate", () => {
    const analysis = analyzeStorage(DEMO_FILES, DEFAULT_THRESHOLDS, DEMO_SCAN_DATE);
    const invoiceGroup = analysis.sameNameGroups.find(
      (group) => group.name === "invoice-summary.xlsx",
    );
    expect(invoiceGroup?.files).toHaveLength(2);
    expect(
      analysis.duplicateGroups.some((group) =>
        group.files.some((file) => file.name === "invoice-summary.xlsx"),
      ),
    ).toBe(false);
  });

  it("normalizes common copy suffixes for similar-name detection", () => {
    expect(normalizeStem("launch-film-final-copy.mov")).toBe(
      normalizeStem("launch_film_master.mov"),
    );
  });

  it("builds a plan only from explicit review decisions", () => {
    const analysis = analyzeStorage(DEMO_FILES, DEFAULT_THRESHOLDS, DEMO_SCAN_DATE);
    const first = analysis.duplicateGroups[0];
    const decisions: ReviewState = Object.fromEntries(
      first.files.map((file) => [
        file.id,
        file.id === first.recommendedKeepId ? "keep" : "candidate",
      ]),
    );
    const plan = buildCleanupPlan(
      analysis,
      decisions,
      DEFAULT_THRESHOLDS,
      "demo",
      "2026-08-24T01:30:00.000Z",
    );
    expect(plan.safetyMode).toBe("plan-only");
    expect(plan.summary.reviewedGroupCount).toBe(1);
    expect(plan.summary.plannedCandidateCount).toBe(first.files.length - 1);
    expect(plan.items.every((item) => item.groupId === first.id)).toBe(true);
  });

  it("formats binary storage units for the Japanese UI", () => {
    expect(formatBytes(2.4 * 1024 ** 3)).toBe("2.4 GB");
    expect(formatBytes(0)).toBe("0 B");
  });
});
