import type { CleanupPlan } from "@/lib/types";

function escapeCsv(value: string | number | boolean): string {
  const raw = String(value);
  const text =
    typeof value === "string" && /^[\t ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function cleanupPlanToCsv(plan: CleanupPlan): string {
  const header = [
    "group_id",
    "action",
    "recommended",
    "reason",
    "path",
    "filename",
    "extension",
    "size_bytes",
    "last_modified",
    "sha256",
  ];
  const rows = plan.items.map((item) => [
    item.groupId,
    item.action,
    item.recommended,
    item.reason,
    item.file.path,
    item.file.name,
    item.file.extension,
    item.file.size,
    item.file.modifiedAt ? new Date(item.file.modifiedAt).toISOString() : "",
    item.file.hash ?? "",
  ]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\r\n")}`;
}

export function cleanupPlanToJson(plan: CleanupPlan): string {
  return JSON.stringify(plan, null, 2);
}

export function downloadText(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
