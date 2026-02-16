import { Result } from "../../shared/result.ts";
import { createValidationIssue, ValidationIssue } from "../../shared/errors.ts";
import { createItem, Item } from "../models/item.ts";
import { Alias, createAlias } from "../models/alias.ts";
import {
  AliasSlug,
  createItemIcon,
  createPermanentDirectory,
  DateTime,
  itemStatusOpen,
  itemTitleFromString,
} from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { RankService } from "../services/rank_service.ts";
import { IdGenerationService } from "../services/id_generation_service.ts";

/**
 * A prepared topic ready to be persisted. Contains the Item and Alias that
 * will be saved together when the main workflow validation passes.
 */
export type PreparedTopic = Readonly<{
  item: Item;
  alias: Alias;
  slug: AliasSlug;
}>;

export type TopicAutoCreationDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type TopicBuildValidationError = Readonly<{
  kind: "validation";
  issues: ReadonlyArray<ValidationIssue>;
}>;

export type TopicBuildRepositoryError = Readonly<{
  kind: "repository";
  error: RepositoryError;
}>;

export type TopicBuildError = TopicBuildValidationError | TopicBuildRepositoryError;

/**
 * Builds a topic item and alias without persisting them.
 * Used to defer persistence until after all validation passes.
 */
export const buildTopicItem = async (
  aliasSlug: AliasSlug,
  createdAt: DateTime,
  deps: TopicAutoCreationDependencies,
): Promise<Result<PreparedTopic, TopicBuildError>> => {
  // Generate ID for the new topic
  const idResult = deps.idGenerationService.generateId();
  if (idResult.type === "error") {
    return Result.error({
      kind: "validation",
      issues: idResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["topic", "id", ...issue.path],
        })
      ),
    });
  }
  const topicId = idResult.value;

  // Use the alias as the title
  const titleResult = itemTitleFromString(aliasSlug.toString());
  if (titleResult.type === "error") {
    return Result.error({
      kind: "validation",
      issues: titleResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["topic", "title", ...issue.path],
        })
      ),
    });
  }
  const title = titleResult.value;

  // Get rank for permanent directory
  const permanentDirectory = createPermanentDirectory();
  const siblingsResult = await deps.itemRepository.listByDirectory({
    kind: "single",
    at: permanentDirectory,
  });
  if (siblingsResult.type === "error") {
    return Result.error({ kind: "repository", error: siblingsResult.error });
  }
  const existingRanks = siblingsResult.value.map((item) => item.data.rank);
  const rankResult = deps.rankService.tailRank(existingRanks);
  if (rankResult.type === "error") {
    return Result.error({
      kind: "validation",
      issues: rankResult.error.issues.map((issue) =>
        createValidationIssue(issue.message, {
          code: issue.code,
          path: ["topic", "rank", ...issue.path],
        })
      ),
    });
  }

  // Create the topic item (not persisted yet)
  const topicItem = createItem({
    id: topicId,
    title,
    icon: createItemIcon("topic"),
    status: itemStatusOpen(),
    directory: permanentDirectory,
    rank: rankResult.value,
    createdAt,
    updatedAt: createdAt,
    alias: aliasSlug,
  });

  // Create the alias model (not persisted yet)
  const aliasModel = createAlias({
    slug: aliasSlug,
    itemId: topicId,
    createdAt,
  });

  return Result.ok({
    item: topicItem,
    alias: aliasModel,
    slug: aliasSlug,
  });
};

export type TopicPersistError = RepositoryError;

/**
 * Persists a prepared topic (item and alias) to the repositories.
 */
export const persistPreparedTopic = async (
  prepared: PreparedTopic,
  deps: TopicAutoCreationDependencies,
): Promise<Result<void, TopicPersistError>> => {
  // Save the topic item
  const saveResult = await deps.itemRepository.save(prepared.item);
  if (saveResult.type === "error") {
    return Result.error(saveResult.error);
  }

  // Save the alias
  const aliasSaveResult = await deps.aliasRepository.save(prepared.alias);
  if (aliasSaveResult.type === "error") {
    return Result.error(aliasSaveResult.error);
  }

  return Result.ok(undefined);
};
