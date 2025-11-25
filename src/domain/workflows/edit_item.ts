import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import { Item } from "../models/item.ts";
import {
  AliasSlug,
  DateTime,
  Duration,
  parseAliasSlug,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemId,
  parseItemTitle,
  parseTagSlug,
  TagSlug,
} from "../primitives/mod.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type EditItemInput = Readonly<{
  itemLocator: string;
  updates: Readonly<{
    title?: string;
    icon?: string;
    body?: string;
    startAt?: string;
    duration?: string;
    dueAt?: string;
    alias?: string;
    context?: string;
  }>;
  updatedAt: DateTime;
}>;

export type EditItemDependencies = Readonly<{
  itemRepository: ItemRepository;
  aliasRepository: AliasRepository;
}>;

export type EditItemValidationError = ValidationError<"EditItem">;

export type EditItemError =
  | EditItemValidationError
  | RepositoryError;

export const EditItemWorkflow = {
  execute: async (
    input: EditItemInput,
    deps: EditItemDependencies,
  ): Promise<Result<Item, EditItemError>> => {
    let item: Item | undefined;
    const uuidResult = parseItemId(input.itemLocator);

    if (uuidResult.type === "ok") {
      const loadResult = await deps.itemRepository.load(uuidResult.value);
      if (loadResult.type === "error") {
        return Result.error(loadResult.error);
      }
      item = loadResult.value;
    } else {
      const aliasResult = parseAliasSlug(input.itemLocator);
      if (aliasResult.type === "ok") {
        const aliasLoadResult = await deps.aliasRepository.load(aliasResult.value);
        if (aliasLoadResult.type === "error") {
          return Result.error(aliasLoadResult.error);
        }
        const alias = aliasLoadResult.value;
        if (alias) {
          const itemLoadResult = await deps.itemRepository.load(alias.data.itemId);
          if (itemLoadResult.type === "error") {
            return Result.error(itemLoadResult.error);
          }
          item = itemLoadResult.value;
        }
      }
    }

    if (!item) {
      return Result.error(
        createValidationError("EditItem", [
          createValidationIssue(`Item not found: ${input.itemLocator}`, {
            code: "not_found",
            path: ["itemLocator"],
          }),
        ]),
      );
    }

    let updatedItem = item;
    const issues: Array<{ field: string; message: string }> = [];

    if (input.updates.title !== undefined) {
      const titleResult = parseItemTitle(input.updates.title);
      if (titleResult.type === "error") {
        issues.push({
          field: "title",
          message: titleResult.error.issues[0]?.message ?? "Invalid title",
        });
      } else {
        updatedItem = updatedItem.retitle(titleResult.value, input.updatedAt);
      }
    }

    if (input.updates.icon !== undefined) {
      const iconResult = parseItemIcon(input.updates.icon);
      if (iconResult.type === "error") {
        issues.push({
          field: "icon",
          message: iconResult.error.issues[0]?.message ?? "Invalid icon",
        });
      } else {
        updatedItem = updatedItem.changeIcon(iconResult.value, input.updatedAt);
      }
    }

    if (input.updates.body !== undefined) {
      updatedItem = updatedItem.setBody(input.updates.body, input.updatedAt);
    }

    if (input.updates.alias !== undefined) {
      let aliasValue: AliasSlug | undefined;
      if (input.updates.alias.trim().length > 0) {
        const aliasResult = parseAliasSlug(input.updates.alias);
        if (aliasResult.type === "error") {
          issues.push({
            field: "alias",
            message: aliasResult.error.issues[0]?.message ?? "Invalid alias",
          });
        } else {
          aliasValue = aliasResult.value;
        }
      }
      if (issues.length === 0 || !issues.some((i) => i.field === "alias")) {
        updatedItem = updatedItem.setAlias(aliasValue, input.updatedAt);
      }
    }

    if (input.updates.context !== undefined) {
      let contextValue: TagSlug | undefined;
      if (input.updates.context.trim().length > 0) {
        const contextResult = parseTagSlug(input.updates.context);
        if (contextResult.type === "error") {
          issues.push({
            field: "context",
            message: contextResult.error.issues[0]?.message ?? "Invalid context",
          });
        } else {
          contextValue = contextResult.value;
        }
      }
      if (issues.length === 0 || !issues.some((i) => i.field === "context")) {
        updatedItem = updatedItem.setContext(contextValue, input.updatedAt);
      }
    }

    const scheduleUpdates: {
      startAt?: DateTime;
      duration?: Duration;
      dueAt?: DateTime;
    } = {};
    let hasScheduleUpdates = false;

    if (input.updates.startAt !== undefined) {
      const startAtResult = parseDateTime(input.updates.startAt);
      if (startAtResult.type === "error") {
        issues.push({
          field: "startAt",
          message: startAtResult.error.issues[0]?.message ?? "Invalid start time",
        });
      } else {
        scheduleUpdates.startAt = startAtResult.value;
        hasScheduleUpdates = true;
      }
    }

    if (input.updates.duration !== undefined) {
      const durationResult = parseDuration(input.updates.duration);
      if (durationResult.type === "error") {
        issues.push({
          field: "duration",
          message: durationResult.error.issues[0]?.message ?? "Invalid duration",
        });
      } else {
        scheduleUpdates.duration = durationResult.value;
        hasScheduleUpdates = true;
      }
    }

    if (input.updates.dueAt !== undefined) {
      const dueAtResult = parseDateTime(input.updates.dueAt);
      if (dueAtResult.type === "error") {
        issues.push({
          field: "dueAt",
          message: dueAtResult.error.issues[0]?.message ?? "Invalid due date",
        });
      } else {
        scheduleUpdates.dueAt = dueAtResult.value;
        hasScheduleUpdates = true;
      }
    }

    if (hasScheduleUpdates && issues.length === 0) {
      updatedItem = updatedItem.schedule(scheduleUpdates, input.updatedAt);
    }

    if (issues.length > 0) {
      return Result.error(
        createValidationError(
          "EditItem",
          issues.map((issue) =>
            createValidationIssue(issue.message, {
              code: "invalid_value",
              path: [issue.field],
            })
          ),
        ),
      );
    }

    const saveResult = await deps.itemRepository.save(updatedItem);
    if (saveResult.type === "error") {
      return Result.error(saveResult.error);
    }

    return Result.ok(updatedItem);
  },
};
