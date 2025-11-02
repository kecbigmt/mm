import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
} from "../../shared/errors.ts";
import {
  AliasSlug,
  ItemId,
  Locator,
  LocatorValidationError,
  parseLocator,
  ParseLocatorOptions,
} from "../primitives/mod.ts";
import { Item } from "../models/item.ts";
import { ItemRepository } from "../repositories/item_repository.ts";
import { AliasRepository } from "../repositories/alias_repository.ts";
import { RepositoryError } from "../repositories/repository_error.ts";

export type LocatorResolutionError =
  | ValidationError<"LocatorResolution">
  | RepositoryError;

export type LocatorResolutionDependencies = Readonly<{
  readonly itemRepository: ItemRepository;
  readonly aliasRepository: AliasRepository;
}>;

export type ResolveLocatorOptions = ParseLocatorOptions;

const mapParseError = (
  error: LocatorValidationError,
): ValidationError<"LocatorResolution"> => createValidationError("LocatorResolution", error.issues);

const invalidLocator = (message: string): ValidationError<"LocatorResolution"> =>
  createValidationError("LocatorResolution", [
    createValidationIssue(message, { code: "invalid_locator", path: ["value"] }),
  ]);

const ensureSingleLocator = (
  locator: Locator,
): ValidationError<"LocatorResolution"> | undefined => {
  if (locator.isRange()) {
    return createValidationError("LocatorResolution", [
      createValidationIssue("locator ranges are not supported for item resolution", {
        code: "range_not_supported",
        path: ["range"],
      }),
    ]);
  }
  return undefined;
};

const resolveHeadItemId = async (
  locator: Locator,
  deps: LocatorResolutionDependencies,
): Promise<Result<Item | undefined, LocatorResolutionError>> => {
  const head = locator.head();
  if (!head) {
    return Result.error(invalidLocator("locator must reference an item identifier or alias"));
  }

  switch (head.kind) {
    case "ItemId": {
      const itemId = head.value as ItemId;
      const loadResult = await deps.itemRepository.load(itemId);
      if (loadResult.type === "error") {
        return Result.error(loadResult.error);
      }
      return Result.ok(loadResult.value);
    }
    case "ItemAlias": {
      const aliasSlug = head.value as AliasSlug;
      const aliasResult = await deps.aliasRepository.load(aliasSlug);
      if (aliasResult.type === "error") {
        return Result.error(aliasResult.error);
      }
      const alias = aliasResult.value;
      if (!alias) {
        return Result.ok(undefined);
      }
      const loadResult = await deps.itemRepository.load(alias.data.itemId);
      if (loadResult.type === "error") {
        return Result.error(loadResult.error);
      }
      return Result.ok(loadResult.value);
    }
    case "Date":
      return Result.error(
        createValidationError("LocatorResolution", [
          createValidationIssue("date locators must include an item identifier or alias", {
            code: "date_requires_item",
            path: ["value"],
          }),
        ]),
      );
    default:
      return Result.error(
        createValidationError("LocatorResolution", [
          createValidationIssue("locator must begin with an item identifier or alias", {
            code: "unsupported_head",
            path: ["value"],
          }),
        ]),
      );
  }
};

export const LocatorResolutionService = {
  parse(
    input: string,
    options: ResolveLocatorOptions = {},
  ): Result<Locator, ValidationError<"LocatorResolution">> {
    const parsed = parseLocator(input, options);
    if (parsed.type === "error") {
      return Result.error(mapParseError(parsed.error));
    }
    const rangeIssue = ensureSingleLocator(parsed.value);
    if (rangeIssue) {
      return Result.error(rangeIssue);
    }
    return Result.ok(parsed.value);
  },

  async resolveItem(
    locatorInput: string,
    deps: LocatorResolutionDependencies,
    options: ResolveLocatorOptions = {},
  ): Promise<Result<Item | undefined, LocatorResolutionError>> {
    const locatorResult = LocatorResolutionService.parse(locatorInput, options);
    if (locatorResult.type === "error") {
      return Result.error(locatorResult.error);
    }
    return await resolveHeadItemId(locatorResult.value, deps);
  },
};
