export type ScanSource = "demo" | "directory" | "files" | "drop";

export type HashStatus = "pending" | "hashed" | "skipped" | "error";

export interface StorageFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  path: string;
  folder: string;
  source: ScanSource;
  hash?: string;
  hashStatus: HashStatus;
  hashError?: string;
}

export interface BrowserFileInput {
  file: File;
  path: string;
}

export interface DuplicateGroup {
  id: string;
  hash: string;
  files: StorageFile[];
  totalSize: number;
  reclaimableSize: number;
  recommendedKeepId: string;
  recommendationReasons: string[];
}

export interface SameNameGroup {
  id: string;
  name: string;
  files: StorageFile[];
}

export interface SimilarNamePair {
  id: string;
  left: StorageFile;
  right: StorageFile;
  score: number;
}

export interface StorageBreakdown {
  key: string;
  label: string;
  count: number;
  bytes: number;
}

export interface ScanSummary {
  fileCount: number;
  totalBytes: number;
  duplicateGroupCount: number;
  duplicateMemberCount: number;
  redundantCopyCount: number;
  reclaimableBytes: number;
  largeFileCount: number;
  oldFileCount: number;
  emptyFileCount: number;
  hashedFileCount: number;
  hashErrorCount: number;
}

export interface StorageAnalysis {
  summary: ScanSummary;
  duplicateGroups: DuplicateGroup[];
  sameNameGroups: SameNameGroup[];
  similarNamePairs: SimilarNamePair[];
  largeFiles: StorageFile[];
  oldFiles: StorageFile[];
  emptyFiles: StorageFile[];
  duplicateFileIds: string[];
  extensionBreakdown: StorageBreakdown[];
  folderBreakdown: StorageBreakdown[];
  sizeBreakdown: StorageBreakdown[];
}

export interface AnalysisThresholds {
  largeBytes: number;
  oldDays: number;
}

export type ReviewDecision = "keep" | "candidate" | "undecided";

export interface ReviewState {
  [fileId: string]: ReviewDecision;
}

export interface CleanupPlanItem {
  groupId: string;
  action: "keep" | "cleanup-candidate";
  recommended: boolean;
  reason: string;
  file: StorageFile;
}

export interface CleanupPlan {
  schemaVersion: "1.0";
  createdAt: string;
  source: ScanSource;
  safetyMode: "plan-only";
  hashAlgorithm: "SHA-256";
  thresholds: AnalysisThresholds;
  summary: ScanSummary & {
    reviewedGroupCount: number;
    plannedCandidateCount: number;
    plannedReclaimableBytes: number;
    estimatedBytesAfterCleanup: number;
  };
  items: CleanupPlanItem[];
}
