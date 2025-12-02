import { Result } from "../../shared/result.ts";
import {
  createValidationError,
  createValidationIssue,
  ValidationError,
  ValidationIssue,
} from "../../shared/errors.ts";
import {
  AliasSlug,
  AliasSlugValidationError,
  DateTime,
  DateTimeValidationError,
  Duration,
  DurationValidationError,
  ItemIcon,
  ItemIconValidationError,
  ItemId,
  ItemIdValidationError,
  ItemRank,
  ItemRankValidationError,
  ItemStatus,
  itemStatusClosed,
  itemStatusOpen,
  ItemStatusValidationError,
  ItemTitle,
  ItemTitleValidationError,
  parseAliasSlug,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemId,
  parseItemRank,
  parseItemStatus,
  parseItemTitle,
  parsePlacement,
  parseTagSlug,
  Placement,
  PlacementValidationError,
  TagSlug,
  TagSlugValidationError,
} from "../primitives/mod.ts";
import { Edge, EdgeSnapshot, isItemEdge, ItemEdge, parseEdge } from "./edge.ts";

export type ItemData = Readonly<{
  readonly id: ItemId;
  readonly title: ItemTitle;
  readonly icon: ItemIcon;
  readonly status: ItemStatus;
  readonly placement: Placement;
  readonly rank: ItemRank;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly closedAt?: DateTime;
  readonly startAt?: DateTime;
  readonly duration?: Duration;
  readonly dueAt?: DateTime;
  readonly snoozeUntil?: DateTime;
  readonly alias?: AliasSlug;
  readonly context?: TagSlug;
  readonly body?: string;
}>;

export type Item = Readonly<{
  readonly kind: "Item";
  readonly data: ItemData;
  readonly edges: ReadonlyArray<ItemEdge>;
  itemEdges(): ReadonlyArray<ItemEdge>;
  close(closedAt: DateTime): Item;
  reopen(reopenedAt: DateTime): Item;
  relocate(placement: Placement, rank: ItemRank, occurredAt: DateTime): Item;
  retitle(title: ItemTitle, updatedAt: DateTime): Item;
  changeIcon(icon: ItemIcon, updatedAt: DateTime): Item;
  setBody(body: string | undefined, updatedAt: DateTime): Item;
  schedule(
    schedule: Readonly<{
      startAt?: DateTime;
      duration?: Duration;
      dueAt?: DateTime;
    }>,
    updatedAt: DateTime,
  ): Item;
  snooze(snoozeUntil: DateTime | undefined, occurredAt: DateTime): Item;
  setAlias(alias: AliasSlug | undefined, updatedAt: DateTime): Item;
  setContext(context: TagSlug | undefined, updatedAt: DateTime): Item;
  toJSON(): ItemSnapshot;
}>;

export type ItemSnapshot = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly status: string;
  readonly placement: string;
  readonly rank: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
  readonly startAt?: string;
  readonly duration?: string;
  readonly dueAt?: string;
  readonly snoozeUntil?: string;
  readonly alias?: string;
  readonly context?: string;
  readonly body?: string;
  readonly edges?: ReadonlyArray<EdgeSnapshot>;
}>;

export type ItemValidationError = ValidationError<"Item">;

const makeData = (data: ItemData): ItemData => Object.freeze({ ...data });

const makeEdges = (
  edges: ReadonlyArray<Edge>,
): Readonly<{
  edges: ReadonlyArray<ItemEdge>;
}> => {
  const itemEdges = Object.freeze(edges.filter(isItemEdge));
  return {
    edges: itemEdges,
  } as const;
};

const instantiate = (
  data: ItemData,
  edges: ReadonlyArray<Edge>,
): Item => {
  const frozenData = makeData(data);
  const edgeAccess = makeEdges(edges);

  const close = function (this: Item, closedAt: DateTime): Item {
    if (this.data.status.isClosed()) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        status: itemStatusClosed(),
        closedAt,
        updatedAt: closedAt,
      },
      this.edges,
    );
  };

  const reopen = function (this: Item, reopenedAt: DateTime): Item {
    if (this.data.status.isOpen() && !this.data.closedAt) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        status: itemStatusOpen(),
        closedAt: undefined,
        updatedAt: reopenedAt,
      },
      this.edges,
    );
  };

  const relocate = function (
    this: Item,
    placement: Placement,
    rank: ItemRank,
    occurredAt: DateTime,
  ): Item {
    const samePlacement = this.data.placement.equals(placement);
    const sameRank = this.data.rank.compare(rank) === 0;
    if (samePlacement && sameRank) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        placement,
        rank,
        updatedAt: occurredAt,
      },
      this.edges,
    );
  };

  const retitle = function (
    this: Item,
    title: ItemTitle,
    updatedAt: DateTime,
  ): Item {
    if (this.data.title.toString() === title.toString()) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        title,
        updatedAt,
      },
      this.edges,
    );
  };

  const changeIcon = function (
    this: Item,
    icon: ItemIcon,
    updatedAt: DateTime,
  ): Item {
    if (this.data.icon.toString() === icon.toString()) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        icon,
        updatedAt,
      },
      this.edges,
    );
  };

  const setBody = function (
    this: Item,
    body: string | undefined,
    updatedAt: DateTime,
  ): Item {
    let normalized: string | undefined;
    if (typeof body === "string") {
      const trimmed = body.trim();
      normalized = trimmed.length > 0 ? trimmed : undefined;
    }
    if (this.data.body === normalized) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        body: normalized,
        updatedAt,
      },
      this.edges,
    );
  };

  const schedule = function (
    this: Item,
    schedule: Readonly<{
      startAt?: DateTime;
      duration?: Duration;
      dueAt?: DateTime;
    }>,
    updatedAt: DateTime,
  ): Item {
    const next = {
      ...this.data,
      startAt: schedule.startAt,
      duration: schedule.duration,
      dueAt: schedule.dueAt,
      updatedAt,
    } as ItemData;
    return instantiate(next, this.edges);
  };

  const snooze = function (
    this: Item,
    snoozeUntil: DateTime | undefined,
    occurredAt: DateTime,
  ): Item {
    const next = {
      ...this.data,
      snoozeUntil,
      updatedAt: occurredAt,
    } as ItemData;
    return instantiate(next, this.edges);
  };

  const setAlias = function (
    this: Item,
    alias: AliasSlug | undefined,
    updatedAt: DateTime,
  ): Item {
    const current = this.data.alias?.toString();
    const next = alias?.toString();
    if (current === next) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        alias,
        updatedAt,
      },
      this.edges,
    );
  };

  const setContext = function (
    this: Item,
    context: TagSlug | undefined,
    updatedAt: DateTime,
  ): Item {
    const current = this.data.context?.toString();
    const next = context?.toString();
    if (current === next) {
      return this;
    }
    return instantiate(
      {
        ...this.data,
        context,
        updatedAt,
      },
      this.edges,
    );
  };

  const toJSON = function (this: Item): ItemSnapshot {
    const edgesSnapshot = this.edges.map((edge) => edge.toJSON());
    return {
      id: this.data.id.toString(),
      title: this.data.title.toString(),
      icon: this.data.icon.toString(),
      status: this.data.status.toString(),
      placement: this.data.placement.toString(),
      rank: this.data.rank.toString(),
      createdAt: this.data.createdAt.toString(),
      updatedAt: this.data.updatedAt.toString(),
      closedAt: this.data.closedAt?.toString(),
      startAt: this.data.startAt?.toString(),
      duration: this.data.duration?.toString(),
      dueAt: this.data.dueAt?.toString(),
      snoozeUntil: this.data.snoozeUntil?.toString(),
      alias: this.data.alias?.toString(),
      context: this.data.context?.toString(),
      body: this.data.body,
      edges: edgesSnapshot.length > 0 ? edgesSnapshot : undefined,
    };
  };

  return Object.freeze({
    kind: "Item" as const,
    data: frozenData,
    edges: edgeAccess.edges,
    itemEdges: () => edgeAccess.edges,
    close,
    reopen,
    relocate,
    retitle,
    changeIcon,
    setBody,
    schedule,
    snooze,
    setAlias,
    setContext,
    toJSON,
  });
};

const prefixIssues = (
  field: string,
  error:
    | ItemStatusValidationError
    | ItemIconValidationError
    | AliasSlugValidationError
    | ItemTitleValidationError
    | ItemIdValidationError
    | DateTimeValidationError
    | DurationValidationError
    | TagSlugValidationError
    | ItemRankValidationError
    | PlacementValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createItem = (
  data: ItemData,
  options: Readonly<{
    edges?: ReadonlyArray<Edge>;
  }> = {},
): Item => instantiate(data, options.edges ?? []);

export const parseItem = (
  snapshot: ItemSnapshot,
): Result<Item, ItemValidationError> => {
  const issues: ValidationIssue[] = [];
  const edges: Edge[] = [];

  const idResult = parseItemId(snapshot.id);
  const titleResult = parseItemTitle(snapshot.title);
  const iconResult = parseItemIcon(snapshot.icon);
  const statusResult = parseItemStatus(snapshot.status);
  const placementResult = parsePlacement(snapshot.placement);
  const rankResult = parseItemRank(snapshot.rank);
  const createdAtResult = parseDateTime(snapshot.createdAt);
  const updatedAtResult = parseDateTime(snapshot.updatedAt);

  if (idResult.type === "error") {
    issues.push(...prefixIssues("id", idResult.error));
  }
  if (titleResult.type === "error") {
    issues.push(...prefixIssues("title", titleResult.error));
  }
  if (iconResult.type === "error") {
    issues.push(...prefixIssues("icon", iconResult.error));
  }
  if (statusResult.type === "error") {
    issues.push(...prefixIssues("status", statusResult.error));
  }
  if (placementResult.type === "error") {
    issues.push(...prefixIssues("placement", placementResult.error));
  }
  if (rankResult.type === "error") {
    issues.push(...prefixIssues("rank", rankResult.error));
  }
  if (createdAtResult.type === "error") {
    issues.push(...prefixIssues("createdAt", createdAtResult.error));
  }
  if (updatedAtResult.type === "error") {
    issues.push(...prefixIssues("updatedAt", updatedAtResult.error));
  }

  let closedAt: DateTime | undefined;
  if (snapshot.closedAt !== undefined) {
    const result = parseDateTime(snapshot.closedAt);
    if (result.type === "error") {
      issues.push(...prefixIssues("closedAt", result.error));
    } else {
      closedAt = result.value;
    }
  }

  let startAt: DateTime | undefined;
  if (snapshot.startAt !== undefined) {
    const result = parseDateTime(snapshot.startAt);
    if (result.type === "error") {
      issues.push(...prefixIssues("startAt", result.error));
    } else {
      startAt = result.value;
    }
  }

  let dueAt: DateTime | undefined;
  if (snapshot.dueAt !== undefined) {
    const result = parseDateTime(snapshot.dueAt);
    if (result.type === "error") {
      issues.push(...prefixIssues("dueAt", result.error));
    } else {
      dueAt = result.value;
    }
  }

  let duration: Duration | undefined;
  if (snapshot.duration !== undefined) {
    const result = parseDuration(snapshot.duration);
    if (result.type === "error") {
      issues.push(...prefixIssues("duration", result.error));
    } else {
      duration = result.value;
    }
  }

  let snoozeUntil: DateTime | undefined;
  if (snapshot.snoozeUntil !== undefined) {
    const result = parseDateTime(snapshot.snoozeUntil);
    if (result.type === "error") {
      issues.push(...prefixIssues("snoozeUntil", result.error));
    } else {
      snoozeUntil = result.value;
    }
  }

  let alias: AliasSlug | undefined;
  if (snapshot.alias !== undefined) {
    const result = parseAliasSlug(snapshot.alias);
    if (result.type === "error") {
      issues.push(...prefixIssues("alias", result.error));
    } else {
      alias = result.value;
    }
  }

  let context: TagSlug | undefined;
  if (snapshot.context !== undefined) {
    const result = parseTagSlug(snapshot.context);
    if (result.type === "error") {
      issues.push(...prefixIssues("context", result.error));
    } else {
      context = result.value;
    }
  }

  if (snapshot.edges !== undefined) {
    for (const [index, edgeSnapshot] of snapshot.edges.entries()) {
      const result = parseEdge(edgeSnapshot);
      if (result.type === "error") {
        issues.push(
          ...result.error.issues.map((issue) =>
            createValidationIssue(issue.message, {
              code: issue.code,
              path: ["edges", index, ...issue.path],
            })
          ),
        );
      } else {
        edges.push(result.value);
      }
    }
  }

  if (issues.length > 0) {
    return Result.error(createValidationError("Item", issues));
  }

  const id = Result.unwrap(idResult);
  const title = Result.unwrap(titleResult);
  const icon = Result.unwrap(iconResult);
  const status = Result.unwrap(statusResult);
  const placement = Result.unwrap(placementResult);
  const rank = Result.unwrap(rankResult);
  const createdAt = Result.unwrap(createdAtResult);
  const updatedAt = Result.unwrap(updatedAtResult);

  const data: ItemData = {
    id,
    title,
    icon,
    status,
    placement,
    rank,
    createdAt,
    updatedAt,
    closedAt,
    startAt,
    duration,
    dueAt,
    snoozeUntil,
    alias,
    context,
    body: snapshot.body?.trim() ?? undefined,
  };

  return Result.ok(instantiate(data, edges));
};
