import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, analyzeStorage, buildCleanupPlan } from "@/lib/analyzer";
import { DEMO_FILES, DEMO_SCAN_DATE } from "@/lib/demo-data";
import { cleanupPlanToCsv, cleanupPlanToJson } from "@/lib/export-report";
import type { ReviewState } from "@/lib/types";

describe("cleanup plan export", () => {
  it("exports portable CSV and JSON without dropping the SHA-256", () => {
    const analysis = analyzeStorage(DEMO_FILES, DEFAULT_THRESHOLDS, DEMO_SCAN_DATE);
    const group = analysis.duplicateGroups[0];
    const decisions: ReviewState = Object.fromEntries(
      group.files.map((file) => [
        file.id,
        file.id === group.recommendedKeepId ? "keep" : "candidate",
      ]),
    );
    const plan = buildCleanupPlan(
      analysis,
      decisions,
      DEFAULT_THRESHOLDS,
      "demo",
      "2026-08-24T01:30:00.000Z",
    );
    const csv = cleanupPlanToCsv(plan);
    const json = cleanupPlanToJson(plan);

    expect(csv).toContain("group_id,action,recommended");
    expect(csv).toContain(group.hash);
    expect(JSON.parse(json).safetyMode).toBe("plan-only");
    expect(JSON.parse(json).items).toHaveLength(group.files.length);
  });

  it("neutralizes spreadsheet formulas in file-controlled CSV fields", () => {
    const analysis = analyzeStorage(DEMO_FILES, DEFAULT_THRESHOLDS, DEMO_SCAN_DATE);
    const group = analysis.duplicateGroups[0];
    const decisions: ReviewState = Object.fromEntries(
      group.files.map((file) => [
        file.id,
        file.id === group.recommendedKeepId ? "keep" : "candidate",
      ]),
    );
    const plan = buildCleanupPlan(
      analysis,
      decisions,
      DEFAULT_THRESHOLDS,
      "demo",
      "2026-08-24T01:30:00.000Z",
    );
    plan.items[0].file = {
      ...plan.items[0].file,
      name: "=HYPERLINK(\"https://example.invalid\")",
      path: "+cmd|calc",
    };

    const csv = cleanupPlanToCsv(plan);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd|calc");
  });
});
