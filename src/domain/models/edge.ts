import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  ItemId,
  ItemIdValidationError,
  ItemRank,
  ItemRankValidationError,
  parseItemId,
  parseItemRank,
} from "../primitives/mod.ts";

const ITEM_EDGE_KIND = "ItemEdge" as const;
const EDGE_KIND = "Edge" as const;

type ItemEdgeData = Readonly<{
  readonly to: ItemId;
  readonly rank: ItemRank;
}>;

export type ItemEdge = Readonly<{
  readonly kind: typeof ITEM_EDGE_KIND;
  readonly data: ItemEdgeData;
  toJSON(): ItemEdgeSnapshot;
}>;

export type Edge = ItemEdge;

export type ItemEdgeSnapshot = Readonly<{
  readonly kind?: typeof ITEM_EDGE_KIND;
  readonly to: string;
  readonly rank: string;
}>;

export type EdgeSnapshot = ItemEdgeSnapshot;

export type ItemEdgeValidationError = ValidationError<typeof ITEM_EDGE_KIND>;
export type EdgeValidationError = ValidationError<typeof EDGE_KIND>;

const instantiateItemEdge = (data: ItemEdgeData): ItemEdge => {
  const frozen = Object.freeze({ ...data });
  return Object.freeze({
    kind: ITEM_EDGE_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({
        kind: ITEM_EDGE_KIND,
        to: frozen.to.toString(),
        rank: frozen.rank.toString(),
      });
    },
  });
};

const prefixIssues = (
  field: string,
  error: ItemIdValidationError | ItemRankValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createItemEdge = (
  to: ItemId,
  rank: ItemRank,
): ItemEdge => instantiateItemEdge({ to, rank });

export const isItemEdge = (edge: Edge): edge is ItemEdge => edge.kind === ITEM_EDGE_KIND;

export const parseItemEdge = (
  input: unknown,
): Result<ItemEdge, ItemEdgeValidationError> => {
  if (typeof input !== "object" || input === null) {
    return Result.error(
      createValidationError(ITEM_EDGE_KIND, [
        createValidationIssue("edge must be an object", { path: ["value"], code: "type" }),
      ]),
    );
  }

  const snapshot = input as ItemEdgeSnapshot;
  const issues: ValidationIssue[] = [];

  let to: ItemId | undefined;
  if ("to" in snapshot) {
    const result = parseItemId(snapshot.to);
    if (result.type === "error") {
      issues.push(...prefixIssues("to", result.error));
    } else {
      to = result.value;
    }
  } else {
    issues.push(
      createValidationIssue("to is required", {
        path: ["to"],
        code: "required",
      }),
    );
  }

  let rank: ItemRank | undefined;
  if ("rank" in snapshot) {
    const result = parseItemRank(snapshot.rank);
    if (result.type === "error") {
      issues.push(...prefixIssues("rank", result.error));
    } else {
      rank = result.value;
    }
  } else {
    issues.push(
      createValidationIssue("rank is required", {
        path: ["rank"],
        code: "required",
      }),
    );
  }

  if (issues.length > 0 || !to || !rank) {
    return Result.error(createValidationError(ITEM_EDGE_KIND, issues));
  }

  return Result.ok(instantiateItemEdge({ to, rank }));
};

export const parseEdge = (
  input: EdgeSnapshot | unknown,
): Result<Edge, EdgeValidationError> => {
  if (typeof input !== "object" || input === null) {
    return Result.error(
      createValidationError(EDGE_KIND, [
        createValidationIssue("edge must be an object", { path: ["value"], code: "type" }),
      ]),
    );
  }

  const candidate = input as EdgeSnapshot & { kind?: string };
  const kind = candidate.kind ?? ITEM_EDGE_KIND;

  if (kind === ITEM_EDGE_KIND) {
    const result = parseItemEdge(candidate);
    if (result.type === "error") {
      return Result.error(createValidationError(EDGE_KIND, result.error.issues));
    }
    return Result.ok(result.value);
  }

  return Result.error(
    createValidationError(EDGE_KIND, [
      createValidationIssue("edge kind is not recognized", {
        path: ["kind"],
        code: "unknown_variant",
      }),
    ]),
  );
};
