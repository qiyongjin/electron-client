export const UPLOAD_DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
export const UPLOAD_MAX_CHUNK_BYTES = 16 * 1024 * 1024;
export const UPLOAD_DEFAULT_CONCURRENCY = 3;
export const UPLOAD_MAX_CONCURRENCY = 6;
export const UPLOAD_MAX_RETRIES = 3;
export type UploadStatus =
  | "hashing"
  | "uploading"
  | "merging"
  | "pausing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export interface UploadSource {
  path: string;
  name: string;
  size: number;
}
export interface UploadStartOptions {
  filePath: string;
  endpoint: string;
  chunkSize: number;
  concurrency: number;
}
export interface UploadTask extends UploadStartOptions {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  hashBytes: number;
  uploadedBytes: number;
  completedChunks: number;
  totalChunks: number;
  fileHash?: string;
  uploadId?: string;
  retries: number;
  speed: number;
  error?: string;
  result?: { fileHash: string; size: number; storageName: string };
  createdAt: number;
  updatedAt: number;
}
export interface LocalUploadServerOptions {
  failFirstAttempt: boolean;
  delayMs: number;
}
export interface LocalUploadServerInfo {
  endpoint: string;
  directory: string;
  failFirstAttempt: boolean;
  delayMs: number;
}
export interface UploadAPI {
  chooseFile: () => Promise<UploadSource | null>;
  start: (options: UploadStartOptions) => Promise<UploadTask>;
  list: () => Promise<UploadTask[]>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<UploadTask>;
  cancel: (id: string) => Promise<void>;
  startLocalServer: (
    options: LocalUploadServerOptions,
  ) => Promise<LocalUploadServerInfo>;
  onTasks: (callback: (tasks: UploadTask[]) => void) => () => void;
}
