import { Result } from "../../shared/result.ts";
import { Item } from "../models/item.ts";
import { ItemId, Path } from "../primitives/mod.ts";
import { ItemRepository } from "./item_repository.ts";
import { RepositoryError } from "./repository_error.ts";

type ItemMap = Map<string, Item>;

const ok = Result.ok;

const cloneAndSortByPath = (items: Iterable<Item>, path: Path): Item[] =>
  Array.from(items)
    .filter((item) => item.data.path.equals(path))
    .sort((first, second) => first.data.rank.compare(second.data.rank));

export class InMemoryItemRepository implements ItemRepository {
  private readonly items: ItemMap;

  constructor(initialItems?: Iterable<Item>) {
    this.items = new Map<string, Item>();
    if (initialItems) {
      for (const item of initialItems) {
        this.items.set(item.data.id.toString(), item);
      }
    }
  }

  load(id: ItemId): Promise<Result<Item | undefined, RepositoryError>> {
    return Promise.resolve(ok(this.items.get(id.toString())));
  }

  save(item: Item): Promise<Result<void, RepositoryError>> {
    this.items.set(item.data.id.toString(), item);
    return Promise.resolve(ok(undefined));
  }

  delete(id: ItemId): Promise<Result<void, RepositoryError>> {
    this.items.delete(id.toString());
    return Promise.resolve(ok(undefined));
  }

  listByPath(path: Path): Promise<Result<ReadonlyArray<Item>, RepositoryError>> {
    return Promise.resolve(ok(cloneAndSortByPath(this.items.values(), path)));
  }

  clear(): void {
    this.items.clear();
  }

  set(item: Item): void {
    this.items.set(item.data.id.toString(), item);
  }

  all(): ReadonlyArray<Item> {
    return Array.from(this.items.values());
  }
}
