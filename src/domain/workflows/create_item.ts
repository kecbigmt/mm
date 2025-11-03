import { Result } from "../../shared/result.ts";
import { createValidationIssue, ValidationIssue } from "../../shared/errors.ts";
import { createItem, Item } from "../models/item.ts";
import {
  AliasSlug,
  createItemIcon,
  DateTime,
  ItemId,
  itemStatusOpen,
  itemTitleFromString,
  parseAliasSlug,
  Path,
  TagSlug,
  tagSlugFromString,
} from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { RankService } from "../services/rank_service.ts";
import { IdGenerationService } from "../services/id_generation_service.ts";
import { createAlias } from "../models/alias.ts";

export type CreateItemInput = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  context?: string;
  alias?: string;
  parentPath: Path;
  createdAt: DateTime;
}>;

export type CreateItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
  rankService: RankService;
  idGenerationService: IdGenerationService;
}>;

export type CreateItemValidationError = Readonly<{
  kind: "validation";
  message: string;
  issues: ReadonlyArray<ValidationIssue>;
}>;

export type CreateItemRepositoryError = Readonly<{
  kind: "repository";
  error: RepositoryError;
}>;

export type CreateItemError = CreateItemValidationError | CreateItemRepositoryError;

export type CreateItemResult = Readonly<{
  item: Item;
}>;

const invalidInput = (
  issues: ReadonlyArray<ValidationIssue>,
): CreateItemValidationError => ({
  kind: "validation",
  message: "invalid item input",
  issues,
});

const repositoryFailure = (error: RepositoryError): CreateItemRepositoryError => ({
  kind: "repository",
  error,
});

export const CreateItemWorkflow = {
  execute: async (
    input: CreateItemInput,
    deps: CreateItemDependencies,
  ): Promise<Result<CreateItemResult, CreateItemError>> => {
    const issues: ValidationIssue[] = [];

    const titleResult = itemTitleFromString(input.title);
    const title = titleResult.type === "ok" ? titleResult.value : undefined;
    if (titleResult.type === "error") {
      issues.push(
        ...titleResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["title", ...issue.path],
          })
        ),
      );
    }

    let context: TagSlug | undefined;
    if (typeof input.context === "string") {
      const contextResult = tagSlugFromString(input.context);
      if (contextResult.type === "error") {
        issues.push(
          ...contextResult.error.issues.map((issue) =>
            createValidationIssue(issue.message, {
              code: issue.code,
              path: ["context", ...issue.path],
            })
          ),
        );
      } else {
        context = contextResult.value;
      }
    }

    let alias: AliasSlug | undefined;
    if (typeof input.alias === "string") {
      const aliasResult = parseAliasSlug(input.alias);
      if (aliasResult.type === "error") {
        issues.push(
          ...aliasResult.error.issues.map((issue) =>
            createValidationIssue(issue.message, {
              code: issue.code,
              path: ["alias", ...issue.path],
            })
          ),
        );
      } else {
        alias = aliasResult.value;
      }
    }

    if (input.parentPath.isRange()) {
      issues.push(
        createValidationIssue("parent path cannot be a range", {
          code: "range_not_allowed",
          path: ["parentPath"],
        }),
      );
    }

    const idResult = deps.idGenerationService.generateId();
    const id = idResult.type === "ok" ? idResult.value : undefined;
    if (idResult.type === "error") {
      issues.push(
        ...idResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["id", ...issue.path],
          })
        ),
      );
    }

    if (issues.length > 0) {
      return Result.error(invalidInput(issues));
    }

    const resolvedId = id as ItemId;
    const resolvedTitle = title!;

    const siblingsResult = await deps.itemRepository.listByPath(
      input.parentPath,
    );
    if (siblingsResult.type === "error") {
      return Result.error(repositoryFailure(siblingsResult.error));
    }

    const siblings = siblingsResult.value;
    const rankResult = siblings.length === 0
      ? deps.rankService.middleRank()
      : deps.rankService.nextRank(
        siblings[siblings.length - 1].data.rank,
      );

    if (rankResult.type === "error") {
      return Result.error(invalidInput(
        rankResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["rank", ...issue.path],
          })
        ),
      ));
    }

    const trimmedBody = typeof input.body === "string" ? input.body.trim() : undefined;
    const body = trimmedBody && trimmedBody.length > 0 ? trimmedBody : undefined;

    let item = createItem({
      id: resolvedId,
      title: resolvedTitle,
      icon: createItemIcon(input.itemType),
      status: itemStatusOpen(),
      path: input.parentPath,
      rank: rankResult.value,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      body,
      context,
    });

    // Set alias if provided
    if (alias) {
      item = item.setAlias(alias, input.createdAt);
    }

    const saveResult = await deps.itemRepository.save(item);
    if (saveResult.type === "error") {
      return Result.error(repositoryFailure(saveResult.error));
    }

    // Save alias to alias repository if provided
    if (alias) {
      const aliasModel = createAlias({
        slug: alias,
        itemId: resolvedId,
        createdAt: input.createdAt,
      });
      const aliasSaveResult = await deps.aliasRepository.save(aliasModel);
      if (aliasSaveResult.type === "error") {
        return Result.error(repositoryFailure(aliasSaveResult.error));
      }
    }

    return Result.ok({ item });
  },
};
