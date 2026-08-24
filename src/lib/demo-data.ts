import { getExtension, getParentFolder } from "@/lib/analyzer";
import type { StorageFile } from "@/lib/types";

const KIB = 1024;
const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

function demoHash(seed: number): string {
  return seed.toString(16).padStart(64, "0");
}

function demoFile(
  id: string,
  path: string,
  size: number,
  modified: string,
  hashSeed: number,
): StorageFile {
  const normalizedPath = path.replace(/\\/g, "/");
  const name = normalizedPath.split("/").at(-1) ?? normalizedPath;
  const isExactHashCandidate = hashSeed >= 1 && hashSeed <= 6 && size > 0;
  return {
    id,
    name,
    extension: getExtension(name),
    size: Math.round(size),
    modifiedAt: new Date(`${modified}T09:00:00+09:00`).getTime(),
    path: normalizedPath,
    folder: getParentFolder(normalizedPath),
    source: "demo",
    hash: isExactHashCandidate ? demoHash(hashSeed) : undefined,
    hashStatus: isExactHashCandidate ? "hashed" : "skipped",
  };
}

/**
 * Concept Project用の完全な架空データです。
 * Hash値は重複グループを再現するfixtureで、実ファイルのdigestではありません。
 * 実スキャンではWeb Worker内でファイル内容からSHA-256を算出します。
 */
export const DEMO_FILES: StorageFile[] = [
  // D-001: 2.40 GiB × 2
  demoFile("f-001", "Projects/Atlas/exports/launch-film-final.mov", 2.4 * GIB, "2026-07-22", 1),
  demoFile("f-002", "Backups/2026-07/Atlas/launch-film-final-copy.mov", 2.4 * GIB, "2026-07-22", 1),

  // D-002: 420 MiB × 3
  demoFile("f-003", "Design/Brand/brand-assets.zip", 420 * MIB, "2026-06-18", 2),
  demoFile("f-004", "Shared/Marketing/brand-assets.zip", 420 * MIB, "2026-06-18", 2),
  demoFile("f-005", "Backups/2025/brand-assets (1).zip", 420 * MIB, "2025-01-13", 2),

  // D-003: 85.4 MiB × 3
  demoFile("f-006", "Photos/Events/kickoff-team.jpg", 85.4 * MIB, "2025-06-04", 3),
  demoFile("f-007", "Projects/Atlas/assets/kickoff-team-final.jpg", 85.4 * MIB, "2025-06-04", 3),
  demoFile("f-008", "Backups/Photos/kickoff-team_copy.jpg", 85.4 * MIB, "2024-11-19", 3),

  // D-004: 24.8 MiB × 2
  demoFile("f-009", "Finance/2024/annual-report.pdf", 24.8 * MIB, "2025-03-28", 4),
  demoFile("f-010", "Archive/Finance/annual-report-2024.pdf", 24.8 * MIB, "2025-03-28", 4),

  // D-005: 3.2 MiB × 3
  demoFile("f-011", "Finance/Budget/FY2026-budget.xlsx", 3.2 * MIB, "2026-07-01", 5),
  demoFile("f-012", "Shared/Finance/FY2026-budget-final.xlsx", 3.2 * MIB, "2026-07-01", 5),
  demoFile("f-013", "Downloads/FY2026-budget (2).xlsx", 3.2 * MIB, "2025-04-11", 5),

  // D-006: 684 KiB × 2
  demoFile("f-014", "Design/Brand/logo-master.svg", 684 * KIB, "2026-08-02", 6),
  demoFile("f-015", "Projects/Web/public/logo.svg", 684 * KIB, "2026-08-02", 6),

  // Large / Old / Empty / Same-name / Similar-name candidates
  demoFile("f-016", "Projects/Nova/raw/interview-master.mov", 3.8 * GIB, "2026-06-05", 116),
  demoFile("f-017", "Archive/Client-A/2022-delivery.zip", 1.6 * GIB, "2022-12-19", 117),
  demoFile("f-018", "Design/Campaign/spring-keyvisual.psd", 980 * MIB, "2026-03-22", 118),
  demoFile("f-019", "Videos/Tutorials/onboarding-v3.mp4", 620 * MIB, "2025-07-15", 119),
  demoFile("f-020", "Documents/Research/customer-interviews.pdf", 350 * MIB, "2024-09-14", 120),
  demoFile("f-021", "Data/Exports/customers-2026-08.csv", 128 * MIB, "2026-08-21", 121),
  demoFile("f-022", "Downloads/product-demo-final.mp4", 540 * MIB, "2026-08-02", 122),
  demoFile("f-023", "Projects/Atlas/video/product-demo_final.mp4", 538 * MIB, "2026-07-30", 123),
  demoFile("f-024", "Documents/Invoices/2025/invoice-summary.xlsx", 18 * MIB, "2025-01-10", 124),
  demoFile("f-025", "Shared/Operations/invoice-summary.xlsx", 19.4 * MIB, "2026-02-11", 125),
  demoFile("f-026", "Notes/migration-plan-final.docx", 1.8 * MIB, "2025-05-04", 126),
  demoFile("f-027", "Notes/migration-plan-final-v2.docx", 2 * MIB, "2026-06-14", 127),
  demoFile("f-028", "Projects/Web/cache/node_modules-cache.tar", 760 * MIB, "2024-01-08", 128),
  demoFile("f-029", "Screenshots/screen-recording-2024-02-16.mov", 1.05 * GIB, "2024-02-16", 129),
  demoFile("f-030", "Documents/empty-draft.txt", 0, "2026-08-10", 0),
  demoFile("f-031", "Exports/placeholder.csv", 0, "2024-03-03", 0),
  demoFile("f-032", "Projects/Atlas/assets/.keep", 0, "2025-12-01", 0),
  demoFile("f-033", "Documents/Readme.md", 15 * KIB, "2026-08-20", 133),
  demoFile("f-034", "Downloads/setup-old.dmg", 710 * MIB, "2023-02-18", 134),
  demoFile("f-035", "Audio/podcast-master.wav", 680 * MIB, "2026-04-02", 135),
  demoFile("f-036", "Photos/Library/IMG_4821.heic", 14.2 * MIB, "2026-05-11", 136),
  demoFile("f-037", "Photos/Library/IMG_4822.heic", 13.9 * MIB, "2026-05-11", 137),
  demoFile("f-038", "Code/archive/release-v1.tar.gz", 210 * MIB, "2023-06-08", 138),
  demoFile("f-039", "Shared/Legal/template-contract.pdf", 1.1 * MIB, "2025-09-10", 139),
  demoFile("f-040", "Projects/Nova/brief.txt", 40 * KIB, "2026-08-22", 140),
];

export const DEMO_SCAN_DATE = new Date("2026-08-24T10:30:00+09:00").getTime();
