import { createStringPrimitiveFactory, StringPrimitive } from "./string_primitive.ts";

const canonicalKeyFactory = createStringPrimitiveFactory({
  kind: "CanonicalKey",
});

export type CanonicalKey = StringPrimitive<
  typeof canonicalKeyFactory.brand,
  string,
  string,
  true,
  false
>;

const instantiate = (value: string): CanonicalKey => canonicalKeyFactory.instantiate(value);

export const isCanonicalKey = (value: unknown): value is CanonicalKey =>
  canonicalKeyFactory.is(value);

const casefold = (value: string): string => value.toLocaleLowerCase("en-US");
const stripCombiningMarks = (value: string): string =>
  value.normalize("NFKD").replace(/\p{M}+/gu, "");

export const createCanonicalKey = (input: string): CanonicalKey => {
  const normalized = input.normalize("NFKC");
  const stripped = stripCombiningMarks(normalized);
  const folded = casefold(stripped);
  return instantiate(folded);
};

export const canonicalKeyFromString = (input: string): CanonicalKey => createCanonicalKey(input);
