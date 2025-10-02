import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  ContainerPath,
  ContainerPathValidationError,
  parseContainerPath,
} from "../primitives/container_path.ts";
import { ItemId, ItemIdValidationError, parseItemId } from "../primitives/item_id.ts";
import { ItemRank } from "../primitives/item_rank.ts";

const PLACEMENT_KIND = "Placement" as const;
const LEGACY_SECTION_KIND = "legacy" as const;

type PlacementSection = LegacyPlacementSection;

export type LegacyPlacementSection = Readonly<{
  readonly kind: typeof LEGACY_SECTION_KIND;
  readonly container: ContainerPath;
}>;

export type Placement = Readonly<{
  readonly parentId?: ItemId;
  readonly section: PlacementSection;
  readonly rank: ItemRank;
}>;

export type PlacementSnapshot =
  | LegacyPlacementSnapshot;

export type LegacyPlacementSnapshot = Readonly<{
  readonly kind?: typeof LEGACY_SECTION_KIND;
  readonly parentId?: string;
  readonly container: string;
}>;

export type PlacementValidationError = ValidationError<typeof PLACEMENT_KIND>;

type SectionParseResult = Result<PlacementSection, PlacementValidationError>;

type SectionSnapshot = PlacementSnapshot & { kind?: string };

const prefixIssues = (
  field: string,
  error:
    | ItemIdValidationError
    | ContainerPathValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

const parseLegacySection = (
  snapshot: LegacyPlacementSnapshot,
): SectionParseResult => {
  if (!("container" in snapshot)) {
    return Result.error(
      createValidationError(PLACEMENT_KIND, [
        createValidationIssue("container is required", {
          path: ["placement", "container"],
          code: "required",
        }),
      ]),
    );
  }

  const containerResult = parseContainerPath(snapshot.container);
  if (containerResult.type === "error") {
    return Result.error(
      createValidationError(PLACEMENT_KIND, prefixIssues("placement", containerResult.error)),
    );
  }

  return Result.ok(Object.freeze({
    kind: LEGACY_SECTION_KIND,
    container: containerResult.value,
  }));
};

const parseSectionSnapshot = (
  snapshot: SectionSnapshot,
): SectionParseResult => {
  const kind = snapshot.kind ?? LEGACY_SECTION_KIND;
  if (kind === LEGACY_SECTION_KIND) {
    return parseLegacySection(snapshot as LegacyPlacementSnapshot);
  }

  return Result.error(
    createValidationError(PLACEMENT_KIND, [
      createValidationIssue("placement kind is not supported", {
        path: ["placement", "kind"],
        code: "unknown_variant",
      }),
    ]),
  );
};

export const createLegacyPlacement = (
  container: ContainerPath,
  rank: ItemRank,
  parentId?: ItemId,
): Placement =>
  Object.freeze({
    parentId,
    section: Object.freeze({
      kind: LEGACY_SECTION_KIND,
      container,
    }),
    rank,
  });

export const placementEquals = (left: Placement, right: Placement): boolean => {
  const sameParent = left.parentId?.toString() === right.parentId?.toString();
  const sameRank = left.rank.compare(right.rank) === 0;
  if (left.section.kind === LEGACY_SECTION_KIND && right.section.kind === LEGACY_SECTION_KIND) {
    const leftContainer = left.section.container.toString();
    const rightContainer = right.section.container.toString();
    return sameParent && sameRank && leftContainer === rightContainer;
  }
  return sameParent && sameRank && left.section.kind === right.section.kind;
};

export const placementLegacyContainer = (
  placement: Placement,
): ContainerPath | undefined => {
  if (placement.section.kind === LEGACY_SECTION_KIND) {
    return placement.section.container;
  }
  return undefined;
};

export const placementToSnapshot = (
  placement: Placement,
): PlacementSnapshot => {
  if (placement.section.kind === LEGACY_SECTION_KIND) {
    return Object.freeze({
      kind: LEGACY_SECTION_KIND,
      parentId: placement.parentId?.toString(),
      container: placement.section.container.toString(),
    });
  }

  return Object.freeze({
    kind: LEGACY_SECTION_KIND,
    parentId: placement.parentId?.toString(),
    container: placement.section.kind,
  });
};

export const parsePlacementSnapshot = (
  snapshot: PlacementSnapshot | undefined,
  fallbackContainer: ContainerPath,
  rank: ItemRank,
): Result<Placement, PlacementValidationError> => {
  if (!snapshot) {
    return Result.ok(createLegacyPlacement(fallbackContainer, rank));
  }

  const sectionResult = parseSectionSnapshot(snapshot as SectionSnapshot);
  if (sectionResult.type === "error") {
    return sectionResult;
  }

  let parentId: ItemId | undefined;
  if (snapshot.parentId !== undefined) {
    const parentResult = parseItemId(snapshot.parentId);
    if (parentResult.type === "error") {
      return Result.error(
        createValidationError(PLACEMENT_KIND, prefixIssues("placement", parentResult.error)),
      );
    }
    parentId = parentResult.value;
  }

  const section = sectionResult.value;
  if (section.kind === LEGACY_SECTION_KIND) {
    return Result.ok(createLegacyPlacement(section.container, rank, parentId));
  }

  return Result.error(
    createValidationError(PLACEMENT_KIND, [
      createValidationIssue("placement kind is not supported", {
        path: ["placement", "kind"],
        code: "unknown_variant",
      }),
    ]),
  );
};
