import { Result } from "../../shared/result.ts";
import { Alias } from "../models/alias.ts";
import { AliasSlug } from "../primitives/mod.ts";
import { RepositoryError } from "./repository_error.ts";

export interface AliasRepository {
  load(slug: AliasSlug): Promise<Result<Alias | undefined, RepositoryError>>;
  save(alias: Alias): Promise<Result<void, RepositoryError>>;
  delete(slug: AliasSlug): Promise<Result<void, RepositoryError>>;
  list(): Promise<Result<ReadonlyArray<Alias>, RepositoryError>>;
}
