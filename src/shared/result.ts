export type Ok<T> = { readonly type: "ok"; readonly value: T };
export type Err<E> = { readonly type: "error"; readonly error: E };

export type Result<T, E> = Ok<T> | Err<E>;

export const Result = {
  ok<T>(value: T): Result<T, never> {
    return { type: "ok", value };
  },

  error<E>(error: E): Result<never, E> {
    return { type: "error", error };
  },

  isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result.type === "ok";
  },

  isError<T, E>(result: Result<T, E>): result is Err<E> {
    return result.type === "error";
  },

  map<T, U, E>(result: Result<T, E>, mapFn: (value: T) => U): Result<U, E> {
    if (result.type === "ok") {
      return Result.ok(mapFn(result.value));
    }
    return result;
  },

  flatMap<T, U, E>(
    result: Result<T, E>,
    mapFn: (value: T) => Result<U, E>,
  ): Result<U, E> {
    if (result.type === "ok") {
      return mapFn(result.value);
    }
    return result;
  },

  mapError<T, E, F>(
    result: Result<T, E>,
    mapFn: (error: E) => F,
  ): Result<T, F> {
    if (result.type === "error") {
      return Result.error(mapFn(result.error));
    }
    return result;
  },

  all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
    const values: T[] = [];
    for (const result of results) {
      if (result.type === "error") {
        return result;
      }
      values.push(result.value);
    }
    return Result.ok(values);
  },

  traverse<T, U, E>(
    items: readonly T[],
    mapFn: (value: T) => Result<U, E>,
  ): Result<U[], E> {
    const values: U[] = [];
    for (const item of items) {
      const result = mapFn(item);
      if (result.type === "error") {
        return result;
      }
      values.push(result.value);
    }
    return Result.ok(values);
  },

  fromThrowable<T, E>(
    execute: () => T,
    mapError: (error: unknown) => E,
  ): Result<T, E> {
    try {
      return Result.ok(execute());
    } catch (error) {
      return Result.error(mapError(error));
    }
  },

  unwrap<T, E>(result: Result<T, E>): T {
    if (result.type === "ok") {
      return result.value;
    }
    throw new Error(
      `Tried to unwrap an error Result: ${JSON.stringify(result.error)}`,
    );
  },
};
