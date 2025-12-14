import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { itemRankFromString } from "../../domain/primitives/item_rank.ts";
import { createLexoRankService } from "./rank_service.ts";

describe("LexorankRankService", () => {
  describe("headRank", () => {
    it("should return middle rank when no existing ranks", () => {
      const rankService = createLexoRankService();
      const result = rankService.headRank([]);

      assertEquals(result.type, "ok");
      assertExists(result.type === "ok" && result.value);
    });

    it("should return rank before first item when ranks exist", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = rankService.headRank([rank1.value, rank2.value]);
        assertEquals(result.type, "ok");

        if (result.type === "ok") {
          // Verify the new rank is before the first item
          const comparison = rankService.compareRanks(result.value, rank1.value);
          assertEquals(comparison < 0, true);
        }
      }
    });
  });

  describe("tailRank", () => {
    it("should return middle rank when no existing ranks", () => {
      const rankService = createLexoRankService();
      const result = rankService.tailRank([]);

      assertEquals(result.type, "ok");
      assertExists(result.type === "ok" && result.value);
    });

    it("should return rank after last item when ranks exist", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = rankService.tailRank([rank1.value, rank2.value]);
        assertEquals(result.type, "ok");

        if (result.type === "ok") {
          // Verify the new rank is after the last item
          const comparison = rankService.compareRanks(result.value, rank2.value);
          assertEquals(comparison > 0, true);
        }
      }
    });
  });

  describe("beforeRank", () => {
    it("should return rank before target when previous item exists", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");
      const rank3 = itemRankFromString("0|300000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");
      assertEquals(rank3.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok" && rank3.type === "ok") {
        const result = rankService.beforeRank(rank2.value, [
          rank1.value,
          rank2.value,
          rank3.value,
        ]);
        assertEquals(result.type, "ok");

        if (result.type === "ok") {
          // Verify the new rank is between rank1 and rank2
          const comp1 = rankService.compareRanks(result.value, rank1.value);
          const comp2 = rankService.compareRanks(result.value, rank2.value);
          assertEquals(comp1 > 0, true);
          assertEquals(comp2 < 0, true);
        }
      }
    });

    it("should return prevRank when target is first item", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = rankService.beforeRank(rank1.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "ok");

        if (result.type === "ok") {
          // Verify the new rank is before rank1
          const comparison = rankService.compareRanks(result.value, rank1.value);
          assertEquals(comparison < 0, true);
        }
      }
    });

    it("should return error when target not found", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");
      const rank3 = itemRankFromString("0|300000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");
      assertEquals(rank3.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok" && rank3.type === "ok") {
        const result = rankService.beforeRank(rank3.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "error");

        if (result.type === "error") {
          assertEquals(result.error.issues[0].code, "target_not_found");
        }
      }
    });
  });

  describe("afterRank", () => {
    it("should return rank after target when next item exists", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");
      const rank3 = itemRankFromString("0|300000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");
      assertEquals(rank3.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok" && rank3.type === "ok") {
        const result = rankService.afterRank(rank2.value, [
          rank1.value,
          rank2.value,
          rank3.value,
        ]);
        assertEquals(result.type, "ok");

        if (result.type === "ok") {
          // Verify the new rank is between rank2 and rank3
          const comp1 = rankService.compareRanks(result.value, rank2.value);
          const comp2 = rankService.compareRanks(result.value, rank3.value);
          assertEquals(comp1 > 0, true);
          assertEquals(comp2 < 0, true);
        }
      }
    });

    it("should return nextRank when target is last item", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = rankService.afterRank(rank2.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "ok");

        if (result.type === "ok") {
          // Verify the new rank is after rank2
          const comparison = rankService.compareRanks(result.value, rank2.value);
          assertEquals(comparison > 0, true);
        }
      }
    });

    it("should return error when target not found", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");
      const rank3 = itemRankFromString("0|300000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");
      assertEquals(rank3.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok" && rank3.type === "ok") {
        const result = rankService.afterRank(rank3.value, [rank1.value, rank2.value]);
        assertEquals(result.type, "error");

        if (result.type === "error") {
          assertEquals(result.error.issues[0].code, "target_not_found");
        }
      }
    });
  });

  describe("compareRanks", () => {
    it("should compare two equal ranks", () => {
      const rankService = createLexoRankService();
      const rank = itemRankFromString("0|100000:");

      assertEquals(rank.type, "ok");

      if (rank.type === "ok") {
        const result = rankService.compareRanks(rank.value, rank.value);
        assertEquals(result, 0);
      }
    });

    it("should compare first rank less than second", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const rank2 = itemRankFromString("0|200000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = rankService.compareRanks(rank1.value, rank2.value);
        assertEquals(result < 0, true);
      }
    });

    it("should compare first rank greater than second", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|200000:");
      const rank2 = itemRankFromString("0|100000:");

      assertEquals(rank1.type, "ok");
      assertEquals(rank2.type, "ok");

      if (rank1.type === "ok" && rank2.type === "ok") {
        const result = rankService.compareRanks(rank1.value, rank2.value);
        assertEquals(result > 0, true);
      }
    });
  });

  describe("generateEquallySpacedRanks", () => {
    it("should return empty array for count 0", () => {
      const rankService = createLexoRankService();
      const result = rankService.generateEquallySpacedRanks(0);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 0);
      }
    });

    it("should return single middle rank for count 1", () => {
      const rankService = createLexoRankService();
      const result = rankService.generateEquallySpacedRanks(1);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 1);
      }
    });

    it("should return multiple equally spaced ranks", () => {
      const rankService = createLexoRankService();
      const result = rankService.generateEquallySpacedRanks(5);

      assertEquals(result.type, "ok");
      if (result.type === "ok") {
        assertEquals(result.value.length, 5);

        // Verify ranks are in order
        for (let i = 0; i < result.value.length - 1; i++) {
          const comparison = rankService.compareRanks(
            result.value[i],
            result.value[i + 1],
          );
          assertEquals(comparison < 0, true);
        }
      }
    });
  });

  describe("Boundary conditions", () => {
    it("should return error when trying to insert before minimum rank", () => {
      const rankService = createLexoRankService();
      const minRank = itemRankFromString("0|000000:");
      const rank2 = itemRankFromString("0|100000:");

      assertEquals(minRank.type, "ok");
      assertEquals(rank2.type, "ok");

      if (minRank.type === "ok" && rank2.type === "ok") {
        const result = rankService.beforeRank(minRank.value, [minRank.value, rank2.value]);

        // Should return error when reaching boundary
        assertEquals(result.type, "error");
      }
    });

    it("should return error when trying to insert after maximum rank", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const maxRank = itemRankFromString("0|zzzzzz:");

      assertEquals(rank1.type, "ok");
      assertEquals(maxRank.type, "ok");

      if (rank1.type === "ok" && maxRank.type === "ok") {
        const result = rankService.tailRank([rank1.value, maxRank.value]);

        // Should return error when reaching boundary
        assertEquals(result.type, "error");
      }
    });

    it("should return error when using afterRank on maximum rank", () => {
      const rankService = createLexoRankService();
      const rank1 = itemRankFromString("0|100000:");
      const maxRank = itemRankFromString("0|zzzzzz:");

      assertEquals(rank1.type, "ok");
      assertEquals(maxRank.type, "ok");

      if (rank1.type === "ok" && maxRank.type === "ok") {
        const result = rankService.afterRank(maxRank.value, [rank1.value, maxRank.value]);

        // Should return error when reaching boundary
        assertEquals(result.type, "error");
      }
    });

    it("should return error when using headRank with minimum rank", () => {
      const rankService = createLexoRankService();
      const minRank = itemRankFromString("0|000000:");
      const rank2 = itemRankFromString("0|100000:");

      assertEquals(minRank.type, "ok");
      assertEquals(rank2.type, "ok");

      if (minRank.type === "ok" && rank2.type === "ok") {
        const result = rankService.headRank([minRank.value, rank2.value]);

        // Should return error when reaching boundary
        assertEquals(result.type, "error");
      }
    });
  });
});
