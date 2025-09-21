import { Result } from "../../shared/result.ts";
import { Context } from "../models/context.ts";
import { ContextTag } from "../primitives/mod.ts";
import { RepositoryError } from "./repository_error.ts";

export interface ContextRepository {
  load(tag: ContextTag): Promise<Result<Context | undefined, RepositoryError>>;
  save(context: Context): Promise<Result<void, RepositoryError>>;
  delete(tag: ContextTag): Promise<Result<void, RepositoryError>>;
  list(): Promise<Result<ReadonlyArray<Context>, RepositoryError>>;
}
