import { Result } from "../../shared/result.ts";
import { RepositoryError } from "./repository_error.ts";
import { Placement } from "../primitives/placement.ts";

export type SyncState = Readonly<{
  commitsSinceLastSync: number;
  lastSyncTimestamp: number | null;
}>;

export interface StateRepository {
  loadCwd(): Promise<Result<Placement | undefined, RepositoryError>>;
  saveCwd(placement: Placement): Promise<Result<void, RepositoryError>>;
  loadSyncState(): Promise<Result<SyncState, RepositoryError>>;
  saveSyncState(state: SyncState): Promise<Result<void, RepositoryError>>;
}
