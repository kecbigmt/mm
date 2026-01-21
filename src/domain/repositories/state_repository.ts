import { Result } from "../../shared/result.ts";
import { RepositoryError } from "./repository_error.ts";

export type SyncState = Readonly<{
  commitsSinceLastSync: number;
  lastSyncTimestamp: number | null;
}>;

export interface StateRepository {
  loadSyncState(): Promise<Result<SyncState, RepositoryError>>;
  saveSyncState(state: SyncState): Promise<Result<void, RepositoryError>>;
}
