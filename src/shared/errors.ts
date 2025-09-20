export type ValidationIssue = Readonly<{
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
  readonly code?: string;
}>;

export interface BaseError<TKind extends string = string> {
  readonly kind: TKind;
  readonly message: string;
  readonly cause?: unknown;
  toString(): string;
}

export interface ValidationError<K extends string>
  extends BaseError<"ValidationError"> {
  readonly objectKind: K;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

function validationToString(this: ValidationError<string>): string {
  const issues = this.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") + ": " : "";
      const code = issue.code ? `[${issue.code}] ` : "";
      return `${path}${code}${issue.message}`;
    })
    .join(", ");
  return `${this.kind}(${this.objectKind}): ${issues || this.message}`;
}

export const createValidationIssue = (
  message: string,
  options?: {
    path?: ReadonlyArray<string | number>;
    code?: string;
  },
): ValidationIssue => ({
  message,
  path: options?.path ?? [],
  code: options?.code,
});

export const createValidationError = <K extends string>(
  objectKind: K,
  issues: ReadonlyArray<ValidationIssue>,
  options?: {
    message?: string;
    cause?: unknown;
  },
): ValidationError<K> => {
  const error: ValidationError<K> = {
    kind: "ValidationError",
    objectKind,
    message: options?.message ?? `${objectKind} is invalid`,
    issues,
    cause: options?.cause,
    toString: validationToString,
  };
  return Object.freeze(error);
};
