import { Result } from "../../shared/result.ts";
import {
  createHashingError,
  HashingError,
  HashingService,
} from "../../domain/services/hashing_service.ts";

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

export const createSha256HashingService = (): HashingService => {
  const hash = async (value: string): Promise<Result<string, HashingError>> => {
    try {
      const data = encoder.encode(value);
      const digest = await crypto.subtle.digest("SHA-256", data);
      const hex = toHex(new Uint8Array(digest));
      return Result.ok(hex);
    } catch (cause) {
      return Result.error(
        createHashingError("sha-256", "failed to compute hash", { cause }),
      );
    }
  };

  return {
    hash,
  };
};
