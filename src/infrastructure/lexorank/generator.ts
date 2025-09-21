import lexorank from "lexorank";
const { LexoRank } = lexorank;
import type { RankGenerator } from "../../domain/services/rank_service.ts";

/**
 * LexoRank-based implementation of RankGenerator
 */
export function createLexoRankGenerator(): RankGenerator {
  return {
    min(): string {
      return LexoRank.min().toString();
    },

    max(): string {
      return LexoRank.max().toString();
    },

    middle(): string {
      return LexoRank.middle().toString();
    },

    between(first: string, second: string): string {
      const firstLexo = LexoRank.parse(first);
      const secondLexo = LexoRank.parse(second);
      return firstLexo.between(secondLexo).toString();
    },

    next(rank: string): string {
      const lexoRank = LexoRank.parse(rank);
      return lexoRank.genNext().toString();
    },

    prev(rank: string): string {
      const lexoRank = LexoRank.parse(rank);
      return lexoRank.genPrev().toString();
    },

    compare(first: string, second: string): number {
      const firstLexo = LexoRank.parse(first);
      const secondLexo = LexoRank.parse(second);

      if (firstLexo.equals(secondLexo)) {
        return 0;
      }
      return firstLexo.compareTo(secondLexo);
    },
  };
}
