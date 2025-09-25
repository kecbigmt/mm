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
import {
  parseSectionPath,
  SectionPath,
  SectionPathValidationError,
} from "../primitives/section_path.ts";

const PLACEMENT_KIND = "Placement" as const;

export type RootPlacement = Readonly<{
  readonly kind: "root";
  readonly section: SectionPath;
  readonly rank: ItemRank;
  toJSON(): PlacementSnapshot;
}>;

export type ItemPlacement = Readonly<{
  readonly kind: "item";
  readonly parentId: ItemId;
  readonly section: SectionPath;
  readonly rank: ItemRank;
  toJSON(): PlacementSnapshot;
}>;

export type Placement = RootPlacement | ItemPlacement;

export type PlacementSnapshot =
  | Readonly<{ kind: "root"; section: string; rank: string }>
  | Readonly<{ kind: "item"; parentId: string; section: string; rank: string }>;

export type PlacementValidationError = ValidationError<typeof PLACEMENT_KIND>;
const instantiateRoot = (
  section: SectionPath,
  rank: ItemRank,
): RootPlacement =>
  Object.freeze({
    kind: "root",
    section,
    rank,
    toJSON() {
      return Object.freeze({
        kind: "root" as const,
        section: section.toString(),
        rank: rank.toString(),
      });
    },
  });

const instantiateItem = (
  parentId: ItemId,
  section: SectionPath,
  rank: ItemRank,
): ItemPlacement =>
  Object.freeze({
    kind: "item",
    parentId,
    section,
    rank,
    toJSON() {
      return Object.freeze({
        kind: "item" as const,
        parentId: parentId.toString(),
        section: section.toString(),
        rank: rank.toString(),
      });
    },
  });

const mapIssues = (
  field: string,
  error:
    | ItemIdValidationError
    | SectionPathValidationError
    | ItemRankValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createRootPlacement = (
  section: SectionPath,
  rank: ItemRank,
): Placement => instantiateRoot(section, rank);

export const createItemPlacement = (
  parentId: ItemId,
  section: SectionPath,
  rank: ItemRank,
): Placement => instantiateItem(parentId, section, rank);

export const parsePlacement = (
  input: unknown,
): Result<Placement, PlacementValidationError> => {
  if (typeof input !== "object" || input === null) {
    return Result.error(
      createValidationError(PLACEMENT_KIND, [
        createValidationIssue("placement must be an object", {
          code: "type",
          path: ["value"],
        }),
      ]),
    );
  }

  const snapshot = input as PlacementSnapshot & Partial<Record<string, unknown>>;
  const issues: ValidationIssue[] = [];

  if (!("kind" in snapshot)) {
    issues.push(createValidationIssue("placement kind is required", {
      code: "required",
      path: ["kind"],
    }));
  }

  const sectionResult = parseSectionPath(snapshot.section ?? "");
  let section: SectionPath | undefined;
  if (sectionResult.type === "error") {
    issues.push(...mapIssues("section", sectionResult.error));
  } else {
    section = sectionResult.value;
  }

  const rankResult = parseItemRank(snapshot.rank ?? "");
  let rank: ItemRank | undefined;
  if (rankResult.type === "error") {
    issues.push(...mapIssues("rank", rankResult.error));
  } else {
    rank = rankResult.value;
  }

  if (issues.length > 0) {
    return Result.error(createValidationError(PLACEMENT_KIND, issues));
  }

  if (snapshot.kind === "root") {
    return Result.ok(instantiateRoot(section as SectionPath, rank as ItemRank));
  }

  if (snapshot.kind === "item") {
    const parentResult = parseItemId(snapshot.parentId ?? "");
    if (parentResult.type === "error") {
      const parentIssues = mapIssues("parentId", parentResult.error);
      return Result.error(createValidationError(PLACEMENT_KIND, parentIssues));
    }
    return Result.ok(instantiateItem(parentResult.value, section as SectionPath, rank as ItemRank));
  }

  return Result.error(
    createValidationError(PLACEMENT_KIND, [
      createValidationIssue("placement kind is not recognized", {
        code: "unknown_variant",
        path: ["kind"],
      }),
    ]),
  );
};
