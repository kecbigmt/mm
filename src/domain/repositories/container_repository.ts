import { Result } from "../../shared/result.ts";
import { Edge } from "../models/edge.ts";
import { Container } from "../models/container.ts";
import { ContainerPath } from "../primitives/mod.ts";
import { RepositoryError } from "./repository_error.ts";

export interface ContainerRepository {
  load(path: ContainerPath): Promise<Result<Container | undefined, RepositoryError>>;
  ensure(path: ContainerPath): Promise<Result<Container, RepositoryError>>;
  replaceEdges(
    path: ContainerPath,
    edges: ReadonlyArray<Edge>,
  ): Promise<Result<void, RepositoryError>>;
}
