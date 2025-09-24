import { Result } from "../../shared/result.ts";

export type HashingError = Readonly<{
  readonly algorithm: string;
  readonly message: string;
  readonly cause?: unknown;
}>;

export const createHashingError = (
  algorithm: string,
  message: string,
  options: { readonly cause?: unknown } = {},
): HashingError =>
  Object.freeze({
    algorithm,
    message,
    cause: options.cause,
  });

export interface HashingService {
  hash(value: string): Promise<Result<string, HashingError>>;
}
