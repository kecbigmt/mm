import { createDefine } from "fresh";
import type { ItemRepository } from "../src/domain/repositories/item_repository.ts";
import type { TimezoneIdentifier } from "../src/domain/primitives/timezone_identifier.ts";

export interface State {
  title?: string;
  shared?: string;
  itemRepository?: ItemRepository;
  timezone?: TimezoneIdentifier;
}

export const define = createDefine<State>();
