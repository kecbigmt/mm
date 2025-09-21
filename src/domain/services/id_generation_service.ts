import { Result } from "../../shared/result.ts";
import { ItemId, itemIdFromString, ItemIdValidationError } from "../primitives/item_id.ts";

/**
 * External ID generation interface
 * This interface abstracts the ID generation implementation
 */
export interface IdGenerator {
  generate(): string;
}

/**
 * ID generation service interface for creating unique item identifiers
 */
export interface IdGenerationService {
  generateId(): Result<ItemId, ItemIdValidationError>;
}

/**
 * Create a pure ID generation service with dependency injection
 * @param generator - External ID generation implementation
 */
export function createIdGenerationService(generator: IdGenerator): IdGenerationService {
  const generateId = (): Result<ItemId, ItemIdValidationError> => {
    const idString = generator.generate();
    return itemIdFromString(idString);
  };

  return {
    generateId,
  };
}
