import { App, staticFiles } from "fresh";
import type { State } from "./utils.ts";
import { workspaceMiddleware } from "./lib/workspace_middleware.ts";

export const app = new App<State>();

app.use(staticFiles());
app.use(workspaceMiddleware);

app.fsRoutes();
