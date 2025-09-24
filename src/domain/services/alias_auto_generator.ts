import { Result } from "../../shared/result.ts";
import {
  AliasSlug,
  aliasSlugFromString,
  AliasSlugValidationError,
} from "../primitives/alias_slug.ts";

const CONSONANTS = [
  "b",
  "c",
  "d",
  "f",
  "g",
  "h",
  "j",
  "k",
  "l",
  "m",
  "n",
  "p",
  "q",
  "r",
  "s",
  "t",
  "v",
  "w",
  "x",
  "y",
  "z",
] as const;

const VOWELS = ["a", "e", "i", "o", "u"] as const;
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export interface AliasAutoGenerator {
  generate(): Result<AliasSlug, AliasSlugValidationError>;
}

export const createAliasAutoGenerator = (random: RandomSource): AliasAutoGenerator => {
  const generateAliasString = (): string => {
    const c1 = CONSONANTS[random.nextInt(CONSONANTS.length)];
    const v1 = VOWELS[random.nextInt(VOWELS.length)];
    const c2 = CONSONANTS[random.nextInt(CONSONANTS.length)];
    const v2 = VOWELS[random.nextInt(VOWELS.length)];
    const suffix = Array.from({ length: 3 }, () => BASE36[random.nextInt(BASE36.length)]).join("");
    return `${c1}${v1}${c2}${v2}-${suffix}`;
  };

  const generate = (): Result<AliasSlug, AliasSlugValidationError> => {
    const alias = generateAliasString();
    return aliasSlugFromString(alias);
  };

  return {
    generate,
  };
};
