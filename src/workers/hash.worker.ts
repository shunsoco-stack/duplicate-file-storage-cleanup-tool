/// <reference lib="webworker" />

import { IncrementalSha256 } from "@/lib/sha256";
import {
  HASH_CHUNK_BYTES,
  type HashWorkerRequest,
  type HashWorkerResponse,
} from "@/lib/worker-protocol";

const workerContext = self as unknown as DedicatedWorkerGlobalScope;

function post(message: HashWorkerResponse): void {
  workerContext.postMessage(message);
}

async function digestFile(
  file: File,
  onChunk: (bytes: number) => void,
): Promise<string> {
  const sha256 = new IncrementalSha256();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    const chunk = file.slice(offset, Math.min(file.size, offset + HASH_CHUNK_BYTES));
    const bytes = new Uint8Array(await chunk.arrayBuffer());
    sha256.update(bytes);
    onChunk(bytes.byteLength);
  }
  return sha256.digestHex();
}

workerContext.onmessage = async (event: MessageEvent<HashWorkerRequest>) => {
  if (event.data.type !== "start") return;

  try {
    const { files } = event.data;
    const sizeCounts = new Map<number, number>();
    for (const entry of files) {
      sizeCounts.set(entry.file.size, (sizeCounts.get(entry.file.size) ?? 0) + 1);
    }
    const candidates = files.filter(
      (entry) => entry.file.size > 0 && (sizeCounts.get(entry.file.size) ?? 0) > 1,
    );
    const totalBytes = candidates.reduce((sum, entry) => sum + entry.file.size, 0);
    let processedBytes = 0;
    let processedFiles = 0;

    for (const entry of files) {
      const shouldHash =
        entry.file.size > 0 && (sizeCounts.get(entry.file.size) ?? 0) > 1;
      if (!shouldHash) {
        processedFiles += 1;
        post({ type: "result", id: entry.id, status: "skipped" });
        post({
          type: "progress",
          processedFiles,
          totalFiles: files.length,
          processedBytes,
          totalBytes,
          currentName: entry.file.name,
        });
        continue;
      }

      try {
        const hash = await digestFile(entry.file, (bytes) => {
          processedBytes += bytes;
          post({
            type: "progress",
            processedFiles,
            totalFiles: files.length,
            processedBytes,
            totalBytes,
            currentName: entry.file.name,
          });
        });
        post({ type: "result", id: entry.id, status: "hashed", hash });
      } catch (reason) {
        post({
          type: "result",
          id: entry.id,
          status: "error",
          error: reason instanceof Error ? reason.message : "Hash calculation failed.",
        });
      }

      processedFiles += 1;
      post({
        type: "progress",
        processedFiles,
        totalFiles: files.length,
        processedBytes,
        totalBytes,
        currentName: entry.file.name,
      });
    }

    post({ type: "complete" });
  } catch (reason) {
    post({
      type: "fatal",
      error: reason instanceof Error ? reason.message : "Worker failed unexpectedly.",
    });
  }
};

export {};
