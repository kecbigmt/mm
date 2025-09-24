import { assert, assertThrows } from "@std/assert";
import { createCryptoRandomSource } from "./crypto_random_source.ts";

Deno.test("createCryptoRandomSource yields values within range", () => {
  const source = createCryptoRandomSource();
  for (let i = 0; i < 32; i += 1) {
    const value = source.nextInt(21);
    assert(value >= 0 && value < 21);
  }
});

Deno.test("createCryptoRandomSource rejects invalid bounds", () => {
  const source = createCryptoRandomSource();
  assertThrows(() => source.nextInt(0));
  assertThrows(() => source.nextInt(-1));
  assertThrows(() => source.nextInt(2.5));
});
