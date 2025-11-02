import { Result } from "../../shared/result.ts";
import { RepositoryError } from "./repository_error.ts";
import { Path } from "../primitives/path.ts";

export interface StateRepository {
  loadCwd(): Promise<Result<Path | undefined, RepositoryError>>;
  saveCwd(path: Path): Promise<Result<void, RepositoryError>>;
}
