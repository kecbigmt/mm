import { Item } from "../../domain/models/item.ts";

export type ItemDto = Readonly<{
  id: string;
  icon: string;
  title: string;
  status: string;
  rank: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  startAt?: string;
  duration?: string;
  dueAt?: string;
  snoozeUntil?: string;
  alias?: string;
  project?: string;
  contexts?: readonly string[];
  body?: string;
}>;

export const toItemDto = (item: Item): ItemDto => {
  const d = item.data;
  return Object.freeze({
    id: d.id.toString(),
    icon: d.icon.toString(),
    title: d.title.toString(),
    status: d.status.isOpen() ? "open" : "closed",
    rank: d.rank.toString(),
    directory: d.directory.toString(),
    createdAt: d.createdAt.toString(),
    updatedAt: d.updatedAt.toString(),
    ...(d.closedAt ? { closedAt: d.closedAt.toString() } : {}),
    ...(d.startAt ? { startAt: d.startAt.toString() } : {}),
    ...(d.duration ? { duration: d.duration.toString() } : {}),
    ...(d.dueAt ? { dueAt: d.dueAt.toString() } : {}),
    ...(d.snoozeUntil ? { snoozeUntil: d.snoozeUntil.toString() } : {}),
    ...(d.alias ? { alias: d.alias.toString() } : {}),
    ...(d.project ? { project: d.project.toString() } : {}),
    ...(d.contexts && d.contexts.length > 0
      ? { contexts: d.contexts.map((c) => c.toString()) }
      : {}),
    ...(d.body ? { body: d.body } : {}),
  });
};
