export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type Branded<TValue, TBrand extends string> = Brand<TValue, TBrand>;

export const asBrand = <TValue, TBrand extends string>(
  value: TValue,
): Brand<TValue, TBrand> => value as Brand<TValue, TBrand>;
