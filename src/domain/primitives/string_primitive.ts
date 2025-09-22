/**
 * A branded string primitive with configurable methods and type safety.
 *
 * @template Brand - A unique symbol used for nominal typing to distinguish different string primitives
 * @template TValue - The underlying string type (e.g., specific string literals or string)
 * @template TJSON - The JSON representation type when serialized (defaults to TValue)
 * @template IncludeEquals - Whether to include equals() method for value comparison
 * @template IncludeCompare - Whether to include compare() method for ordering/sorting
 * @template Extra - Additional methods or properties to attach to the primitive
 */
export type StringPrimitive<
  Brand extends symbol,
  TValue extends string,
  TJSON,
  IncludeEquals extends boolean,
  IncludeCompare extends boolean,
  Extra extends Record<string, unknown> = Record<PropertyKey, never>,
> =
  & Readonly<{
    readonly data: Readonly<{ readonly value: TValue }>;
    toString(): TValue;
    toJSON(): TJSON;
    readonly __brand: Brand;
  }>
  & (IncludeEquals extends true ? {
      equals(
        other: StringPrimitive<
          Brand,
          TValue,
          TJSON,
          IncludeEquals,
          IncludeCompare,
          Extra
        >,
      ): boolean;
    }
    : Record<PropertyKey, never>)
  & (IncludeCompare extends true ? {
      compare(
        other: StringPrimitive<
          Brand,
          TValue,
          TJSON,
          IncludeEquals,
          IncludeCompare,
          Extra
        >,
      ): number;
    }
    : Record<PropertyKey, never>)
  & Extra;

export type CreateStringPrimitiveOptions<
  Kind extends string,
  TValue extends string,
  TJSON,
  IncludeEquals extends boolean,
  IncludeCompare extends boolean,
> = {
  readonly kind: Kind;
  readonly includeEquals?: IncludeEquals;
  readonly includeCompare?: IncludeCompare;
  readonly equals?: (value: TValue, other: TValue) => boolean;
  readonly compare?: (value: TValue, other: TValue) => number;
  readonly toJSON?: (value: TValue) => TJSON;
};

export const createStringPrimitiveFactory = <
  const Kind extends string,
  TValue extends string = string,
  TJSON = TValue,
  IncludeEquals extends boolean = true,
  IncludeCompare extends boolean = false,
>(
  options: CreateStringPrimitiveOptions<
    Kind,
    TValue,
    TJSON,
    IncludeEquals,
    IncludeCompare
  >,
) => {
  const includeEquals = (options.includeEquals ?? true) as IncludeEquals;
  const includeCompare = (options.includeCompare ?? false) as IncludeCompare;
  const brand: unique symbol = Symbol(options.kind);

  type Primitive<Extra extends Record<string, unknown>> = StringPrimitive<
    typeof brand,
    TValue,
    TJSON,
    IncludeEquals,
    IncludeCompare,
    Extra
  >;

  const toString = function (this: { data: { value: TValue } }): TValue {
    return this.data.value;
  };

  const toJSON = options.toJSON
    ? function (this: { data: { value: TValue } }): TJSON {
      return options.toJSON!(this.data.value);
    }
    : function (this: { data: { value: TValue } }): TJSON {
      return this.data.value as unknown as TJSON;
    };

  const equalsFn = options.equals ??
    ((value: TValue, other: TValue): boolean => value === other);

  const compareFn = options.compare ??
    ((value: TValue, other: TValue): number => value === other ? 0 : value < other ? -1 : 1);

  const instantiate = <Extra extends Record<string, unknown> = Record<PropertyKey, never>>(
    value: TValue,
    methods?: Extra,
  ): Primitive<Extra> => {
    const extras = methods ?? ({} as Extra);
    const base: Record<string, unknown> = {
      data: Object.freeze({ value }) as { readonly value: TValue },
      toString,
      toJSON,
      __brand: brand,
    };

    if (includeEquals) {
      base.equals = function (
        this: Primitive<Extra>,
        other: Primitive<Extra>,
      ): boolean {
        return equalsFn(this.data.value, other.data.value);
      };
    }

    if (includeCompare) {
      base.compare = function (
        this: Primitive<Extra>,
        other: Primitive<Extra>,
      ): number {
        return compareFn(this.data.value, other.data.value);
      };
    }

    const reservedKeys = new Set([
      "toString",
      "equals",
      "compare",
      "toJSON",
      "__brand",
      "data",
    ]);
    for (const [key, method] of Object.entries(extras)) {
      if (reservedKeys.has(key)) {
        throw new Error(
          `Cannot overwrite reserved method/property '${key}' in StringPrimitive extras.`,
        );
      }
      base[key] = method;
    }

    return Object.freeze(base) as Primitive<Extra>;
  };

  const is = <Extra extends Record<string, unknown> = Record<PropertyKey, never>>(
    value: unknown,
  ): value is Primitive<Extra> => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("__brand" in value) ||
      (value as { __brand: unknown }).__brand !== brand
    ) {
      return false;
    }
    if (includeEquals && typeof (value as { equals?: unknown }).equals !== "function") {
      return false;
    }
    if (includeCompare && typeof (value as { compare?: unknown }).compare !== "function") {
      return false;
    }
    return true;
  };

  return {
    brand,
    kind: options.kind,
    instantiate,
    is,
  };
};
