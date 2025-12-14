import { Result } from "../../shared/result.ts";
import { SyncPullDependencies, SyncPullError, SyncPullWorkflow } from "./sync_pull.ts";
import { SyncPushDependencies, SyncPushError, SyncPushWorkflow } from "./sync_push.ts";

export type SyncInput = {
  workspaceRoot: string;
};

export type SyncDependencies = SyncPullDependencies & SyncPushDependencies;

export type SyncError = SyncPullError | SyncPushError;

export const SyncWorkflow = {
  execute: async (
    input: SyncInput,
    deps: SyncDependencies,
  ): Promise<Result<string, SyncError>> => {
    // 1. Execute pull
    const pullResult = await SyncPullWorkflow.execute(
      { workspaceRoot: input.workspaceRoot },
      deps,
    );
    if (pullResult.type === "error") {
      return Result.error(pullResult.error);
    }

    // 2. Execute push
    const pushResult = await SyncPushWorkflow.execute(
      { workspaceRoot: input.workspaceRoot },
      deps,
    );
    if (pushResult.type === "error") {
      return Result.error(pushResult.error);
    }

    // 3. Combine outputs
    const output = `${pullResult.value}${pushResult.value}`;
    return Result.ok(output);
  },
};
