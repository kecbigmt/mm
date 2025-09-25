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

export type RootPlacementBin = Readonly<{
  readonly kind: "root";
  readonly section: SectionPath;
}>;

export type ItemPlacementBin = Readonly<{
  readonly kind: "item";
  readonly parentId: ItemId;
  readonly section?: SectionPath;
}>;

export type PlacementBin = RootPlacementBin | ItemPlacementBin;

export type Placement = Readonly<{
  readonly bin: PlacementBin;
  readonly rank: ItemRank;
  kind(): PlacementBin["kind"];
  parentId(): ItemId | undefined;
  section(): SectionPath | undefined;
  belongsTo(bin: PlacementBin): boolean;
  toJSON(): PlacementSnapshot;
}>;

export type PlacementSnapshot =
  | Readonly<{ kind: "root"; section: string; rank: string }>
  | Readonly<{ kind: "item"; parentId: string; section?: string; rank: string }>;

export type PlacementValidationError = ValidationError<typeof PLACEMENT_KIND>;

const freezeBin = <T extends PlacementBin>(bin: T): T => Object.freeze({ ...bin }) as T;

export const createRootPlacementBin = (
  section: SectionPath,
): RootPlacementBin => freezeBin({ kind: "root" as const, section });

export const createItemPlacementBin = (
  parentId: ItemId,
  section?: SectionPath,
): ItemPlacementBin => freezeBin({ kind: "item" as const, parentId, section });

const instantiate = (bin: PlacementBin, rank: ItemRank): Placement =>
  Object.freeze({
    bin,
    rank,
    kind: () => bin.kind,
    parentId: () => (bin.kind === "item" ? bin.parentId : undefined),
    section: () => bin.section,
    belongsTo(target: PlacementBin) {
      if (target.kind === "root") {
        if (bin.kind !== "root") {
          return false;
        }
        return bin.section.toString() === target.section.toString();
      }

      if (bin.kind !== "item") {
        return false;
      }

      if (bin.parentId.toString() !== target.parentId.toString()) {
        return false;
      }

      if (!target.section) {
        return true;
      }

      return bin.section?.toString() === target.section.toString();
    },
    toJSON() {
      if (bin.kind === "root") {
        return Object.freeze({
          kind: "root" as const,
          section: bin.section.toString(),
          rank: rank.toString(),
        });
      }
      return Object.freeze({
        kind: "item" as const,
        parentId: bin.parentId.toString(),
        section: bin.section?.toString(),
        rank: rank.toString(),
      });
    },
  });

export const createPlacement = (
  bin: PlacementBin,
  rank: ItemRank,
): Placement => instantiate(bin, rank);

export const createRootPlacement = (
  section: SectionPath,
  rank: ItemRank,
): Placement => instantiate(createRootPlacementBin(section), rank);

export const createItemPlacement = (
  parentId: ItemId,
  section: SectionPath | undefined,
  rank: ItemRank,
): Placement => instantiate(createItemPlacementBin(parentId, section), rank);

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

const buildError = (
  issues: ValidationIssue[],
): Result<Placement, PlacementValidationError> =>
  Result.error(createValidationError(PLACEMENT_KIND, issues));

export const parsePlacement = (
  input: unknown,
): Result<Placement, PlacementValidationError> => {
  if (typeof input !== "object" || input === null) {
    return buildError([
      createValidationIssue("placement must be an object", {
        code: "type",
        path: ["value"],
      }),
    ]);
  }

  const snapshot = input as PlacementSnapshot & Partial<Record<string, unknown>>;
  const issues: ValidationIssue[] = [];

  if (!("kind" in snapshot)) {
    issues.push(createValidationIssue("placement kind is required", {
      code: "required",
      path: ["kind"],
    }));
  }

  const rankResult = parseItemRank(snapshot.rank ?? "");
  let rank: ItemRank | undefined;
  if (rankResult.type === "error") {
    issues.push(...mapIssues("rank", rankResult.error));
  } else {
    rank = rankResult.value;
  }

  if (snapshot.kind === "root") {
    const sectionResult = parseSectionPath(snapshot.section ?? "");
    if (sectionResult.type === "error") {
      issues.push(...mapIssues("section", sectionResult.error));
      return buildError(issues);
    }
    if (rank === undefined) {
      return buildError(issues);
    }
    return Result.ok(
      createRootPlacement(sectionResult.value, rank),
    );
  }

  if (snapshot.kind === "item") {
    const parentResult = parseItemId(snapshot.parentId ?? "");
    if (parentResult.type === "error") {
      issues.push(...mapIssues("parentId", parentResult.error));
    }

    let section: SectionPath | undefined;
    if (snapshot.section !== undefined) {
      const sectionResult = parseSectionPath(snapshot.section);
      if (sectionResult.type === "error") {
        issues.push(...mapIssues("section", sectionResult.error));
      } else {
        section = sectionResult.value;
      }
    }

    if (rank === undefined || parentResult.type === "error") {
      return buildError(issues);
    }

    return Result.ok(
      createItemPlacement(parentResult.value, section, rank),
    );
  }

  issues.push(createValidationIssue("placement kind is not recognized", {
    code: "unknown_variant",
    path: ["kind"],
  }));
  return buildError(issues);
};
