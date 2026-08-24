import { getExtension, getParentFolder } from "@/lib/analyzer";
import type { BrowserFileInput, ScanSource, StorageFile } from "@/lib/types";

interface BrowserFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

interface BrowserDirectoryHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, BrowserFileHandle | BrowserDirectoryHandle]>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<BrowserDirectoryHandle>;
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

async function walkDirectory(
  directory: BrowserDirectoryHandle,
  prefix: string,
  output: BrowserFileInput[],
): Promise<void> {
  for await (const [name, handle] of directory.entries()) {
    const path = normalizePath(`${prefix}/${name}`);
    if (handle.kind === "file") {
      const file = await handle.getFile();
      output.push({ file, path });
    } else {
      await walkDirectory(handle, path, output);
    }
  }
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickDirectoryFiles(): Promise<BrowserFileInput[]> {
  const pickerWindow = window as DirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error("このブラウザはフォルダ選択APIに対応していません。");
  }
  const directory = await pickerWindow.showDirectoryPicker({ mode: "read" });
  const output: BrowserFileInput[] = [];
  await walkDirectory(directory, directory.name, output);
  return output;
}

export function filesFromFileList(fileList: FileList | File[]): BrowserFileInput[] {
  return Array.from(fileList).map((file) => {
    const relativePath = (file as File & { webkitRelativePath?: string })
      .webkitRelativePath;
    return {
      file,
      path: normalizePath(relativePath || file.name),
    };
  });
}

function stableId(source: ScanSource, input: BrowserFileInput, index: number): string {
  const value = `${input.path}\u0000${input.file.size}\u0000${input.file.lastModified}`;
  let hash = 2166136261;
  for (let position = 0; position < value.length; position += 1) {
    hash ^= value.charCodeAt(position);
    hash = Math.imul(hash, 16777619);
  }
  return `${source}-${index}-${(hash >>> 0).toString(36)}`;
}

export function createStorageRecords(
  inputs: BrowserFileInput[],
  source: Exclude<ScanSource, "demo">,
): { records: StorageFile[]; filesById: Map<string, File> } {
  const seen = new Set<string>();
  const records: StorageFile[] = [];
  const filesById = new Map<string, File>();

  inputs.forEach((input, inputIndex) => {
    const path = normalizePath(input.path || input.file.name);
    const identity = `${path}\u0000${input.file.size}\u0000${input.file.lastModified}`;
    if (seen.has(identity)) return;
    seen.add(identity);

    const id = stableId(source, { file: input.file, path }, inputIndex);
    const record: StorageFile = {
      id,
      name: input.file.name,
      extension: getExtension(input.file.name),
      size: input.file.size,
      modifiedAt: input.file.lastModified,
      path,
      folder: getParentFolder(path),
      source,
      hashStatus: "pending",
    };
    records.push(record);
    filesById.set(id, input.file);
  });

  return { records, filesById };
}

export function isPickerAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}
