import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  ContainerIndex,
  ContainerIndexValidationError,
  ContainerPath,
  ContainerPathValidationError,
  ItemId,
  ItemIdValidationError,
  ItemRank,
  ItemRankValidationError,
  parseContainerIndex,
  parseContainerPath,
  parseItemId,
  parseItemRank,
} from "../primitives/mod.ts";
import {
  createLegacyPlacement,
  Placement,
  PlacementSnapshot,
  placementLegacyContainer,
  placementToSnapshot,
  parsePlacementSnapshot,
} from "./placement.ts";

const CONTAINER_EDGE_KIND = "ContainerEdge" as const;
const ITEM_EDGE_KIND = "ItemEdge" as const;
const SECTION_EDGE_KIND = "SectionEdge" as const;
const EDGE_KIND = "Edge" as const;

type ContainerEdgeData = Readonly<{
  readonly to: ContainerPath;
  readonly index: ContainerIndex;
}>;

type ItemEdgeData = Readonly<{
  readonly to: ItemId;
  readonly rank: ItemRank;
}>;

type SectionEdgeData = Readonly<{
  readonly to: ItemId;
  readonly placement: Placement;
}>;

export type ContainerEdge = Readonly<{
  readonly kind: typeof CONTAINER_EDGE_KIND;
  readonly data: ContainerEdgeData;
  toJSON(): ContainerEdgeSnapshot;
}>;

export type ItemEdge = Readonly<{
  readonly kind: typeof ITEM_EDGE_KIND;
  readonly data: ItemEdgeData;
  toJSON(): ItemEdgeSnapshot;
}>;

export type SectionEdge = Readonly<{
  readonly kind: typeof SECTION_EDGE_KIND;
  readonly data: SectionEdgeData;
  toJSON(): SectionEdgeSnapshot;
}>;

export type Edge = ContainerEdge | ItemEdge | SectionEdge;

export type ContainerEdgeSnapshot = Readonly<{
  readonly kind?: typeof CONTAINER_EDGE_KIND;
  readonly to: string;
  readonly index: number;
}>;

export type ItemEdgeSnapshot = Readonly<{
  readonly kind?: typeof ITEM_EDGE_KIND;
  readonly to: string;
  readonly rank: string;
}>;

export type SectionEdgeSnapshot = Readonly<{
  readonly kind?: typeof SECTION_EDGE_KIND;
  readonly to: string;
  readonly rank: string;
  readonly container: string;
  readonly parentId?: string;
  readonly placement?: PlacementSnapshot;
}>;

export type EdgeSnapshot =
  | ContainerEdgeSnapshot
  | ItemEdgeSnapshot
  | SectionEdgeSnapshot;

export type ContainerEdgeValidationError = ValidationError<typeof CONTAINER_EDGE_KIND>;
export type ItemEdgeValidationError = ValidationError<typeof ITEM_EDGE_KIND>;
export type SectionEdgeValidationError = ValidationError<typeof SECTION_EDGE_KIND>;
export type EdgeValidationError = ValidationError<typeof EDGE_KIND>;

const instantiateContainerEdge = (data: ContainerEdgeData): ContainerEdge => {
  const frozen = Object.freeze({ ...data });
  return Object.freeze({
    kind: CONTAINER_EDGE_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({
        kind: CONTAINER_EDGE_KIND,
        to: frozen.to.toString(),
        index: frozen.index.value(),
      });
    },
  });
};

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

const instantiateSectionEdge = (data: SectionEdgeData): SectionEdge => {
  const frozen = Object.freeze({ ...data });
  const placementSnapshot = placementToSnapshot(frozen.placement);
  const legacyContainer = placementLegacyContainer(frozen.placement);
  return Object.freeze({
    kind: SECTION_EDGE_KIND,
    data: frozen,
    toJSON() {
      return Object.freeze({
        kind: SECTION_EDGE_KIND,
        to: frozen.to.toString(),
        rank: frozen.placement.rank.toString(),
        container: legacyContainer?.toString() ?? "",
        parentId: placementSnapshot.parentId,
        placement: placementSnapshot,
      });
    },
  });
};

const prefixIssues = (
  field: string,
  error:
    | ContainerPathValidationError
    | ContainerIndexValidationError
    | ItemIdValidationError
    | ItemRankValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createContainerEdge = (
  to: ContainerPath,
  index: ContainerIndex,
): ContainerEdge => instantiateContainerEdge({ to, index });

export const createItemEdge = (
  to: ItemId,
  rank: ItemRank,
): ItemEdge => instantiateItemEdge({ to, rank });

export const createSectionEdge = (
  to: ItemId,
  placement: Placement,
): SectionEdge => instantiateSectionEdge({ to, placement });

export const isItemEdge = (edge: Edge): edge is ItemEdge => edge.kind === "ItemEdge";
export const isContainerEdge = (edge: Edge): edge is ContainerEdge => edge.kind === "ContainerEdge";
export const isSectionEdge = (edge: Edge): edge is SectionEdge => edge.kind === "SectionEdge";

export const sectionEdgeFromLegacy = (
  container: ContainerPath,
  edge: ItemEdge,
): SectionEdge =>
  createSectionEdge(edge.data.to, createLegacyPlacement(container, edge.data.rank));

export const legacyDetailsFromSectionEdge = (
  edge: SectionEdge,
): Readonly<{
  readonly container?: ContainerPath;
  readonly rank: ItemRank;
  readonly child: ItemId;
}> => ({
  container: placementLegacyContainer(edge.data.placement),
  rank: edge.data.placement.rank,
  child: edge.data.to,
});

export const parseContainerEdge = (
  input: unknown,
): Result<ContainerEdge, ContainerEdgeValidationError> => {
  if (typeof input !== "object" || input === null) {
    return Result.error(
      createValidationError(CONTAINER_EDGE_KIND, [
        createValidationIssue("edge must be an object", { path: ["value"], code: "type" }),
      ]),
    );
  }

  const snapshot = input as ContainerEdgeSnapshot;
  const issues: ValidationIssue[] = [];

  let to: ContainerPath | undefined;
  if ("to" in snapshot) {
    const result = parseContainerPath(snapshot.to);
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

  let index: ContainerIndex | undefined;
  if ("index" in snapshot) {
    const result = parseContainerIndex(snapshot.index);
    if (result.type === "error") {
      issues.push(...prefixIssues("index", result.error));
    } else {
      index = result.value;
    }
  } else {
    issues.push(
      createValidationIssue("index is required", {
        path: ["index"],
        code: "required",
      }),
    );
  }

  if (issues.length > 0 || !to || !index) {
    return Result.error(createValidationError(CONTAINER_EDGE_KIND, issues));
  }

  return Result.ok(instantiateContainerEdge({ to, index }));
};

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

export const parseSectionEdge = (
  input: unknown,
): Result<SectionEdge, SectionEdgeValidationError> => {
  if (typeof input !== "object" || input === null) {
    return Result.error(
      createValidationError(SECTION_EDGE_KIND, [
        createValidationIssue("edge must be an object", { path: ["value"], code: "type" }),
      ]),
    );
  }

  const snapshot = input as SectionEdgeSnapshot;
  const issues: ValidationIssue[] = [];

  let child: ItemId | undefined;
  if ("to" in snapshot) {
    const result = parseItemId(snapshot.to);
    if (result.type === "error") {
      issues.push(...prefixIssues("to", result.error));
    } else {
      child = result.value;
    }
  } else {
    issues.push(createValidationIssue("to is required", { path: ["to"], code: "required" }));
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
    issues.push(createValidationIssue("rank is required", { path: ["rank"], code: "required" }));
  }

  let containerPath: ContainerPath | undefined;
  if ("container" in snapshot) {
    const result = parseContainerPath(snapshot.container);
    if (result.type === "error") {
      issues.push(...prefixIssues("container", result.error));
    } else {
      containerPath = result.value;
    }
  } else {
    issues.push(createValidationIssue("container is required", { path: ["container"], code: "required" }));
  }

  if (issues.length > 0 || !child || !rank || !containerPath) {
    return Result.error(createValidationError(SECTION_EDGE_KIND, issues));
  }

  const placementSnapshot: PlacementSnapshot = snapshot.placement ?? {
    kind: "legacy",
    container: snapshot.container,
    parentId: snapshot.parentId,
  };

  const placementResult = parsePlacementSnapshot(
    placementSnapshot,
    containerPath,
    rank,
  );

  if (placementResult.type === "error") {
    return Result.error(
      createValidationError(SECTION_EDGE_KIND, placementResult.error.issues),
    );
  }

  return Result.ok(instantiateSectionEdge({ to: child, placement: placementResult.value }));
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
  const kind = candidate.kind;

  if (kind === CONTAINER_EDGE_KIND) {
    const result = parseContainerEdge(candidate);
    if (result.type === "error") {
      return Result.error(createValidationError(EDGE_KIND, result.error.issues));
    }
    return Result.ok(result.value);
  }

  if (kind === ITEM_EDGE_KIND) {
    const result = parseItemEdge(candidate);
    if (result.type === "error") {
      return Result.error(createValidationError(EDGE_KIND, result.error.issues));
    }
    return Result.ok(result.value);
  }

  if (kind === SECTION_EDGE_KIND) {
    const result = parseSectionEdge(candidate);
    if (result.type === "error") {
      return Result.error(createValidationError(EDGE_KIND, result.error.issues));
    }
    return Result.ok(result.value);
  }

  if ("index" in candidate && "to" in candidate) {
    const result = parseContainerEdge(candidate);
    if (result.type === "error") {
      return Result.error(createValidationError(EDGE_KIND, result.error.issues));
    }
    return Result.ok(result.value);
  }

  if ("rank" in candidate && "container" in candidate && "to" in candidate) {
    const result = parseSectionEdge(candidate);
    if (result.type === "error") {
      return Result.error(createValidationError(EDGE_KIND, result.error.issues));
    }
    return Result.ok(result.value);
  }

  if ("rank" in candidate && "to" in candidate) {
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
