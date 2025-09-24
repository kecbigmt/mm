import { RandomSource } from "../../domain/services/alias_auto_generator.ts";

const MAX_UINT32 = 0x1_0000_0000;

export const createCryptoRandomSource = (): RandomSource => {
  const buffer = new Uint32Array(1);

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer");
    }
    const limit = Math.floor(MAX_UINT32 / maxExclusive) * maxExclusive;
    while (true) {
      crypto.getRandomValues(buffer);
      const value = buffer[0];
      if (value < limit) {
        return value % maxExclusive;
      }
    }
  };

  return {
    nextInt,
  };
};
