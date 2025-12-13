import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { createRankService, type RankGenerator } from "./rank_service.ts";
import { itemRankFromString } from "../primitives/item_rank.ts";

/**
 * Mock implementation of RankGenerator for testing
 */
function createMockRankGenerator(): RankGenerator {
  return {
    min(): string {
      return "0";
    },
    max(): string {
      return "z";
    },
    middle(): string {
      return "m";
    },
    between(first: string, second: string): string {
      // Simple mock implementation
      if (first === "0" && second === "m") return "g";
      if (first === "m" && second === "z") return "s";
      if (first === "a" && second === "c") return "b";
      return "h";
    },
    next(rank: string): string {
      // Simple mock implementation
      const mapping: Record<string, string> = {
        "0": "1",
        "1": "2",
        "2": "3",
        "a": "b",
        "b": "c",
        "m": "n",
      };
      return mapping[rank] || rank + "1";
    },
    prev(rank: string): string {
      // Simple mock implementation
      const mapping: Record<string, string> = {
        "1": "0",
        "2": "1",
        "3": "2",
        "b": "a",
        "c": "b",
        "n": "m",
      };
      return mapping[rank] || "0" + rank;
    },
    compare(first: string, second: string): number {
      if (first === second) return 0;
      return first < second ? -1 : 1;
    },
  };
}

describe("RankService", () => {
  const generator = createMockRankGenerator();
  const service = createRankService(generator);

  describe("headRank", () => {
    it("should return middle rank when no existing ranks", () => {
      const result = service.headRank([]);
      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.toString(), "m");
      }
    });

    it("should return rank before first item when ranks exist", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("b");
      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = service.headRank([rank1.value, rank2.value]);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "0a");
        }
      }
    });
  });

  describe("tailRank", () => {
    it("should return middle rank when no existing ranks", () => {
      const result = service.tailRank([]);
      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.toString(), "m");
      }
    });

    it("should return rank after last item when ranks exist", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("b");
      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = service.tailRank([rank1.value, rank2.value]);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "c");
        }
      }
    });
  });

  describe("betweenRanks", () => {
    it("should return rank between two ranks", () => {
      const firstResult = itemRankFromString("a");
      const secondResult = itemRankFromString("c");

      assertExists(firstResult.type === "ok");
      assertExists(secondResult.type === "ok");

      if (firstResult.type === "ok" && secondResult.type === "ok") {
        const result = service.betweenRanks(
          firstResult.value,
          secondResult.value,
        );
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "b");
        }
      }
    });
  });

  describe("nextRank", () => {
    it("should return next rank", () => {
      const rankResult = itemRankFromString("a");
      assertExists(rankResult.type === "ok");

      if (rankResult.type === "ok") {
        const result = service.nextRank(rankResult.value);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "b");
        }
      }
    });
  });

  describe("prevRank", () => {
    it("should return previous rank", () => {
      const rankResult = itemRankFromString("b");
      assertExists(rankResult.type === "ok");

      if (rankResult.type === "ok") {
        const result = service.prevRank(rankResult.value);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "a");
        }
      }
    });
  });

  describe("compareRanks", () => {
    it("should compare two equal ranks", () => {
      const rank1Result = itemRankFromString("m");
      const rank2Result = itemRankFromString("m");

      assertExists(rank1Result.type === "ok");
      assertExists(rank2Result.type === "ok");

      if (rank1Result.type === "ok" && rank2Result.type === "ok") {
        const result = service.compareRanks(rank1Result.value, rank2Result.value);
        assertEquals(result, 0);
      }
    });

    it("should compare first rank less than second", () => {
      const rank1Result = itemRankFromString("a");
      const rank2Result = itemRankFromString("b");

      assertExists(rank1Result.type === "ok");
      assertExists(rank2Result.type === "ok");

      if (rank1Result.type === "ok" && rank2Result.type === "ok") {
        const result = service.compareRanks(rank1Result.value, rank2Result.value);
        assertEquals(result, -1);
      }
    });

    it("should compare first rank greater than second", () => {
      const rank1Result = itemRankFromString("b");
      const rank2Result = itemRankFromString("a");

      assertExists(rank1Result.type === "ok");
      assertExists(rank2Result.type === "ok");

      if (rank1Result.type === "ok" && rank2Result.type === "ok") {
        const result = service.compareRanks(rank1Result.value, rank2Result.value);
        assertEquals(result, 1);
      }
    });
  });

  describe("generateEquallySpacedRanks", () => {
    it("should return empty array for count 0", () => {
      const result = service.generateEquallySpacedRanks(0);
      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 0);
      }
    });

    it("should return single middle rank for count 1", () => {
      const result = service.generateEquallySpacedRanks(1);
      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 1);
        assertEquals(result.value[0].toString(), "m");
      }
    });

    it("should return multiple equally spaced ranks", () => {
      const result = service.generateEquallySpacedRanks(3);
      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 3);
        assertEquals(result.value[0].toString(), "0");
        assertEquals(result.value[1].toString(), "1");
        assertEquals(result.value[2].toString(), "2");
      }
    });
  });
});
