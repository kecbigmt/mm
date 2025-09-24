import { assertEquals } from "@std/assert";
import { createSha256HashingService } from "./sha256_hashing_service.ts";

const expectOk = async <T, E>(
  promise: Promise<{ type: "ok"; value: T } | { type: "error"; error: E }>,
): Promise<T> => {
  const result = await promise;
  if (result.type !== "ok") {
    throw new Error(`expected ok, received error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

Deno.test("createSha256HashingService hashes input to lowercase hex", async () => {
  const service = createSha256HashingService();
  const value = await expectOk(service.hash("example"));
  assertEquals(value, "50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c");
});
