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

  describe("beforeRank", () => {
    it("should return rank before target when previous item exists", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("c");
      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = service.beforeRank(rank2.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          // Should return rank between 'a' and 'c', which is 'b'
          assertEquals(result.value.toString(), "b");
        }
      }
    });

    it("should return prevRank when target is first item", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("b");
      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = service.beforeRank(rank1.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "0a");
        }
      }
    });

    it("should return error when target not found", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("b");
      const rank3 = itemRankFromString("c");
      if (rank1.type === "ok" && rank2.type === "ok" && rank3.type === "ok") {
        const result = service.beforeRank(rank3.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "error");
      }
    });
  });

  describe("afterRank", () => {
    it("should return rank after target when next item exists", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("c");
      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = service.afterRank(rank1.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          // Should return rank between 'a' and 'c', which is 'b'
          assertEquals(result.value.toString(), "b");
        }
      }
    });

    it("should return nextRank when target is last item", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("b");
      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = service.afterRank(rank2.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "ok");
        if (result.type === "ok") {
          assertEquals(result.value.toString(), "c");
        }
      }
    });

    it("should return error when target not found", () => {
      const rank1 = itemRankFromString("a");
      const rank2 = itemRankFromString("b");
      const rank3 = itemRankFromString("c");
      if (rank1.type === "ok" && rank2.type === "ok" && rank3.type === "ok") {
        const result = service.afterRank(rank3.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "error");
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
