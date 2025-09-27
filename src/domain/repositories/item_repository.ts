import { Result } from "../../shared/result.ts";
import { Item } from "../models/item.ts";
import { Path } from "../primitives/mod.ts";
import { ItemId } from "../primitives/mod.ts";
import { ItemShortId } from "../primitives/item_short_id.ts";
import { RepositoryError } from "./repository_error.ts";
import { AmbiguousShortIdError } from "./short_id_resolution_error.ts";

export interface ItemRepository {
  load(id: ItemId): Promise<Result<Item | undefined, RepositoryError>>;
  save(item: Item): Promise<Result<void, RepositoryError>>;
  delete(id: ItemId): Promise<Result<void, RepositoryError>>;
  listByPath(
    path: Path,
  ): Promise<Result<ReadonlyArray<Item>, RepositoryError>>;
  findByShortId(
    shortId: ItemShortId,
  ): Promise<Result<Item | undefined, RepositoryError | AmbiguousShortIdError>>;
}
