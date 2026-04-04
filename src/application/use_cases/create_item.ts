import { Result } from "../../shared/result.ts";
import { createValidationError, ValidationError } from "../../shared/errors.ts";
import { Item } from "../../domain/models/item.ts";
import {
  CalendarDay,
  DateTime,
  Directory,
  Duration,
  TimezoneIdentifier,
} from "../../domain/primitives/mod.ts";
import { RepositoryError } from "../../domain/repositories/repository_error.ts";
import { AliasRepository } from "../../domain/repositories/alias_repository.ts";
import { ItemRepository } from "../../domain/repositories/item_repository.ts";
import { AliasAutoGenerator } from "../../domain/services/alias_auto_generator.ts";
import { IdGenerationService } from "../../domain/services/id_generation_service.ts";
import { RankService } from "../../domain/services/rank_service.ts";
import { CreateItemError, CreateItemService } from "../../domain/services/create_item.ts";

export type CreateItemRequest = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  project?: string;
  contexts?: readonly string[];
  alias?: string;
  parentDirectory: Directory;
  createdAt: DateTime;
  timezone: TimezoneIdentifier;
  startAt?: DateTime;
  duration?: Duration;
  dueAt?: CalendarDay | DateTime;
}>;

export type CreateItemDeps = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  aliasAutoGenerator: AliasAutoGenerator;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type CreatedItemDto = Readonly<{
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

export type CreateItemResponse = Readonly<{
  item: CreatedItemDto;
  createdTopics: ReadonlyArray<string>;
}>;

export type CreateItemApplicationError =
  | ValidationError<"CreateItem">
  | RepositoryError;

const toDto = (item: Item): CreatedItemDto => {
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

const mapWorkflowError = (
  error: CreateItemError,
): CreateItemApplicationError => {
  if (error.kind === "repository") {
    return error.error;
  }
  return createValidationError(
    "CreateItem",
    error.issues,
    { message: error.message },
  );
};

export const createItem = async (
  request: CreateItemRequest,
  deps: CreateItemDeps,
): Promise<Result<CreateItemResponse, CreateItemApplicationError>> => {
  const result = await CreateItemService.execute(request, deps);

  if (result.type === "error") {
    return Result.error(mapWorkflowError(result.error));
  }

  return Result.ok(
    Object.freeze({
      item: toDto(result.value.item),
      createdTopics: Object.freeze(
        result.value.createdTopics.map((topic) => topic.toString()),
      ),
    }),
  );
};
