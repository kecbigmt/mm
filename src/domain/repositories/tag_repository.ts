import { Result } from "../../shared/result.ts";
import { Tag } from "../models/tag.ts";
import { TagSlug } from "../primitives/mod.ts";
import { RepositoryError } from "./repository_error.ts";

export interface TagRepository {
  load(slug: TagSlug): Promise<Result<Tag | undefined, RepositoryError>>;
  save(tag: Tag): Promise<Result<void, RepositoryError>>;
  delete(slug: TagSlug): Promise<Result<void, RepositoryError>>;
  list(): Promise<Result<ReadonlyArray<Tag>, RepositoryError>>;
}
