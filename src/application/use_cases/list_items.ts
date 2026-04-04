import { Result } from "../../shared/result.ts";
import { Item } from "../../domain/models/item.ts";
import { Directory } from "../../domain/primitives/directory.ts";
import { TimezoneIdentifier } from "../../domain/primitives/timezone_identifier.ts";
import type { ItemIconValue } from "../../domain/primitives/item_icon.ts";
import { ListItemsStatusFilter, ListItemsWorkflow } from "../../domain/workflows/list_items.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ValidationError } from "../../shared/errors.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";

/** Application-level input DTO */
export type ListItemsRequest = Readonly<{
  expression?: string;
  cwd: Directory;
  timezone?: TimezoneIdentifier;
  today?: Date;
  status?: ListItemsStatusFilter;
  icon?: ItemIconValue;
}>;

/** Application-level dependencies (subset of CoreDependencies) */
export type ListItemsDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  prefixCandidates?: () => Promise<readonly string[]>;
}>;

/** Presentation-free item DTO for structured responses */
export type ListItemDto = Readonly<{
  id: string;
  icon: string;
  title: string;
  status: string;
  rank: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  startAt?: string;
  duration?: string;
  dueAt?: string;
  snoozeUntil?: string;
  alias?: string;
  project?: string;
  contexts?: readonly string[];
  body?: string;
}>;

/** Application-level result DTO */
export type ListItemsResponse = Readonly<{
  items: ReadonlyArray<ListItemDto>;
}>;

/** Application-level error type */
export type ListItemsApplicationError =
  | ValidationError<"ListItems">
  | RepositoryError;

/** Map a domain Item to a presentation-free DTO */
const toDto = (item: Item): ListItemDto => {
  const d = item.data;
  return Object.freeze({
    id: d.id.toString(),
    icon: d.icon.toString(),
    title: d.title.toString(),
    status: d.status.isOpen() ? "open" : "closed",
    rank: d.rank.toString(),
    directory: d.directory.toString(),
    createdAt: d.createdAt.toString(),
    updatedAt: d.updatedAt.toString(),
    ...(d.closedAt ? { closedAt: d.closedAt.toString() } : {}),
    ...(d.startAt ? { startAt: d.startAt.toString() } : {}),
    ...(d.duration ? { duration: d.duration.toString() } : {}),
    ...(d.dueAt ? { dueAt: d.dueAt.toString() } : {}),
    ...(d.snoozeUntil ? { snoozeUntil: d.snoozeUntil.toString() } : {}),
    ...(d.alias ? { alias: d.alias.toString() } : {}),
    ...(d.project ? { project: d.project.toString() } : {}),
    ...(d.contexts && d.contexts.length > 0
      ? { contexts: d.contexts.map((c) => c.toString()) }
      : {}),
    ...(d.body ? { body: d.body } : {}),
  });
};

/** Execute the list-items use case, returning presentation-free DTOs */
export const listItems = async (
  request: ListItemsRequest,
  deps: ListItemsDeps,
): Promise<Result<ListItemsResponse, ListItemsApplicationError>> => {
  const result = await ListItemsWorkflow.execute(
    {
      expression: request.expression,
      cwd: request.cwd,
      timezone: request.timezone,
      today: request.today,
      status: request.status,
      icon: request.icon,
    },
    {
      itemRepository: deps.itemRepository,
      aliasRepository: deps.aliasRepository,
      prefixCandidates: deps.prefixCandidates,
    },
  );

  if (result.type === "error") {
    return result;
  }

  return Result.ok(
    Object.freeze({ items: Object.freeze(result.value.items.map(toDto)) }),
  );
};
