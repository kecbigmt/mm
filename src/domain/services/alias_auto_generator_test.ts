import { assertEquals, assertMatch } from "@std/assert";
import { createAliasAutoGenerator, RandomSource } from "./alias_auto_generator.ts";

const expectOk = <T, E>(result: { type: "ok"; value: T } | { type: "error"; error: E }): T => {
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

class StubRandomSource implements RandomSource {
  private readonly values: number[];
  private index = 0;

  constructor(values: number[]) {
    this.values = values.slice();
  }

  nextInt(maxExclusive: number): number {
    if (this.index >= this.values.length) {
      throw new Error("random source exhausted");
    }
    const value = this.values[this.index];
    this.index += 1;
    if (value < 0 || value >= maxExclusive) {
      throw new Error(`stub value ${value} out of range for max ${maxExclusive}`);
    }
    return value;
  }
}

Deno.test("createAliasAutoGenerator produces deterministic alias", () => {
  const random = new StubRandomSource([0, 1, 2, 3, 4, 5, 6]);
  const generator = createAliasAutoGenerator(random);
  const alias = expectOk(generator.generate());
  assertEquals(alias.toString(), "bedo-456");
  assertEquals(alias.canonicalKey.toString(), "bedo-456");
});

Deno.test("createAliasAutoGenerator output matches required pattern", () => {
  const random = new StubRandomSource([20, 4, 19, 0, 35, 10, 0]);
  const generator = createAliasAutoGenerator(random);
  const alias = expectOk(generator.generate());
  assertMatch(alias.toString(), /^[a-z]{4}-[0-9a-z]{3}$/);
});
