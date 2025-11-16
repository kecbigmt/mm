import { Result } from "../../shared/result.ts";
import { Item } from "../models/item.ts";
import { ItemId, PlacementRange } from "../primitives/mod.ts";
import { ItemRepository } from "./item_repository.ts";
import { RepositoryError } from "./repository_error.ts";

type ItemMap = Map<string, Item>;

const ok = Result.ok;

const matchesPlacementRange = (item: Item, range: PlacementRange): boolean => {
  switch (range.kind) {
    case "single": {
      return item.data.placement.equals(range.at);
    }
    case "dateRange": {
      // Check if item's placement head is a date within the range
      if (item.data.placement.head.kind !== "date") {
        return false;
      }
      const itemDate = item.data.placement.head.date.toString();
      return itemDate >= range.from.toString() && itemDate <= range.to.toString();
    }
    case "numericRange": {
      // Check if item's placement parent matches and section is within range
      if (!item.data.placement.parent()?.equals(range.parent)) {
        return false;
      }
      // Get the last section number
      const lastSection = item.data.placement.section[item.data.placement.section.length - 1];
      if (lastSection === undefined) {
        return false;
      }
      return lastSection >= range.from && lastSection <= range.to;
    }
  }
};

const cloneAndSortByPlacement = (items: Iterable<Item>, range: PlacementRange): Item[] =>
  Array.from(items)
    .filter((item) => matchesPlacementRange(item, range))
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

  listByPlacement(range: PlacementRange): Promise<Result<ReadonlyArray<Item>, RepositoryError>> {
    return Promise.resolve(ok(cloneAndSortByPlacement(this.items.values(), range)));
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
