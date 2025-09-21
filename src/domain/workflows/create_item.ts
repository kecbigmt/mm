import { Result } from "../../shared/result.ts";
import { createValidationIssue, ValidationIssue } from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import { createItem } from "../models/item.ts";
import {
  ContainerPath,
  containerPathFromSegments,
  ContextTag,
  contextTagFromString,
  createItemIcon,
  DateTime,
  ItemId,
  itemIdFromString,
  ItemRank,
  itemStatusOpen,
  itemTitleFromString,
} from "../primitives/mod.ts";
import { CalendarDay } from "../primitives/calendar_day.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { ContainerRepository } from "../repositories/container_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";
import { createItemEdge, Edge, isContainerEdge, isItemEdge } from "../models/edge.ts";
import { RankService } from "../services/rank_service.ts";

export type CreateItemInput = Readonly<{
  title: string;
  itemType: "note" | "task" | "event";
  body?: string;
  context?: string;
  day: CalendarDay;
  createdAt: DateTime;
}>;

export type CreateItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  containerRepository: ContainerRepository;
  rankService: RankService;
  generateId(): string;
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

    let context: ContextTag | undefined;
    if (typeof input.context === "string") {
      const contextResult = contextTagFromString(input.context);
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

    const daySegments = input.day.toString().split("-");
    const containerPathResult = containerPathFromSegments(daySegments);
    const containerPath = containerPathResult.type === "ok" ? containerPathResult.value : undefined;
    if (containerPathResult.type === "error") {
      issues.push(
        ...containerPathResult.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["container", ...issue.path],
          })
        ),
      );
    }

    const idResult = itemIdFromString(deps.generateId());
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

    const resolvedContainerPath = containerPath as ContainerPath;
    const resolvedId = id as ItemId;
    const resolvedTitle = title!;

    const ensureResult = await deps.containerRepository.ensure(resolvedContainerPath);
    if (ensureResult.type === "error") {
      return Result.error(repositoryFailure(ensureResult.error));
    }
    const container = ensureResult.value;

    const existingItemEdges = container.edges.filter(isItemEdge);

    let rankResult: Result<ItemRank, CreateItemError>;
    if (existingItemEdges.length === 0) {
      const middle = deps.rankService.middleRank();
      rankResult = middle.type === "ok" ? Result.ok(middle.value) : Result.error(invalidInput(
        middle.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["rank", ...issue.path],
          })
        ),
      ));
    } else {
      const sortedEdges = [...existingItemEdges].sort((a, b) =>
        deps.rankService.compareRanks(a.data.rank, b.data.rank)
      );
      const lastRank = sortedEdges[sortedEdges.length - 1].data.rank;
      const next = deps.rankService.nextRank(lastRank);
      rankResult = next.type === "ok" ? Result.ok(next.value) : Result.error(invalidInput(
        next.error.issues.map((issue) =>
          createValidationIssue(issue.message, {
            code: issue.code,
            path: ["rank", ...issue.path],
          })
        ),
      ));
    }

    if (rankResult.type === "error") {
      return rankResult;
    }

    const trimmedBody = typeof input.body === "string" ? input.body.trim() : undefined;
    const body = trimmedBody && trimmedBody.length > 0 ? trimmedBody : undefined;

    const item = createItem({
      id: resolvedId,
      title: resolvedTitle,
      icon: createItemIcon(input.itemType),
      status: itemStatusOpen(),
      container: resolvedContainerPath,
      rank: rankResult.value,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      body,
      context,
    });

    const saveResult = await deps.itemRepository.save(item);
    if (saveResult.type === "error") {
      return Result.error(repositoryFailure(saveResult.error));
    }

    const containerEdges = container.edges.filter(isContainerEdge);
    const newItemEdge = createItemEdge(resolvedId, rankResult.value);
    const updatedItemEdges = [...existingItemEdges, newItemEdge].sort((a, b) =>
      deps.rankService.compareRanks(a.data.rank, b.data.rank)
    );
    const updatedEdges: Edge[] = [...containerEdges, ...updatedItemEdges];

    const replaceResult = await deps.containerRepository.replaceEdges(
      resolvedContainerPath,
      updatedEdges,
    );
    if (replaceResult.type === "error") {
      return Result.error(repositoryFailure(replaceResult.error));
    }

    return Result.ok({ item });
  },
};
