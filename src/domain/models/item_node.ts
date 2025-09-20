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
  ContainerPath,
  ContainerPathValidationError,
  ContextTag,
  ContextTagValidationError,
  DateTime,
  DateTimeValidationError,
  Duration,
  DurationValidationError,
  ItemIcon,
  ItemIconValidationError,
  ItemStatus,
  itemStatusClosed,
  itemStatusOpen,
  ItemStatusValidationError,
  NodeId,
  NodeIdValidationError,
  NodeRank,
  NodeRankValidationError,
  NodeTitle,
  NodeTitleValidationError,
  parseAliasSlug,
  parseContainerPath,
  parseContextTag,
  parseDateTime,
  parseDuration,
  parseItemIcon,
  parseItemStatus,
  parseNodeId,
  parseNodeRank,
  parseNodeTitle,
} from "../primitives/mod.ts";

export type ItemNodeData = Readonly<{
  readonly id: NodeId;
  readonly title: NodeTitle;
  readonly icon: ItemIcon;
  readonly status: ItemStatus;
  readonly container: ContainerPath;
  readonly rank: NodeRank;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly closedAt?: DateTime;
  readonly startAt?: DateTime;
  readonly duration?: Duration;
  readonly dueAt?: DateTime;
  readonly alias?: AliasSlug;
  readonly context?: ContextTag;
  readonly body?: string;
}>;

export type ItemNode = Readonly<{
  readonly kind: "ItemNode";
  readonly data: ItemNodeData;
  close(closedAt: DateTime): ItemNode;
  reopen(reopenedAt: DateTime): ItemNode;
  relocate(
    container: ContainerPath,
    rank: NodeRank,
    occurredAt: DateTime,
  ): ItemNode;
  retitle(title: NodeTitle, updatedAt: DateTime): ItemNode;
  changeIcon(icon: ItemIcon, updatedAt: DateTime): ItemNode;
  setBody(body: string | undefined, updatedAt: DateTime): ItemNode;
  schedule(
    schedule: Readonly<{
      startAt?: DateTime;
      duration?: Duration;
      dueAt?: DateTime;
    }>,
    updatedAt: DateTime,
  ): ItemNode;
  setAlias(alias: AliasSlug | undefined, updatedAt: DateTime): ItemNode;
  setContext(
    context: ContextTag | undefined,
    updatedAt: DateTime,
  ): ItemNode;
  toJSON(): ItemNodeSnapshot;
}>;

export type ItemNodeSnapshot = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly status: string;
  readonly container: string;
  readonly rank: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
  readonly startAt?: string;
  readonly duration?: string;
  readonly dueAt?: string;
  readonly alias?: string;
  readonly context?: string;
  readonly body?: string;
}>;

export type ItemNodeValidationError = ValidationError<"ItemNode">;

const makeData = (data: ItemNodeData): ItemNodeData => Object.freeze({ ...data });

const instantiate = (data: ItemNodeData): ItemNode => {
  const frozenData = makeData(data);

  const close = function (this: ItemNode, closedAt: DateTime): ItemNode {
    if (this.data.status.isClosed()) {
      return this;
    }
    return instantiate({
      ...this.data,
      status: itemStatusClosed(),
      closedAt,
      updatedAt: closedAt,
    });
  };

  const reopen = function (this: ItemNode, reopenedAt: DateTime): ItemNode {
    if (this.data.status.isOpen() && !this.data.closedAt) {
      return this;
    }
    return instantiate({
      ...this.data,
      status: itemStatusOpen(),
      closedAt: undefined,
      updatedAt: reopenedAt,
    });
  };

  const relocate = function (
    this: ItemNode,
    container: ContainerPath,
    rank: NodeRank,
    occurredAt: DateTime,
  ): ItemNode {
    const sameContainer = this.data.container.toString() === container.toString();
    const sameRank = this.data.rank.compare(rank) === 0;
    if (sameContainer && sameRank) {
      return this;
    }
    return instantiate({
      ...this.data,
      container,
      rank,
      updatedAt: occurredAt,
    });
  };

  const retitle = function (
    this: ItemNode,
    title: NodeTitle,
    updatedAt: DateTime,
  ): ItemNode {
    if (this.data.title.toString() === title.toString()) {
      return this;
    }
    return instantiate({
      ...this.data,
      title,
      updatedAt,
    });
  };

  const changeIcon = function (
    this: ItemNode,
    icon: ItemIcon,
    updatedAt: DateTime,
  ): ItemNode {
    if (this.data.icon.toString() === icon.toString()) {
      return this;
    }
    return instantiate({
      ...this.data,
      icon,
      updatedAt,
    });
  };

  const setBody = function (
    this: ItemNode,
    body: string | undefined,
    updatedAt: DateTime,
  ): ItemNode {
    let normalized: string | undefined;
    if (typeof body === "string") {
      const trimmed = body.trim();
      normalized = trimmed.length > 0 ? trimmed : undefined;
    }
    if (this.data.body === normalized) {
      return this;
    }
    return instantiate({
      ...this.data,
      body: normalized,
      updatedAt,
    });
  };

  const schedule = function (
    this: ItemNode,
    schedule: Readonly<{
      startAt?: DateTime;
      duration?: Duration;
      dueAt?: DateTime;
    }>,
    updatedAt: DateTime,
  ): ItemNode {
    const next = {
      ...this.data,
      startAt: schedule.startAt,
      duration: schedule.duration,
      dueAt: schedule.dueAt,
      updatedAt,
    } as ItemNodeData;
    return instantiate(next);
  };

  const setAlias = function (
    this: ItemNode,
    alias: AliasSlug | undefined,
    updatedAt: DateTime,
  ): ItemNode {
    const current = this.data.alias?.toString();
    const next = alias?.toString();
    if (current === next) {
      return this;
    }
    return instantiate({
      ...this.data,
      alias,
      updatedAt,
    });
  };

  const setContext = function (
    this: ItemNode,
    context: ContextTag | undefined,
    updatedAt: DateTime,
  ): ItemNode {
    const current = this.data.context?.toString();
    const next = context?.toString();
    if (current === next) {
      return this;
    }
    return instantiate({
      ...this.data,
      context,
      updatedAt,
    });
  };

  const toJSON = function (this: ItemNode): ItemNodeSnapshot {
    return {
      id: this.data.id.toString(),
      title: this.data.title.toString(),
      icon: this.data.icon.toString(),
      status: this.data.status.toString(),
      container: this.data.container.toString(),
      rank: this.data.rank.toString(),
      createdAt: this.data.createdAt.toString(),
      updatedAt: this.data.updatedAt.toString(),
      closedAt: this.data.closedAt?.toString(),
      startAt: this.data.startAt?.toString(),
      duration: this.data.duration?.toString(),
      dueAt: this.data.dueAt?.toString(),
      alias: this.data.alias?.toString(),
      context: this.data.context?.toString(),
      body: this.data.body,
    };
  };

  return Object.freeze({
    kind: "ItemNode" as const,
    data: frozenData,
    close,
    reopen,
    relocate,
    retitle,
    changeIcon,
    setBody,
    schedule,
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
    | ContainerPathValidationError
    | NodeRankValidationError
    | NodeTitleValidationError
    | NodeIdValidationError
    | DateTimeValidationError
    | DurationValidationError
    | ContextTagValidationError,
): ValidationIssue[] =>
  error.issues.map((issue) =>
    createValidationIssue(issue.message, {
      code: issue.code,
      path: [field, ...issue.path],
    })
  );

export const createItemNode = (data: ItemNodeData): ItemNode => instantiate(data);

export const parseItemNode = (
  snapshot: ItemNodeSnapshot,
): Result<ItemNode, ItemNodeValidationError> => {
  const issues: ValidationIssue[] = [];

  const idResult = parseNodeId(snapshot.id);
  const titleResult = parseNodeTitle(snapshot.title);
  const iconResult = parseItemIcon(snapshot.icon);
  const statusResult = parseItemStatus(snapshot.status);
  const containerResult = parseContainerPath(snapshot.container);
  const rankResult = parseNodeRank(snapshot.rank);
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
  if (containerResult.type === "error") {
    issues.push(...prefixIssues("container", containerResult.error));
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

  let alias: AliasSlug | undefined;
  if (snapshot.alias !== undefined) {
    const result = parseAliasSlug(snapshot.alias);
    if (result.type === "error") {
      issues.push(...prefixIssues("alias", result.error));
    } else {
      alias = result.value;
    }
  }

  let context: ContextTag | undefined;
  if (snapshot.context !== undefined) {
    const result = parseContextTag(snapshot.context);
    if (result.type === "error") {
      issues.push(...prefixIssues("context", result.error));
    } else {
      context = result.value;
    }
  }

  if (issues.length > 0) {
    return Result.error(createValidationError("ItemNode", issues));
  }

  const id = Result.unwrap(idResult);
  const title = Result.unwrap(titleResult);
  const icon = Result.unwrap(iconResult);
  const status = Result.unwrap(statusResult);
  const container = Result.unwrap(containerResult);
  const rank = Result.unwrap(rankResult);
  const createdAt = Result.unwrap(createdAtResult);
  const updatedAt = Result.unwrap(updatedAtResult);

  const data: ItemNodeData = {
    id,
    title,
    icon,
    status,
    container,
    rank,
    createdAt,
    updatedAt,
    closedAt,
    startAt,
    duration,
    dueAt,
    alias,
    context,
    body: snapshot.body?.trim() ?? undefined,
  };

  return Result.ok(instantiate(data));
};
