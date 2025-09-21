import type { Container } from "./container.ts";
import type { Item } from "./item.ts";
import { ContainerPath } from "../primitives/mod.ts";
import { ContainerEdge, Edge, ItemEdge } from "./edge.ts";

export type Node = Readonly<{
  readonly kind: string;
  readonly path: ContainerPath;
  readonly edges: ReadonlyArray<Edge>;
  itemEdges(): ReadonlyArray<ItemEdge>;
  containerEdges(): ReadonlyArray<ContainerEdge>;
}>;

type ContainerKind = Container["kind"];

const CONTAINER_KINDS: ReadonlySet<ContainerKind> = new Set<ContainerKind>([
  "WorkspaceRoot",
  "CalendarYear",
  "CalendarMonth",
  "CalendarDay",
  "ItemRoot",
  "ItemNumbering",
]);

export const isContainerNode = (node: Node): node is Container =>
  CONTAINER_KINDS.has(node.kind as ContainerKind);

export const isItemNode = (node: Node): node is Item => node.kind === "Item";
