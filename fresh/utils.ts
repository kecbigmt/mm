import { createDefine } from "fresh";

export interface State {
  title?: string;
  shared?: string;
}

export const define = createDefine<State>();
