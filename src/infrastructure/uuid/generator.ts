import { generate } from "jsr:@std/uuid/unstable-v7";
import { IdGenerator } from "../../domain/services/id_generation_service.ts";

/**
 * UUID v7 generator implementation
 * Uses the standard library UUID v7 generator
 */
export function createUuidV7Generator(): IdGenerator {
  return {
    generate: () => generate(),
  };
}
