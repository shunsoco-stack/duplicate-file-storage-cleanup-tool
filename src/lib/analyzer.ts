import type {
  AnalysisThresholds,
  CleanupPlan,
  CleanupPlanItem,
  DuplicateGroup,
  ReviewState,
  SameNameGroup,
  SimilarNamePair,
  StorageAnalysis,
  StorageBreakdown,
  StorageFile,
} from "@/lib/types";

const DAY_MS = 86_400_000;
const COPY_MARKERS = /(?:copy|backup|archive|bak|old|コピー|複製|\(\d+\)|[_\s-]\d+)\b/i;
const NON_ORIGINAL_PATH = /(?:^|\/)(?:backup|backups|archive|downloads?|temp|tmp)(?:\/|$)/i;

export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  largeBytes: 500 * 1024 * 1024,
  oldDays: 365,
};

export function getExtension(name: string): string {
  const normalized = name.trim();
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0 || dot === normalized.length - 1) return "";
  return normalized.slice(dot + 1).toLocaleLowerCase("ja-JP");
}

export function getParentFolder(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return "ルート";
  return parts[0];
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const precision = exponent === 0 ? 0 : decimals;
  return `${value.toLocaleString("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  })} ${units[exponent]}`;
}

export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

export function normalizeStem(name: string): string {
  const extension = getExtension(name);
  const withoutExtension = extension
    ? name.slice(0, -(extension.length + 1))
    : name;
  return withoutExtension
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[_-]+/g, " ")
    .replace(/\b(?:copy|backup|bak|old|final|latest|master|v\d+)\b/gi, "")
    .replace(/(?:コピー|複製|最終|最新版)/g, "")
    .replace(/\(\d+\)|[_\s-]+\d+$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function nameSimilarity(left: string, right: string): number {
  if (!left && !right) return 1;
  const maxLength = Math.max(left.length, right.length);
  return maxLength === 0 ? 1 : 1 - levenshtein(left, right) / maxLength;
}

function buildBreakdown(
  files: StorageFile[],
  keyFor: (file: StorageFile) => string,
): StorageBreakdown[] {
  const grouped = new Map<string, StorageFile[]>();
  for (const file of files) {
    const key = keyFor(file);
    const members = grouped.get(key) ?? [];
    members.push(file);
    grouped.set(key, members);
  }

  return [...grouped.entries()]
    .map(([key, members]) => ({
      key,
      label: key,
      count: members.length,
      bytes: members.reduce((sum, member) => sum + member.size, 0),
    }))
    .sort((left, right) => right.bytes - left.bytes || right.count - left.count);
}

function recommendKeep(files: StorageFile[]): {
  file: StorageFile;
  reasons: string[];
} {
  const sorted = [...files].sort((left, right) => {
    const leftPenalty =
      Number(COPY_MARKERS.test(left.name)) * 4 +
      Number(NON_ORIGINAL_PATH.test(left.path)) * 5;
    const rightPenalty =
      Number(COPY_MARKERS.test(right.name)) * 4 +
      Number(NON_ORIGINAL_PATH.test(right.path)) * 5;
    if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;

    const leftDepth = left.path.split("/").length;
    const rightDepth = right.path.split("/").length;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    if (left.path.length !== right.path.length) {
      return left.path.length - right.path.length;
    }
    return right.modifiedAt - left.modifiedAt;
  });

  const file = sorted[0];
  const reasons: string[] = [];
  if (!COPY_MARKERS.test(file.name)) reasons.push("copy表記のない名前");
  if (!NON_ORIGINAL_PATH.test(file.path)) reasons.push("原本フォルダらしいPath");
  const shortest = Math.min(...files.map((member) => member.path.length));
  if (file.path.length === shortest) reasons.push("Pathが短い");
  const newest = Math.max(...files.map((member) => member.modifiedAt));
  if (file.modifiedAt === newest) reasons.push("更新日時が新しい");
  return { file, reasons: reasons.slice(0, 3) };
}

function findDuplicateGroups(files: StorageFile[]): DuplicateGroup[] {
  const byHash = new Map<string, StorageFile[]>();
  for (const file of files) {
    if (!file.hash || file.hashStatus !== "hashed" || file.size === 0) continue;
    const members = byHash.get(file.hash) ?? [];
    members.push(file);
    byHash.set(file.hash, members);
  }

  return [...byHash.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([hash, members], index) => {
      const recommendation = recommendKeep(members);
      const totalSize = members.reduce((sum, member) => sum + member.size, 0);
      return {
        id: `D-${String(index + 1).padStart(3, "0")}`,
        hash,
        files: [...members].sort((left, right) => left.path.localeCompare(right.path, "ja")),
        totalSize,
        reclaimableSize: totalSize - members[0].size,
        recommendedKeepId: recommendation.file.id,
        recommendationReasons: recommendation.reasons,
      };
    })
    .sort((left, right) => right.reclaimableSize - left.reclaimableSize)
    .map((group, index) => ({
      ...group,
      id: `D-${String(index + 1).padStart(3, "0")}`,
    }));
}

function findSameNameGroups(files: StorageFile[]): SameNameGroup[] {
  const byName = new Map<string, StorageFile[]>();
  for (const file of files) {
    const key = normalizeName(file.name);
    const members = byName.get(key) ?? [];
    members.push(file);
    byName.set(key, members);
  }

  return [...byName.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([, members], index) => ({
      id: `N-${String(index + 1).padStart(3, "0")}`,
      name: members[0].name,
      files: members.sort((left, right) => left.path.localeCompare(right.path, "ja")),
    }))
    .sort((left, right) => right.files.length - left.files.length);
}

function findSimilarNamePairs(files: StorageFile[]): SimilarNamePair[] {
  const buckets = new Map<string, StorageFile[]>();
  for (const file of files) {
    const stem = normalizeStem(file.name);
    if (stem.length < 4) continue;
    const key = `${file.extension}|${stem.slice(0, 5)}`;
    const members = buckets.get(key) ?? [];
    if (members.length < 80) members.push(file);
    buckets.set(key, members);
  }

  const pairs: SimilarNamePair[] = [];
  const seen = new Set<string>();
  for (const members of buckets.values()) {
    for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
        const left = members[leftIndex];
        const right = members[rightIndex];
        if (normalizeName(left.name) === normalizeName(right.name)) continue;
        const leftStem = normalizeStem(left.name);
        const rightStem = normalizeStem(right.name);
        const score = leftStem === rightStem ? 0.98 : nameSimilarity(leftStem, rightStem);
        if (score < 0.72) continue;
        const key = [left.id, right.id].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ id: `S-${key}`, left, right, score });
      }
    }
  }

  return pairs
    .sort((left, right) => right.score - left.score)
    .slice(0, 24)
    .map((pair, index) => ({
      ...pair,
      id: `S-${String(index + 1).padStart(3, "0")}`,
    }));
}

function buildSizeBreakdown(files: StorageFile[]): StorageBreakdown[] {
  const buckets = [
    { key: "empty", label: "空ファイル", min: 0, max: 0 },
    { key: "small", label: "1 MB未満", min: 1, max: 1024 ** 2 - 1 },
    { key: "medium", label: "1–100 MB", min: 1024 ** 2, max: 100 * 1024 ** 2 - 1 },
    { key: "large", label: "100 MB–1 GB", min: 100 * 1024 ** 2, max: 1024 ** 3 - 1 },
    { key: "huge", label: "1 GB以上", min: 1024 ** 3, max: Number.POSITIVE_INFINITY },
  ];

  return buckets.map((bucket) => {
    const members = files.filter(
      (file) => file.size >= bucket.min && file.size <= bucket.max,
    );
    return {
      key: bucket.key,
      label: bucket.label,
      count: members.length,
      bytes: members.reduce((sum, member) => sum + member.size, 0),
    };
  });
}

export function analyzeStorage(
  files: StorageFile[],
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
  now = Date.now(),
): StorageAnalysis {
  const duplicateGroups = findDuplicateGroups(files);
  const duplicateFileIds = duplicateGroups.flatMap((group) =>
    group.files.map((file) => file.id),
  );
  const largeFiles = files
    .filter((file) => file.size >= thresholds.largeBytes)
    .sort((left, right) => right.size - left.size);
  const oldFiles = files
    .filter(
      (file) =>
        file.modifiedAt > 0 && now - file.modifiedAt >= thresholds.oldDays * DAY_MS,
    )
    .sort((left, right) => left.modifiedAt - right.modifiedAt);
  const emptyFiles = files.filter((file) => file.size === 0);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const reclaimableBytes = duplicateGroups.reduce(
    (sum, group) => sum + group.reclaimableSize,
    0,
  );

  return {
    summary: {
      fileCount: files.length,
      totalBytes,
      duplicateGroupCount: duplicateGroups.length,
      duplicateMemberCount: duplicateGroups.reduce(
        (sum, group) => sum + group.files.length,
        0,
      ),
      redundantCopyCount: duplicateGroups.reduce(
        (sum, group) => sum + group.files.length - 1,
        0,
      ),
      reclaimableBytes,
      largeFileCount: largeFiles.length,
      oldFileCount: oldFiles.length,
      emptyFileCount: emptyFiles.length,
      hashedFileCount: files.filter((file) => file.hashStatus === "hashed").length,
      hashErrorCount: files.filter((file) => file.hashStatus === "error").length,
    },
    duplicateGroups,
    sameNameGroups: findSameNameGroups(files),
    similarNamePairs: findSimilarNamePairs(files),
    largeFiles,
    oldFiles,
    emptyFiles,
    duplicateFileIds,
    extensionBreakdown: buildBreakdown(
      files,
      (file) => (file.extension ? `.${file.extension}` : "拡張子なし"),
    ),
    folderBreakdown: buildBreakdown(files, (file) => file.folder),
    sizeBreakdown: buildSizeBreakdown(files),
  };
}

export function isGroupReviewed(
  group: DuplicateGroup,
  decisions: ReviewState,
): boolean {
  const values = group.files.map((file) => decisions[file.id] ?? "undecided");
  return (
    values.every((decision) => decision !== "undecided") &&
    values.filter((decision) => decision === "keep").length >= 1
  );
}

export function buildCleanupPlan(
  analysis: StorageAnalysis,
  decisions: ReviewState,
  thresholds: AnalysisThresholds,
  source: StorageFile["source"],
  createdAt = new Date().toISOString(),
): CleanupPlan {
  const items: CleanupPlanItem[] = analysis.duplicateGroups.flatMap((group) =>
    group.files
      .filter((file) => (decisions[file.id] ?? "undecided") !== "undecided")
      .map((file) => ({
        groupId: group.id,
        action:
          decisions[file.id] === "candidate" ? "cleanup-candidate" : "keep",
        recommended: file.id === group.recommendedKeepId,
        reason:
          decisions[file.id] === "candidate"
            ? "Human Reviewで整理候補に指定"
            : file.id === group.recommendedKeepId
              ? group.recommendationReasons.join("・")
              : "Human Reviewで保持に指定",
        file,
      })),
  );

  const candidateItems = items.filter((item) => item.action === "cleanup-candidate");
  const plannedReclaimableBytes = candidateItems.reduce(
    (sum, item) => sum + item.file.size,
    0,
  );
  const reviewedGroupCount = analysis.duplicateGroups.filter((group) =>
    isGroupReviewed(group, decisions),
  ).length;

  return {
    schemaVersion: "1.0",
    createdAt,
    source,
    safetyMode: "plan-only",
    hashAlgorithm: "SHA-256",
    thresholds,
    summary: {
      ...analysis.summary,
      reviewedGroupCount,
      plannedCandidateCount: candidateItems.length,
      plannedReclaimableBytes,
      estimatedBytesAfterCleanup: Math.max(
        0,
        analysis.summary.totalBytes - plannedReclaimableBytes,
      ),
    },
    items,
  };
}
