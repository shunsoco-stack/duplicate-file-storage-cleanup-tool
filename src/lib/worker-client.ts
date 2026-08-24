import { IncrementalSha256 } from "@/lib/sha256";
import type { StorageFile } from "@/lib/types";
import {
  HASH_CHUNK_BYTES,
  type HashWorkerResponse,
} from "@/lib/worker-protocol";

export interface HashProgress {
  processedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalBytes: number;
  currentName: string;
}

export interface HashingTask {
  promise: Promise<StorageFile[]>;
  cancel: () => void;
}

async function fallbackHash(
  records: StorageFile[],
  filesById: Map<string, File>,
  onProgress: (progress: HashProgress) => void,
  signal: AbortSignal,
): Promise<StorageFile[]> {
  const sizeCounts = new Map<number, number>();
  records.forEach((record) =>
    sizeCounts.set(record.size, (sizeCounts.get(record.size) ?? 0) + 1),
  );
  const candidates = records.filter(
    (record) => record.size > 0 && (sizeCounts.get(record.size) ?? 0) > 1,
  );
  const totalBytes = candidates.reduce((sum, record) => sum + record.size, 0);
  let processedBytes = 0;
  const output: StorageFile[] = [];

  for (const record of records) {
    if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
    const file = filesById.get(record.id);
    const shouldHash =
      file && record.size > 0 && (sizeCounts.get(record.size) ?? 0) > 1;
    if (!file || !shouldHash) {
      output.push({ ...record, hashStatus: "skipped" });
    } else {
      try {
        const sha = new IncrementalSha256();
        for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
          const chunk = file.slice(offset, Math.min(file.size, offset + HASH_CHUNK_BYTES));
          const bytes = new Uint8Array(await chunk.arrayBuffer());
          sha.update(bytes);
          processedBytes += bytes.byteLength;
          onProgress({
            processedFiles: output.length,
            totalFiles: records.length,
            processedBytes,
            totalBytes,
            currentName: file.name,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        output.push({ ...record, hash: sha.digestHex(), hashStatus: "hashed" });
      } catch (reason) {
        output.push({
          ...record,
          hashStatus: "error",
          hashError: reason instanceof Error ? reason.message : "Hash calculation failed.",
        });
      }
    }
    onProgress({
      processedFiles: output.length,
      totalFiles: records.length,
      processedBytes,
      totalBytes,
      currentName: record.name,
    });
  }
  return output;
}

export function startHashing(
  records: StorageFile[],
  filesById: Map<string, File>,
  onProgress: (progress: HashProgress) => void,
): HashingTask {
  const controller = new AbortController();

  if (typeof Worker === "undefined") {
    return {
      promise: fallbackHash(records, filesById, onProgress, controller.signal),
      cancel: () => controller.abort(),
    };
  }

  let worker: Worker | undefined = new Worker(
    new URL("../workers/hash.worker.ts", import.meta.url),
    { type: "module", name: "storage-sha256-worker" },
  );

  const promise = new Promise<StorageFile[]>((resolve, reject) => {
    const updates = new Map<string, Partial<StorageFile>>();
    const cancel = () => {
      worker?.terminate();
      worker = undefined;
      reject(new DOMException("Scan cancelled", "AbortError"));
    };
    controller.signal.addEventListener("abort", cancel, { once: true });

    if (!worker) {
      reject(new Error("Web Worker could not be started."));
      return;
    }

    worker.onmessage = (event: MessageEvent<HashWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(message);
        return;
      }
      if (message.type === "result") {
        updates.set(message.id, {
          hashStatus: message.status,
          hash: message.hash,
          hashError: message.error,
        });
        return;
      }
      if (message.type === "fatal") {
        worker?.terminate();
        worker = undefined;
        reject(new Error(message.error));
        return;
      }
      if (message.type === "complete") {
        worker?.terminate();
        worker = undefined;
        controller.signal.removeEventListener("abort", cancel);
        resolve(records.map((record) => ({ ...record, ...updates.get(record.id) })));
      }
    };

    worker.onerror = (event) => {
      worker?.terminate();
      worker = undefined;
      reject(new Error(event.message || "Hash Worker failed."));
    };

    worker.postMessage({
      type: "start",
      files: records.map((record) => ({ id: record.id, file: filesById.get(record.id) })),
    });
  });

  return {
    promise,
    cancel: () => controller.abort(),
  };
}
