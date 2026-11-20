"use client";

import {
  Activity,
  Archive,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Database,
  Download,
  FileArchive,
  FileCheck2,
  FileSearch,
  Files,
  Filter,
  FolderOpen,
  HardDrive,
  Info,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Menu,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_THRESHOLDS,
  analyzeStorage,
  buildCleanupPlan,
  formatBytes,
  isGroupReviewed,
} from "@/lib/analyzer";
import { DEMO_FILES, DEMO_SCAN_DATE } from "@/lib/demo-data";
import {
  cleanupPlanToCsv,
  cleanupPlanToJson,
  downloadText,
} from "@/lib/export-report";
import {
  createStorageRecords,
  filesFromFileList,
  isPickerAbort,
  pickDirectoryFiles,
  supportsDirectoryPicker,
} from "@/lib/file-input";
import type {
  BrowserFileInput,
  CleanupPlan,
  DuplicateGroup,
  ReviewDecision,
  ReviewState,
  ScanSource,
  StorageFile,
} from "@/lib/types";
import { startHashing, type HashingTask, type HashProgress } from "@/lib/worker-client";

type ViewId = "scan" | "summary" | "duplicates" | "analysis" | "candidates" | "review";
type DuplicateTab = "exact" | "same" | "similar";
type CandidateFilter = "all" | "duplicate" | "large" | "old" | "empty";

interface NavigationItem {
  id: ViewId;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface ToastState {
  message: string;
  tone: "info" | "success" | "warning";
}

const NAVIGATION: NavigationItem[] = [
  { id: "summary", label: "Scan Summary", description: "全体像と効果", icon: LayoutDashboard },
  { id: "duplicates", label: "Duplicate Groups", description: "Hash・同名・類似", icon: Copy },
  { id: "analysis", label: "Storage Analysis", description: "容量の内訳", icon: BarChart3 },
  { id: "candidates", label: "整理候補", description: "大容量・古い・空", icon: Filter },
  { id: "review", label: "Cleanup Review", description: "人が判断して計画化", icon: ListChecks },
];

const WORKFLOW = [
  { label: "Scan", view: "scan" as ViewId },
  { label: "Hash / Metadata", view: "summary" as ViewId },
  { label: "重複Group", view: "duplicates" as ViewId },
  { label: "容量分析", view: "analysis" as ViewId },
  { label: "整理候補", view: "candidates" as ViewId },
  { label: "Human Review", view: "review" as ViewId },
  { label: "実行計画", view: "review" as ViewId },
  { label: "Report", view: "review" as ViewId },
];

const CHART_COLORS = ["#146df5", "#36b6a6", "#7759d8", "#f49c3f", "#e76575", "#7791ad"];

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(timestamp: number): string {
  return timestamp > 0 ? dateFormatter.format(timestamp) : "不明";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

function shortHash(hash?: string): string {
  if (!hash) return "未解析";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getSourceLabel(source?: ScanSource): string {
  if (source === "demo") return "Demo Data";
  if (source === "directory") return "Folder Scan";
  if (source === "drop") return "Drop Scan";
  if (source === "files") return "File Scan";
  return "未スキャン";
}

function StorageMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "storage-mark storage-mark--compact" : "storage-mark"} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path d="M13 8.5h14l7 7v19.5a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V12.5a4 4 0 0 1 4-4Z" fill="currentColor" opacity=".3" />
        <path d="M27 8.5v7h7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M18 19h9M18 25h7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="32.5" cy="31.5" r="8" fill="#fff" stroke="currentColor" strokeWidth="2.6" />
        <path d="m38.2 37.2 4.3 4.3M29.5 29.5h6M29.5 33.5h6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "purple" | "red";
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-heading__description">{description}</p>
      </div>
      {actions ? <div className="page-heading__actions">{actions}</div> : null}
    </div>
  );
}

function EmptyPanel({ onScan }: { onScan: () => void }) {
  return (
    <section className="empty-panel" aria-labelledby="empty-title">
      <div className="empty-panel__icon"><FileSearch size={26} /></div>
      <h2 id="empty-title">解析結果がありません</h2>
      <p>新しいスキャンを始めるか、架空データのDemo Modeをお試しください。</p>
      <button className="button button--primary" type="button" onClick={onScan}>
        <ScanSearch size={17} /> スキャンへ戻る
      </button>
    </section>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__icon"><Icon size={17} /></span>
      </div>
      <strong className="stat-card__value">{value}</strong>
      <span className="stat-card__detail">{detail}</span>
    </article>
  );
}

function FileGlyph({ extension }: { extension: string }) {
  const archive = ["zip", "tar", "gz", "7z", "rar"].includes(extension);
  const Icon = archive ? FileArchive : Files;
  return (
    <span className={`file-glyph file-glyph--${extension || "other"}`} aria-hidden="true">
      <Icon size={17} />
      <small>{extension ? extension.slice(0, 4).toUpperCase() : "FILE"}</small>
    </span>
  );
}

function DecisionControl({
  decision,
  onChange,
  compact = false,
}: {
  decision: ReviewDecision;
  onChange: (decision: Exclude<ReviewDecision, "undecided">) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "decision-control decision-control--compact" : "decision-control"} aria-label="レビュー判断">
      <button
        className={decision === "keep" ? "is-active is-keep" : ""}
        type="button"
        aria-pressed={decision === "keep"}
        onClick={() => onChange("keep")}
      >
        <Check size={14} /> 保持
      </button>
      <button
        className={decision === "candidate" ? "is-active is-candidate" : ""}
        type="button"
        aria-pressed={decision === "candidate"}
        onClick={() => onChange("candidate")}
      >
        <Archive size={14} /> 整理候補
      </button>
    </div>
  );
}

export default function StorageWorkbench() {
  const [activeView, setActiveView] = useState<ViewId>("scan");
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [scanCompletedAt, setScanCompletedAt] = useState<number | undefined>();
  const [scanSource, setScanSource] = useState<ScanSource | undefined>();
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [reviewState, setReviewState] = useState<ReviewState>({});
  const [cleanupPlan, setCleanupPlan] = useState<CleanupPlan | undefined>();
  const [exported, setExported] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<HashProgress | undefined>();
  const [scanError, setScanError] = useState<string | undefined>();
  const [directorySupported, setDirectorySupported] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | undefined>();
  const [confirmPlanOpen, setConfirmPlanOpen] = useState(false);
  const [duplicateTab, setDuplicateTab] = useState<DuplicateTab>("exact");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["D-001"]));
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>("all");
  const [extensionFilter, setExtensionFilter] = useState("all");
  const [candidateSearch, setCandidateSearch] = useState("");
  const deferredCandidateSearch = useDeferredValue(candidateSearch);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const hashingTaskRef = useRef<HashingTask | undefined>(undefined);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const analysis = useMemo(
    () => analyzeStorage(files, thresholds, scanCompletedAt ?? DEMO_SCAN_DATE),
    [files, thresholds, scanCompletedAt],
  );

  const navigate = useCallback((view: ViewId) => {
    setActiveView(view);
    setMobileNavOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", view);
      window.history.replaceState({}, "", url);
    }
  }, []);

  const loadDemo = useCallback((requestedView: ViewId = "summary") => {
    setFiles(DEMO_FILES);
    setScanCompletedAt(DEMO_SCAN_DATE);
    setScanSource("demo");
    setReviewState({});
    setCleanupPlan(undefined);
    setExported(false);
    setScanError(undefined);
    setActiveView(requestedView);
    setToast({ message: "40件の架空ファイルでDemo Modeを開始しました。", tone: "success" });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDirectorySupported(supportsDirectoryPicker());
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get("view") as ViewId | null;
      const validView = ["scan", "summary", "duplicates", "analysis", "candidates", "review"].includes(
        requestedView ?? "",
      )
        ? requestedView ?? "summary"
        : "summary";
      if (params.get("demo") === "1") loadDemo(validView);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadDemo]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!confirmPlanOpen) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setConfirmPlanOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmPlanOpen]);

  const scanInputs = useCallback(
    async (inputs: BrowserFileInput[], source: Exclude<ScanSource, "demo">) => {
      if (!inputs.length) {
        setScanError("読み込めるファイルがありませんでした。");
        return;
      }

      setIsScanning(true);
      setScanError(undefined);
      setReviewState({});
      setCleanupPlan(undefined);
      setExported(false);
      const { records, filesById } = createStorageRecords(inputs, source);
      setScanProgress({
        processedFiles: 0,
        totalFiles: records.length,
        processedBytes: 0,
        totalBytes: records.reduce((sum, record) => sum + record.size, 0),
        currentName: "メタデータを整理しています",
      });

      try {
        const task = startHashing(records, filesById, setScanProgress);
        hashingTaskRef.current = task;
        const hashedRecords = await task.promise;
        setFiles(hashedRecords);
        setScanSource(source);
        setScanCompletedAt(Date.now());
        setIsScanning(false);
        hashingTaskRef.current = undefined;
        navigate("summary");
        setToast({
          message: `${hashedRecords.length.toLocaleString("ja-JP")}件のローカル解析が完了しました。`,
          tone: "success",
        });
      } catch (reason) {
        setIsScanning(false);
        hashingTaskRef.current = undefined;
        if (isPickerAbort(reason)) {
          setToast({ message: "スキャンを中止しました。ファイルは保存されていません。", tone: "info" });
        } else {
          setScanError(reason instanceof Error ? reason.message : "ファイル解析に失敗しました。");
        }
      }
    },
    [navigate],
  );

  const handleDirectoryPick = async () => {
    if (!directorySupported) {
      folderInputRef.current?.click();
      return;
    }
    try {
      const inputs = await pickDirectoryFiles();
      await scanInputs(inputs, "directory");
    } catch (reason) {
      if (!isPickerAbort(reason)) {
        setScanError(reason instanceof Error ? reason.message : "フォルダを開けませんでした。");
      }
    }
  };

  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
    source: "files" | "directory",
  ) => {
    if (!event.target.files?.length) return;
    await scanInputs(filesFromFileList(event.target.files), source);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!event.dataTransfer.files.length) return;
    await scanInputs(filesFromFileList(event.dataTransfer.files), "drop");
  };

  const cancelScan = () => hashingTaskRef.current?.cancel();

  const startNewScan = () => {
    const hasWork = Object.values(reviewState).some((decision) => decision !== "undecided");
    if (hasWork && !window.confirm("現在のレビュー判断を破棄して、新しいスキャンを始めますか？")) {
      return;
    }
    setFiles([]);
    setScanSource(undefined);
    setScanCompletedAt(undefined);
    setReviewState({});
    setCleanupPlan(undefined);
    setScanError(undefined);
    setScanProgress(undefined);
    navigate("scan");
  };

  const setDecision = (group: DuplicateGroup, fileId: string, decision: Exclude<ReviewDecision, "undecided">) => {
    if (decision === "candidate") {
      const otherKeepExists = group.files.some(
        (file) => file.id !== fileId && reviewState[file.id] === "keep",
      );
      const undecidedOtherExists = group.files.some(
        (file) => file.id !== fileId && (reviewState[file.id] ?? "undecided") === "undecided",
      );
      if (!otherKeepExists && !undecidedOtherExists) {
        setToast({ message: "各グループに最低1件の保持ファイルが必要です。", tone: "warning" });
        return;
      }
    }
    setReviewState((current) => ({ ...current, [fileId]: decision }));
    setCleanupPlan(undefined);
    setExported(false);
  };

  const applyRecommendation = (group: DuplicateGroup) => {
    setReviewState((current) => {
      const next = { ...current };
      group.files.forEach((file) => {
        next[file.id] = file.id === group.recommendedKeepId ? "keep" : "candidate";
      });
      return next;
    });
    setCleanupPlan(undefined);
    setExported(false);
    setToast({ message: `${group.id} の保持候補をレビュー判断へ反映しました。`, tone: "success" });
  };

  const applyAllRecommendations = () => {
    const next: ReviewState = {};
    analysis.duplicateGroups.forEach((group) => {
      group.files.forEach((file) => {
        next[file.id] = file.id === group.recommendedKeepId ? "keep" : "candidate";
      });
    });
    setReviewState(next);
    setCleanupPlan(undefined);
    setExported(false);
    setToast({ message: `${analysis.duplicateGroups.length}グループの保持候補を明示的な判断として反映しました。`, tone: "success" });
  };

  const reviewedGroupCount = analysis.duplicateGroups.filter((group) =>
    isGroupReviewed(group, reviewState),
  ).length;
  const plannedCandidateFiles = files.filter((file) => reviewState[file.id] === "candidate");
  const plannedBytes = plannedCandidateFiles.reduce((sum, file) => sum + file.size, 0);
  const keepCount = files.filter((file) => reviewState[file.id] === "keep").length;
  const undecidedMemberCount = analysis.duplicateGroups
    .flatMap((group) => group.files)
    .filter((file) => (reviewState[file.id] ?? "undecided") === "undecided").length;
  const allGroupsReviewed =
    analysis.duplicateGroups.length > 0 && reviewedGroupCount === analysis.duplicateGroups.length;

  const createPlan = () => {
    if (!allGroupsReviewed || !scanSource) return;
    const plan = buildCleanupPlan(analysis, reviewState, thresholds, scanSource);
    setCleanupPlan(plan);
    setConfirmPlanOpen(false);
    setToast({ message: "Cleanup Planを作成しました。実ファイルへの変更はありません。", tone: "success" });
  };

  const exportPlan = (format: "csv" | "json") => {
    if (!cleanupPlan) return;
    const stamp = cleanupPlan.createdAt.slice(0, 10);
    if (format === "csv") {
      downloadText(cleanupPlanToCsv(cleanupPlan), `cleanup-plan-${stamp}.csv`, "text/csv");
    } else {
      downloadText(cleanupPlanToJson(cleanupPlan), `cleanup-plan-${stamp}.json`, "application/json");
    }
    setExported(true);
    setToast({ message: `${format.toUpperCase()} Reportを書き出しました。`, tone: "success" });
  };

  const duplicateIdSet = useMemo(
    () => new Set(analysis.duplicateFileIds),
    [analysis.duplicateFileIds],
  );
  const largeIdSet = useMemo(
    () => new Set(analysis.largeFiles.map((file) => file.id)),
    [analysis.largeFiles],
  );
  const oldIdSet = useMemo(
    () => new Set(analysis.oldFiles.map((file) => file.id)),
    [analysis.oldFiles],
  );
  const emptyIdSet = useMemo(
    () => new Set(analysis.emptyFiles.map((file) => file.id)),
    [analysis.emptyFiles],
  );

  const candidateFiles = useMemo(() => {
    const search = deferredCandidateSearch.normalize("NFKC").toLocaleLowerCase("ja-JP");
    return files
      .filter((file) => {
        const isCandidate =
          duplicateIdSet.has(file.id) ||
          largeIdSet.has(file.id) ||
          oldIdSet.has(file.id) ||
          emptyIdSet.has(file.id);
        if (!isCandidate) return false;
        if (candidateFilter === "duplicate" && !duplicateIdSet.has(file.id)) return false;
        if (candidateFilter === "large" && !largeIdSet.has(file.id)) return false;
        if (candidateFilter === "old" && !oldIdSet.has(file.id)) return false;
        if (candidateFilter === "empty" && !emptyIdSet.has(file.id)) return false;
        if (extensionFilter !== "all" && file.extension !== extensionFilter) return false;
        if (search && !`${file.name} ${file.path}`.normalize("NFKC").toLocaleLowerCase("ja-JP").includes(search)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path, "ja"));
  }, [
    candidateFilter,
    deferredCandidateSearch,
    duplicateIdSet,
    emptyIdSet,
    extensionFilter,
    files,
    largeIdSet,
    oldIdSet,
  ]);

  const extensions = useMemo(
    () => [...new Set(files.map((file) => file.extension).filter(Boolean))].sort(),
    [files],
  );

  const renderScan = () => (
    <div className="scan-page" data-screen="scan">
      <section className="scan-hero">
        <div className="scan-hero__copy">
          <Badge tone="green"><LockKeyhole size={13} /> LOCAL-FIRST</Badge>
          <h1>眠っている容量を、<br />端末の中だけで見つける。</h1>
          <p>
            ファイル名ではなく内容をSHA-256で照合。重複・大容量・古い・空ファイルを整理し、
            人が確認できるCleanup Planへまとめます。
          </p>
          <div className="scan-hero__trust">
            <span><ShieldCheck size={16} /> サーバー送信なし</span>
            <span><CheckCircle2 size={16} /> 自動削除なし</span>
            <span><Activity size={16} /> Workerで非同期解析</span>
          </div>
        </div>
        <div className="scan-hero__visual" aria-hidden="true">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="scan-visual__card scan-visual__card--back"><Files size={36} /></div>
          <div className="scan-visual__card scan-visual__card--front"><FileSearch size={42} /></div>
          <span className="scan-visual__match"><Check size={16} /> MATCH</span>
        </div>
      </section>

      <section
        className={`drop-zone${isScanning ? " is-scanning" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        aria-labelledby="input-title"
      >
        {isScanning && scanProgress ? (
          <div className="scan-progress" aria-live="polite">
            <div className="scan-progress__header">
              <span className="scan-progress__spinner"><RefreshCw size={20} /></span>
              <div>
                <p className="eyebrow">HASH / METADATA</p>
                <h2 id="input-title">ローカル解析中</h2>
              </div>
              <strong>
                {Math.round(
                  clamp(
                    scanProgress.totalBytes > 0
                      ? (scanProgress.processedBytes / scanProgress.totalBytes) * 100
                      : (scanProgress.processedFiles / Math.max(scanProgress.totalFiles, 1)) * 100,
                    0,
                    100,
                  ),
                )}%
              </strong>
            </div>
            <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamp(scanProgress.totalBytes > 0 ? (scanProgress.processedBytes / scanProgress.totalBytes) * 100 : (scanProgress.processedFiles / Math.max(scanProgress.totalFiles, 1)) * 100, 0, 100))}>
              <span style={{ width: `${clamp(scanProgress.totalBytes > 0 ? (scanProgress.processedBytes / scanProgress.totalBytes) * 100 : (scanProgress.processedFiles / Math.max(scanProgress.totalFiles, 1)) * 100, 0, 100)}%` }} />
            </div>
            <div className="scan-progress__meta">
              <span>{scanProgress.processedFiles.toLocaleString("ja-JP")} / {scanProgress.totalFiles.toLocaleString("ja-JP")} files</span>
              <span className="truncate">{scanProgress.currentName}</span>
              <span>{formatBytes(scanProgress.processedBytes)} 読取</span>
            </div>
            <button className="button button--quiet" type="button" onClick={cancelScan}>スキャンを中止</button>
          </div>
        ) : (
          <>
            <span className="drop-zone__icon"><Upload size={25} /></span>
            <div>
              <p className="eyebrow">SCAN INPUT</p>
              <h2 id="input-title">フォルダを選択、またはここへドロップ</h2>
              <p>読取権限はこの処理中だけ使用します。ファイル内容を保存したり、外部サーバーへ送信したりすることはありません。本番ページ末尾の広告配信（忍者AdMax）は、ファイル内容とは無関係です。</p>
            </div>
            <div className="drop-zone__actions">
              <button className="button button--primary" type="button" onClick={handleDirectoryPick}>
                <FolderOpen size={17} /> フォルダを選択
              </button>
              <button className="button button--secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                <Files size={17} /> 複数ファイルを選択
              </button>
              <button className="button button--demo" type="button" onClick={() => loadDemo("summary")}>
                <Sparkles size={17} /> Demo Dataで試す
              </button>
            </div>
            <p className="drop-zone__support">
              {directorySupported
                ? "このブラウザはFile System Access APIに対応しています。"
                : "Folder Picker未対応のため、複数File SelectへFallbackします。"}
            </p>
          </>
        )}
        <input ref={fileInputRef} className="visually-hidden" type="file" multiple onChange={(event) => handleFileChange(event, "files")} />
        <input
          ref={folderInputRef}
          className="visually-hidden"
          type="file"
          multiple
          {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={(event) => handleFileChange(event, "directory")}
        />
      </section>

      {scanError ? (
        <div className="alert alert--error" role="alert">
          <TriangleAlert size={18} />
          <div><strong>スキャンを完了できませんでした</strong><p>{scanError}</p></div>
          <button type="button" aria-label="エラーを閉じる" onClick={() => setScanError(undefined)}><X size={17} /></button>
        </div>
      ) : null}

      <section className="principle-grid" aria-label="解析方式">
        <article><span><Database size={19} /></span><h3>Metadata</h3><p>名前・拡張子・サイズ・更新日時・取得可能な相対Pathを整理。</p></article>
        <article><span><Activity size={19} /></span><h3>SHA-256 Worker</h3><p>同一サイズ候補を4 MiBずつ読取り、UIを止めずに完全一致を判定。</p></article>
        <article><span><ListChecks size={19} /></span><h3>Human Review</h3><p>保持候補は根拠だけを提示。選択と最終判断は必ず利用者が行います。</p></article>
      </section>
    </div>
  );

  const renderSummary = () => {
    if (!files.length) return <EmptyPanel onScan={() => navigate("scan")} />;
    const { summary } = analysis;
    const afterBytes = Math.max(0, summary.totalBytes - summary.reclaimableBytes);
    const reclaimRate = summary.totalBytes > 0 ? (summary.reclaimableBytes / summary.totalBytes) * 100 : 0;
    const largestGroup = analysis.duplicateGroups[0];
    return (
      <div data-screen="scan-summary">
        <PageHeading
          eyebrow="SCAN SUMMARY"
          title="ストレージの全体像"
          description="HashとMetadataから、整理効果の大きい順に次のアクションを把握できます。"
          actions={<button className="button button--primary" type="button" onClick={() => navigate("duplicates")}>重複を確認 <ArrowRight size={16} /></button>}
        />

        <section className="stats-grid" aria-label="スキャン集計">
          <StatCard label="スキャン" value={`${summary.fileCount}`} detail="files" icon={ScanSearch} tone="blue" />
          <StatCard label="合計容量" value={formatBytes(summary.totalBytes)} detail={`${analysis.folderBreakdown.length} folders`} icon={HardDrive} tone="navy" />
          <StatCard label="重複グループ" value={`${summary.duplicateGroupCount}`} detail={`${summary.duplicateMemberCount} filesが参加`} icon={Copy} tone="purple" />
          <StatCard label="整理可能コピー" value={`${summary.redundantCopyCount}`} detail="保持分を除く" icon={Files} tone="amber" />
          <StatCard label="削減可能" value={formatBytes(summary.reclaimableBytes)} detail={`${formatPercent(reclaimRate)} of total`} icon={Archive} tone="green" />
          <StatCard label="巨大ファイル" value={`${summary.largeFileCount}`} detail={`${formatBytes(thresholds.largeBytes)}以上`} icon={Database} tone="rose" />
        </section>

        <section className="summary-layout">
          <article className="surface impact-card">
            <div className="surface__header">
              <div><p className="eyebrow">STORAGE IMPACT</p><h2>整理前と重複整理後</h2></div>
              <Badge tone="green">{formatPercent(reclaimRate)}削減可能</Badge>
            </div>
            <div className="impact-values">
              <div><span>現在</span><strong>{formatBytes(summary.totalBytes)}</strong></div>
              <ArrowRight size={21} />
              <div><span>整理後見込み</span><strong>{formatBytes(afterBytes)}</strong></div>
            </div>
            <div className="storage-meter" aria-label={`現在${formatBytes(summary.totalBytes)}、整理後見込み${formatBytes(afterBytes)}`}>
              <span className="storage-meter__keep" style={{ width: `${100 - reclaimRate}%` }} />
              <span className="storage-meter__reclaim" style={{ width: `${reclaimRate}%` }} />
            </div>
            <div className="meter-legend"><span><i className="legend-dot legend-dot--keep" />保持見込み {formatBytes(afterBytes)}</span><span><i className="legend-dot legend-dot--reclaim" />重複 {formatBytes(summary.reclaimableBytes)}</span></div>
          </article>

          <article className="surface insight-card">
            <div className="surface__header"><div><p className="eyebrow">PRIORITY INSIGHTS</p><h2>まず見るポイント</h2></div><Sparkles size={19} /></div>
            <ul className="insight-list">
              <li><span className="insight-rank">01</span><div><strong>最大グループだけで {largestGroup ? formatBytes(largestGroup.reclaimableSize) : "0 B"}</strong><p>{largestGroup?.files.find((file) => file.id === largestGroup.recommendedKeepId)?.name ?? "重複はありません"} を含む完全一致</p></div></li>
              <li><span className="insight-rank">02</span><div><strong>{summary.oldFileCount}件が{thresholds.oldDays}日以上未更新</strong><p>古いだけでは削除せず、用途を確認してください</p></div></li>
              <li><span className="insight-rank">03</span><div><strong>{summary.emptyFileCount}件の空ファイル</strong><p>.keep等の意図的な空ファイルにも注意が必要です</p></div></li>
            </ul>
          </article>
        </section>

        <section className="surface pipeline-card">
          <div className="pipeline-card__intro"><span className="pipeline-card__icon"><ShieldCheck size={21} /></span><div><p className="eyebrow">LOCAL PROCESSING</p><h2>解析はブラウザ内で完結</h2><p>Unique sizeはHash不要として省略し、内容一致があり得る候補だけをSHA-256照合します。</p></div></div>
          <div className="pipeline-metrics">
            <div><strong>{summary.fileCount}</strong><span>Metadata読取</span></div>
            <ChevronRight size={17} />
            <div><strong>{summary.hashedFileCount}</strong><span>SHA-256照合</span></div>
            <ChevronRight size={17} />
            <div><strong>{summary.duplicateGroupCount}</strong><span>Hash Group</span></div>
            <ChevronRight size={17} />
            <div><strong>0</strong><span>外部Upload</span></div>
          </div>
        </section>
      </div>
    );
  };

  const renderExactGroups = () => (
    <div className="duplicate-list">
      {analysis.duplicateGroups.map((group) => {
        const expanded = expandedGroups.has(group.id);
        const reviewed = isGroupReviewed(group, reviewState);
        return (
          <article className={`duplicate-card${expanded ? " is-expanded" : ""}`} key={group.id}>
            <button
              type="button"
              className="duplicate-card__summary"
              onClick={() => setExpandedGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                return next;
              })}
              aria-expanded={expanded}
            >
              <span className="duplicate-card__chevron">{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
              <span className="duplicate-card__title"><strong>{group.id}</strong><small>SHA-256 {shortHash(group.hash)}</small></span>
              <span className="duplicate-card__metric"><small>ファイル</small><strong>{group.files.length}</strong></span>
              <span className="duplicate-card__metric"><small>グループ合計</small><strong>{formatBytes(group.totalSize)}</strong></span>
              <span className="duplicate-card__metric duplicate-card__metric--accent"><small>削減可能</small><strong>{formatBytes(group.reclaimableSize)}</strong></span>
              <Badge tone={reviewed ? "green" : "neutral"}>{reviewed ? "レビュー済み" : "未判断"}</Badge>
            </button>
            {expanded ? (
              <div className="duplicate-card__body">
                <div className="recommendation-banner">
                  <span><Sparkles size={17} /></span>
                  <div><strong>保持候補: {group.files.find((file) => file.id === group.recommendedKeepId)?.name}</strong><p>{group.recommendationReasons.join("・")}。候補提示のみで、自動確定はしません。</p></div>
                  <button type="button" className="button button--small button--secondary" onClick={() => applyRecommendation(group)}>保持候補を採用</button>
                </div>
                <div className="duplicate-files">
                  {group.files.map((file) => {
                    const recommended = file.id === group.recommendedKeepId;
                    const decision = reviewState[file.id] ?? "undecided";
                    return (
                      <div className="duplicate-file-row" key={file.id}>
                        <FileGlyph extension={file.extension} />
                        <div className="file-primary"><strong>{file.name}</strong><span>{file.path}</span></div>
                        <div className="file-meta"><span>{formatDate(file.modifiedAt)}</span><strong>{formatBytes(file.size)}</strong></div>
                        {recommended ? <Badge tone="blue">保持候補</Badge> : <span className="badge-placeholder" />}
                        <DecisionControl compact decision={decision} onChange={(next) => setDecision(group, file.id, next)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );

  const renderSameNames = () => (
    <div className="name-groups">
      <div className="inline-notice"><Info size={17} /><span><strong>同名は内容一致とは限りません。</strong> Hashが異なるファイルは自動で重複扱いにしません。</span></div>
      {analysis.sameNameGroups.map((group) => (
        <article className="surface name-group" key={group.id}>
          <div className="name-group__header"><span className="name-group__icon"><Files size={19} /></span><div><p className="eyebrow">{group.id}</p><h3>{group.name}</h3></div><Badge tone="amber">{group.files.length} files</Badge></div>
          {group.files.map((file) => (
            <div className="name-file-row" key={file.id}><FileGlyph extension={file.extension} /><div><strong>{file.path}</strong><span>SHA-256 {shortHash(file.hash)}</span></div><span>{formatBytes(file.size)}</span></div>
          ))}
        </article>
      ))}
    </div>
  );

  const renderSimilarNames = () => (
    <div className="name-groups">
      <div className="inline-notice"><CircleHelp size={17} /><span><strong>類似名は確認のきっかけです。</strong> 正規化したStemの編集距離で候補化し、完全重複KPIには含めません。</span></div>
      {analysis.similarNamePairs.map((pair) => (
        <article className="surface similar-pair" key={pair.id}>
          <div className="similar-score"><strong>{Math.round(pair.score * 100)}</strong><span>% similar</span></div>
          <div className="similar-file"><FileGlyph extension={pair.left.extension} /><div><strong>{pair.left.name}</strong><span>{pair.left.path}</span></div></div>
          <span className="similar-link"><Copy size={17} /></span>
          <div className="similar-file"><FileGlyph extension={pair.right.extension} /><div><strong>{pair.right.name}</strong><span>{pair.right.path}</span></div></div>
          <Badge tone={pair.left.hash && pair.left.hash === pair.right.hash ? "green" : "neutral"}>{pair.left.hash && pair.left.hash === pair.right.hash ? "Hash一致" : "内容は別"}</Badge>
        </article>
      ))}
    </div>
  );

  const renderDuplicates = () => {
    if (!files.length) return <EmptyPanel onScan={() => navigate("scan")} />;
    return (
      <div data-screen="duplicate-groups">
        <PageHeading
          eyebrow="DUPLICATE GROUPS"
          title="内容一致と名前の衝突を分けて確認"
          description="完全重複はSHA-256だけで判定。同名・類似名は別レイヤーの確認候補です。"
          actions={<button className="button button--secondary" type="button" onClick={() => navigate("review")}><ListChecks size={16} /> Cleanup Review</button>}
        />
        <div className="segmented-tabs" role="tablist" aria-label="重複の種類">
          <button role="tab" aria-selected={duplicateTab === "exact"} className={duplicateTab === "exact" ? "is-active" : ""} type="button" onClick={() => setDuplicateTab("exact")}><ShieldCheck size={16} /> Hash一致 <span>{analysis.duplicateGroups.length}</span></button>
          <button role="tab" aria-selected={duplicateTab === "same"} className={duplicateTab === "same" ? "is-active" : ""} type="button" onClick={() => setDuplicateTab("same")}><Files size={16} /> 同名 <span>{analysis.sameNameGroups.length}</span></button>
          <button role="tab" aria-selected={duplicateTab === "similar"} className={duplicateTab === "similar" ? "is-active" : ""} type="button" onClick={() => setDuplicateTab("similar")}><Search size={16} /> 類似名 <span>{analysis.similarNamePairs.length}</span></button>
        </div>
        <div className="duplicate-summary-strip">
          <div><span>完全重複</span><strong>{analysis.summary.duplicateMemberCount} files</strong></div>
          <div><span>整理可能コピー</span><strong>{analysis.summary.redundantCopyCount} files</strong></div>
          <div><span>削減可能</span><strong>{formatBytes(analysis.summary.reclaimableBytes)}</strong></div>
          <div className="duplicate-summary-strip__safe"><ShieldCheck size={17} /><span>Hash一致のみ集計</span></div>
        </div>
        <div role="tabpanel">
          {duplicateTab === "exact" ? renderExactGroups() : duplicateTab === "same" ? renderSameNames() : renderSimilarNames()}
        </div>
      </div>
    );
  };

  const donutBackground = useMemo(() => {
    const top = analysis.extensionBreakdown.slice(0, 6);
    const total = Math.max(analysis.summary.totalBytes, 1);
    const segments = top.reduce<{ cursor: number; stops: string[] }>(
      (current, entry, index) => {
        const end = current.cursor + (entry.bytes / total) * 100;
        return {
          cursor: end,
          stops: [
            ...current.stops,
            `${CHART_COLORS[index]} ${current.cursor}% ${end}%`,
          ],
        };
      },
      { cursor: 0, stops: [] },
    );
    const stops =
      segments.cursor < 100
        ? [...segments.stops, `#e6ebf1 ${segments.cursor}% 100%`]
        : segments.stops;
    return `conic-gradient(${stops.join(", ")})`;
  }, [analysis.extensionBreakdown, analysis.summary.totalBytes]);

  const renderAnalysis = () => {
    if (!files.length) return <EmptyPanel onScan={() => navigate("scan")} />;
    const afterBytes = analysis.summary.totalBytes - analysis.summary.reclaimableBytes;
    const maxFolderBytes = Math.max(...analysis.folderBreakdown.map((entry) => entry.bytes), 1);
    const maxSizeBytes = Math.max(...analysis.sizeBreakdown.map((entry) => entry.bytes), 1);
    return (
      <div data-screen="storage-analysis">
        <PageHeading eyebrow="STORAGE ANALYSIS" title="容量の偏りを可視化" description="拡張子・Folder・サイズ帯を同じ集計データから比較します。" />
        <section className="analysis-top-grid">
          <article className="surface donut-card">
            <div className="surface__header"><div><p className="eyebrow">BY EXTENSION</p><h2>拡張子別</h2></div><Badge tone="neutral">{analysis.extensionBreakdown.length} types</Badge></div>
            <div className="donut-layout">
              <div className="donut" style={{ background: donutBackground }} role="img" aria-label="拡張子別容量のドーナツチャート"><div><strong>{formatBytes(analysis.summary.totalBytes)}</strong><span>total</span></div></div>
              <ul className="chart-legend">
                {analysis.extensionBreakdown.slice(0, 6).map((entry, index) => (
                  <li key={entry.key}><i style={{ background: CHART_COLORS[index] }} /><span>{entry.label}</span><strong>{formatBytes(entry.bytes)}</strong><small>{formatPercent((entry.bytes / Math.max(analysis.summary.totalBytes, 1)) * 100)}</small></li>
                ))}
              </ul>
            </div>
          </article>

          <article className="surface before-after-card">
            <div className="surface__header"><div><p className="eyebrow">BEFORE / AFTER</p><h2>重複整理の効果</h2></div><Archive size={20} /></div>
            <div className="capacity-comparison">
              <div><span>現在</span><strong>{formatBytes(analysis.summary.totalBytes)}</strong><div className="capacity-bar"><i style={{ width: "100%" }} /></div></div>
              <div><span>整理後見込み</span><strong>{formatBytes(afterBytes)}</strong><div className="capacity-bar capacity-bar--after"><i style={{ width: `${(afterBytes / Math.max(analysis.summary.totalBytes, 1)) * 100}%` }} /></div></div>
            </div>
            <div className="savings-callout"><span><Archive size={19} /></span><div><small>削減可能容量</small><strong>{formatBytes(analysis.summary.reclaimableBytes)}</strong></div><Badge tone="green">{formatPercent((analysis.summary.reclaimableBytes / Math.max(analysis.summary.totalBytes, 1)) * 100)}</Badge></div>
            <p className="card-note"><Info size={14} /> 完全重複で、各Groupから1件保持する場合の試算です。</p>
          </article>
        </section>

        <section className="analysis-bottom-grid">
          <article className="surface folder-chart">
            <div className="surface__header"><div><p className="eyebrow">BY FOLDER</p><h2>Folder別 上位</h2></div><FolderOpen size={20} /></div>
            <div className="bar-list">
              {analysis.folderBreakdown.slice(0, 8).map((entry, index) => (
                <div className="bar-row" key={entry.key}>
                  <div className="bar-row__label"><span>{entry.label}</span><small>{entry.count} files</small></div>
                  <div className="bar-row__track"><i style={{ width: `${(entry.bytes / maxFolderBytes) * 100}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} /></div>
                  <strong>{formatBytes(entry.bytes)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="surface size-chart">
            <div className="surface__header"><div><p className="eyebrow">BY FILE SIZE</p><h2>サイズ帯別</h2></div><Database size={20} /></div>
            <div className="size-bands">
              {analysis.sizeBreakdown.map((entry, index) => (
                <div className="size-band" key={entry.key}>
                  <div><span>{entry.label}</span><strong>{entry.count}</strong><small>files</small></div>
                  <div className="size-band__bar"><i style={{ width: `${entry.bytes === 0 ? 2 : Math.max(5, (entry.bytes / maxSizeBytes) * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} /></div>
                  <strong>{formatBytes(entry.bytes)}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  };

  const reasonsForFile = (file: StorageFile) => {
    const reasons: { label: string; tone: "blue" | "purple" | "amber" | "neutral" }[] = [];
    if (duplicateIdSet.has(file.id)) reasons.push({ label: "Duplicate", tone: "purple" });
    if (largeIdSet.has(file.id)) reasons.push({ label: "Large", tone: "blue" });
    if (oldIdSet.has(file.id)) reasons.push({ label: "Old", tone: "amber" });
    if (emptyIdSet.has(file.id)) reasons.push({ label: "Empty", tone: "neutral" });
    return reasons;
  };

  const renderCandidates = () => {
    if (!files.length) return <EmptyPanel onScan={() => navigate("scan")} />;
    const filterCounts: Record<CandidateFilter, number> = {
      all: new Set([...duplicateIdSet, ...largeIdSet, ...oldIdSet, ...emptyIdSet]).size,
      duplicate: duplicateIdSet.size,
      large: largeIdSet.size,
      old: oldIdSet.size,
      empty: emptyIdSet.size,
    };
    return (
      <div data-screen="large-old-files">
        <PageHeading eyebrow="CLEANUP CANDIDATES" title="整理候補を条件で絞り込む" description="大きい・古い・空という事実は示しますが、安全な削除を意味しません。" actions={<button className="button button--primary" type="button" onClick={() => navigate("review")}>Reviewへ <ArrowRight size={16} /></button>} />
        <section className="surface threshold-panel">
          <div className="threshold-panel__title"><SlidersHorizontal size={18} /><div><strong>検出ルール</strong><span>変更すると一覧とSummaryへ即時反映</span></div></div>
          <label className="threshold-field"><span>Large</span><input type="number" min={1} max={102400} value={Math.round(thresholds.largeBytes / 1024 ** 2)} onChange={(event) => setThresholds((current) => ({ ...current, largeBytes: clamp(Number(event.target.value) || 1, 1, 102400) * 1024 ** 2 }))} /><small>MB以上</small></label>
          <label className="threshold-field"><span>Old</span><input type="number" min={1} max={3650} value={thresholds.oldDays} onChange={(event) => setThresholds((current) => ({ ...current, oldDays: clamp(Number(event.target.value) || 1, 1, 3650) }))} /><small>日以上</small></label>
          <div className="threshold-panel__safe"><ShieldCheck size={16} /> 自動削除: OFF</div>
        </section>

        <section className="candidate-toolbar" aria-label="候補フィルタ">
          <div className="filter-chips">
            {(["all", "duplicate", "large", "old", "empty"] as CandidateFilter[]).map((filter) => (
              <button key={filter} className={candidateFilter === filter ? "is-active" : ""} type="button" onClick={() => setCandidateFilter(filter)}>
                {filter === "all" ? "すべて" : filter === "duplicate" ? "Duplicate" : filter === "large" ? "Large" : filter === "old" ? "Old" : "Empty"}
                <span>{filterCounts[filter]}</span>
              </button>
            ))}
          </div>
          <div className="candidate-toolbar__tools">
            <label className="search-field"><Search size={16} /><span className="visually-hidden">ファイルを検索</span><input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="名前・Pathを検索" /></label>
            <label className="select-field"><span className="visually-hidden">拡張子</span><select value={extensionFilter} onChange={(event) => setExtensionFilter(event.target.value)}><option value="all">すべての拡張子</option>{extensions.map((extension) => <option key={extension} value={extension}>.{extension}</option>)}</select><ChevronDown size={14} /></label>
          </div>
        </section>

        {candidateFilter === "empty" || candidateFiles.some((file) => file.size === 0) ? (
          <div className="inline-notice inline-notice--amber"><TriangleAlert size={17} /><span>空ファイルには `.keep` など意図的なものがあります。容量は増えないため、用途を確認してください。</span></div>
        ) : null}

        <section className="surface file-table-wrap">
          <div className="table-caption"><div><strong>{candidateFiles.length}件</strong><span>該当する整理候補</span></div><span>最大100件を表示</span></div>
          <div className="file-table" role="table" aria-label="整理候補ファイル">
            <div className="file-table__row file-table__head" role="row"><span role="columnheader">ファイル</span><span role="columnheader">Path</span><span role="columnheader">サイズ</span><span role="columnheader">更新日時</span><span role="columnheader">理由</span><span role="columnheader">判断</span></div>
            {candidateFiles.slice(0, 100).map((file) => (
              <div className="file-table__row" role="row" key={file.id}>
                <span className="table-file" role="cell"><FileGlyph extension={file.extension} /><strong>{file.name}</strong></span>
                <span className="table-path" role="cell" title={file.path}>{file.path}</span>
                <strong role="cell">{formatBytes(file.size)}</strong>
                <span role="cell">{formatDate(file.modifiedAt)}</span>
                <span className="reason-badges" role="cell">{reasonsForFile(file).map((reason) => <Badge key={reason.label} tone={reason.tone}>{reason.label}</Badge>)}</span>
                <span role="cell">{duplicateIdSet.has(file.id) ? <button className="table-action" type="button" onClick={() => navigate("review")}>Review <ChevronRight size={14} /></button> : <Badge tone="neutral">要確認</Badge>}</span>
              </div>
            ))}
          </div>
          {!candidateFiles.length ? <div className="table-empty"><FileSearch size={23} /><strong>条件に一致する候補はありません</strong><span>Filterや閾値を変更してください。</span></div> : null}
        </section>
      </div>
    );
  };

  const renderReview = () => {
    if (!files.length) return <EmptyPanel onScan={() => navigate("scan")} />;
    return (
      <div data-screen="cleanup-review">
        <PageHeading eyebrow="HUMAN REVIEW" title="人が判断し、Cleanup Planへ" description="保持候補は提案です。実ファイルへ触れず、確認済みの計画だけを書き出します。" actions={<button className="button button--secondary" type="button" onClick={applyAllRecommendations}><Sparkles size={16} /> 保持候補を一括採用</button>} />
        <div className="safety-banner"><span><ShieldCheck size={21} /></span><div><strong>この画面ではファイルを削除しません</strong><p>「整理候補」はCSV / JSONの実行計画へ記録されるだけです。元ファイルは変更されません。</p></div><Badge tone="green">PLAN ONLY</Badge></div>
        <section className="review-layout">
          <div className="review-groups">
            {analysis.duplicateGroups.map((group) => {
              const reviewed = isGroupReviewed(group, reviewState);
              return (
                <article className={`review-group${reviewed ? " is-reviewed" : ""}`} key={group.id}>
                  <div className="review-group__header">
                    <div className="review-group__id"><span>{reviewed ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}</span><div><p className="eyebrow">{group.id}</p><h2>{group.files.find((file) => file.id === group.recommendedKeepId)?.name ?? group.files[0].name}</h2></div></div>
                    <div className="review-group__impact"><small>削減可能</small><strong>{formatBytes(group.reclaimableSize)}</strong></div>
                    <Badge tone={reviewed ? "green" : "amber"}>{reviewed ? "レビュー済み" : "未判断"}</Badge>
                  </div>
                  <div className="review-recommendation"><Sparkles size={15} /><span><strong>保持候補:</strong> {group.files.find((file) => file.id === group.recommendedKeepId)?.name} — {group.recommendationReasons.join("・")}</span><button type="button" onClick={() => applyRecommendation(group)}>候補を採用</button></div>
                  <div className="review-file-list">
                    {group.files.map((file) => {
                      const decision = reviewState[file.id] ?? "undecided";
                      return (
                        <div className={`review-file${decision !== "undecided" ? ` is-${decision}` : ""}`} key={file.id}>
                          <FileGlyph extension={file.extension} />
                          <div className="file-primary"><strong>{file.name}</strong><span>{file.path}</span></div>
                          <div className="file-meta"><span>{formatDate(file.modifiedAt)}</span><strong>{formatBytes(file.size)}</strong></div>
                          <DecisionControl decision={decision} onChange={(next) => setDecision(group, file.id, next)} />
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="plan-summary" aria-label="Cleanup Planの集計">
            <div className="plan-summary__header"><div><p className="eyebrow">CLEANUP PLAN</p><h2>実行計画</h2></div><FileCheck2 size={21} /></div>
            <div className="review-progress-ring" style={{ "--review-progress": `${(reviewedGroupCount / Math.max(analysis.duplicateGroups.length, 1)) * 100}%` } as CSSProperties}>
              <div><strong>{reviewedGroupCount}/{analysis.duplicateGroups.length}</strong><span>groups reviewed</span></div>
            </div>
            <dl className="plan-stats">
              <div><dt><i className="status-dot status-dot--keep" />保持</dt><dd>{keepCount}</dd></div>
              <div><dt><i className="status-dot status-dot--candidate" />整理候補</dt><dd>{plannedCandidateFiles.length}</dd></div>
              <div><dt><i className="status-dot status-dot--undecided" />未判断</dt><dd>{undecidedMemberCount}</dd></div>
            </dl>
            <div className="plan-impact"><span>計画削減容量</span><strong>{formatBytes(plannedBytes)}</strong><small>整理後見込み {formatBytes(Math.max(0, analysis.summary.totalBytes - plannedBytes))}</small></div>
            {!allGroupsReviewed ? <p className="plan-hint"><Info size={14} /> 全グループで1件以上を保持し、残りも判断してください。</p> : null}
            <button className="button button--primary button--full" type="button" disabled={!allGroupsReviewed} onClick={() => setConfirmPlanOpen(true)}><FileCheck2 size={17} /> Cleanup Planを作成</button>
            <button className="button button--quiet button--full" type="button" disabled={!Object.keys(reviewState).length} onClick={() => { setReviewState({}); setCleanupPlan(undefined); setExported(false); }}>判断をクリア</button>
            {cleanupPlan ? (
              <div className="report-export">
                <div className="report-export__ready"><CheckCircle2 size={17} /><span><strong>Report ready</strong><small>実ファイルの変更なし</small></span></div>
                <div className="report-export__buttons"><button type="button" onClick={() => exportPlan("csv")}><Download size={15} /> CSV</button><button type="button" onClick={() => exportPlan("json")}><Download size={15} /> JSON</button></div>
              </div>
            ) : null}
          </aside>
        </section>
      </div>
    );
  };

  const renderView = () => {
    if (activeView === "scan") return renderScan();
    if (activeView === "summary") return renderSummary();
    if (activeView === "duplicates") return renderDuplicates();
    if (activeView === "analysis") return renderAnalysis();
    if (activeView === "candidates") return renderCandidates();
    return renderReview();
  };

  const currentNavigation = NAVIGATION.find((item) => item.id === activeView);
  const currentWorkflowIndex = activeView === "scan" ? 0 : activeView === "summary" ? 1 : activeView === "duplicates" ? 2 : activeView === "analysis" ? 3 : activeView === "candidates" ? 4 : cleanupPlan ? (exported ? 7 : 6) : 5;

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileNavOpen ? " is-open" : ""}`}>
        <div className="brand-lockup"><StorageMark /><div><strong>重複ファイル検出</strong><span>ストレージ整理ツール</span></div></div>
        <button className="new-scan-button" type="button" onClick={startNewScan}><ScanSearch size={18} /><span>新しいスキャン</span><kbd>⌘ N</kbd></button>
        <nav className="side-navigation" aria-label="メインナビゲーション">
          <p>WORKSPACE</p>
          {NAVIGATION.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button key={item.id} type="button" disabled={!files.length} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={() => navigate(item.id)}>
                <span className="side-navigation__icon"><Icon size={18} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span>{active ? <i /> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card"><span><LockKeyhole size={17} /></span><div><strong>Local processing</strong><p>Upload 0 bytes<br />自動削除なし</p></div><i className="privacy-pulse" /></div>
        <p className="sidebar-version">SHA-256 · Worker · v1.0</p>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="メニューを開閉" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><Menu size={20} /></button>
          <StorageMark compact />
          <div className="topbar__title"><span>{currentNavigation?.label ?? "Scan"}</span><small>{files.length ? `${analysis.summary.fileCount} files · ${formatBytes(analysis.summary.totalBytes)}` : "Ready to scan"}</small></div>
          <div className="topbar__meta">
            {scanSource ? <Badge tone={scanSource === "demo" ? "purple" : "green"}>{scanSource === "demo" ? <Sparkles size={12} /> : <LockKeyhole size={12} />}{getSourceLabel(scanSource)}</Badge> : null}
            {scanCompletedAt ? <span className="last-scan"><Clock3 size={14} /> {formatDate(scanCompletedAt)}</span> : null}
            <button className="topbar__scan" type="button" onClick={startNewScan}><ScanSearch size={16} /> Scan</button>
          </div>
        </header>

        {files.length ? (
          <nav className="workflow-rail" aria-label="Storage Cleanup Workflow">
            {WORKFLOW.map((step, index) => {
              const complete = index < currentWorkflowIndex || (index <= 4 && files.length > 0);
              const active = index === currentWorkflowIndex;
              return (
                <button key={`${step.label}-${index}`} type="button" className={`${complete ? "is-complete" : ""}${active ? " is-active" : ""}`} onClick={() => navigate(step.view)}>
                  <span>{complete ? <Check size={12} /> : index + 1}</span><small>{step.label}</small>{index < WORKFLOW.length - 1 ? <i /> : null}
                </button>
              );
            })}
          </nav>
        ) : null}

        <main id="main-content" className="main-content" tabIndex={-1}>{renderView()}</main>
        <footer className="app-footer"><span><ShieldCheck size={14} /> Local-first / Plan-only</span><span>Hash: SHA-256 · Chunk: 4 MiB · 外部通信なし</span><span>Concept Project</span></footer>
      </div>

      {mobileNavOpen ? <button className="nav-scrim" type="button" aria-label="メニューを閉じる" onClick={() => setMobileNavOpen(false)} /> : null}
      {toast ? <div className={`toast toast--${toast.tone}`} role="status"><span>{toast.tone === "success" ? <CheckCircle2 size={17} /> : toast.tone === "warning" ? <TriangleAlert size={17} /> : <Info size={17} />}</span>{toast.message}<button type="button" aria-label="通知を閉じる" onClick={() => setToast(undefined)}><X size={15} /></button></div> : null}

      {confirmPlanOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmPlanOpen(false); }}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <button className="confirm-dialog__close" type="button" aria-label="閉じる" onClick={() => setConfirmPlanOpen(false)}><X size={18} /></button>
            <span className="confirm-dialog__icon"><FileCheck2 size={25} /></span>
            <p className="eyebrow">PLAN CONFIRMATION</p>
            <h2 id="confirm-title">Cleanup Planを作成</h2>
            <p>{plannedCandidateFiles.length}件・{formatBytes(plannedBytes)}を整理候補として記録します。ファイルの削除や移動は行いません。</p>
            <dl><div><dt>保持</dt><dd>{keepCount} files</dd></div><div><dt>整理候補</dt><dd>{plannedCandidateFiles.length} files</dd></div><div><dt>安全モード</dt><dd>Plan only</dd></div></dl>
            <div className="confirm-dialog__notice"><ShieldCheck size={17} /> 実行前に、出力Reportをもう一度確認してください。</div>
            <div className="confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={() => setConfirmPlanOpen(false)}>戻る</button><button ref={confirmButtonRef} className="button button--primary" type="button" onClick={createPlan}>計画を作成 <ArrowRight size={16} /></button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
