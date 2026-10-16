const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

async function start() {
  await connectDatabase();
  const server = app.listen(env.port, () => console.log(`WinJolt API listening on port ${env.port}`));
  const shutdown = (signal) => server.close(() => { console.log(`${signal}: server closed`); process.exit(0); });
  process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => { console.error("Failed to start WinJolt API", error); process.exit(1); });
