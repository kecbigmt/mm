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
const stripCombiningMarks = (value: string): string => value.replace(/\p{M}+/gu, "");

export const createCanonicalKey = (input: string): CanonicalKey => {
  // First normalize to NFKD to decompose characters and separate combining marks
  const decomposed = input.normalize("NFKD");
  // Strip combining marks (diacritics)
  const stripped = stripCombiningMarks(decomposed);
  // Then normalize to NFKC to handle compatibility characters (e.g., ligatures)
  const normalized = stripped.normalize("NFKC");
  // Finally casefold to lowercase
  const folded = casefold(normalized);
  return instantiate(folded);
};

export const canonicalKeyFromString = (input: string): CanonicalKey => createCanonicalKey(input);
