import { Hono } from "hono";
import type { Env } from "./env.js";
import { metadataRoutes } from "./oauth/metadata.js";
import { registerRoutes } from "./oauth/register.js";
import { authorizeRoutes } from "./oauth/authorize.js";
import { tokenRoutes } from "./oauth/token.js";
import { pairRoutes } from "./routes/pair.js";
import { agentConnectRoutes } from "./routes/agent-connect.js";
import { mcpRoutes } from "./mcp/server.js";

export { MachineSession } from "./do/machine-session.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("chatgpt-code-mcp Gateway"));

app.route("/", metadataRoutes);
app.route("/", registerRoutes);
app.route("/", authorizeRoutes);
app.route("/", tokenRoutes);
app.route("/", pairRoutes);
app.route("/", agentConnectRoutes);
app.route("/", mcpRoutes);

export default app;
