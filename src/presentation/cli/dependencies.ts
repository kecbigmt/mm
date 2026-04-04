import { Result } from "../../shared/result.ts";
import {
  type CoreDependencies,
  type CoreDependencyError,
  loadCoreDependencies,
  type LoadCoreDependenciesOptions,
} from "../../application/runtime.ts";

export type CliDependencies = CoreDependencies;

export type CliDependencyError = CoreDependencyError;

export type LoadCliDependenciesOptions = LoadCoreDependenciesOptions;

export const loadCliDependencies = (
  workspacePath?: string,
  options?: LoadCliDependenciesOptions,
): Promise<Result<CliDependencies, CliDependencyError>> =>
  loadCoreDependencies(workspacePath, options);
