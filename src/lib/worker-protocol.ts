export const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

export interface HashWorkerFile {
  id: string;
  file: File;
}

export type HashWorkerRequest = {
  type: "start";
  files: HashWorkerFile[];
};

export type HashWorkerResponse =
  | {
      type: "progress";
      processedFiles: number;
      totalFiles: number;
      processedBytes: number;
      totalBytes: number;
      currentName: string;
    }
  | {
      type: "result";
      id: string;
      status: "hashed" | "skipped" | "error";
      hash?: string;
      error?: string;
    }
  | { type: "complete" }
  | { type: "fatal"; error: string };
