// The Worker's entry: serves the frontend (static assets, wrangler.jsonc) and the API under /api/*.
// workerd accepts only handlers and classes as this module's exports (a test pins it), so the handler's
// code, its dependencies and constants live in `handler.ts`.
import { createHandler } from './handler.ts';

export { GuildWorld } from './guild-world.ts';

export default createHandler();
