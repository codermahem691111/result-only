const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cfg = require("./config");
const routes = require("./routes");
const { startConsumer, projector, audit } = require("./events");

// CLIENT_URL may hold several comma-separated sites (spaces and trailing slashes are ignored).
// A site may contain * to match one URL segment, e.g. https://myapp-*-myteam.vercel.app
const originRules = (cfg.clientUrl || "https://resultsaasfrontend-2.vercel.app/")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean)
  .map((s) =>
    s.includes("*")
      ? new RegExp("^" + s.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+") + "$", "i")
      : s
  );
const isAllowedOrigin = (o) => originRules.some((r) => (r instanceof RegExp ? r.test(o) : r === o));
const corsOptions = { origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)) };

const app = express();
app.disable("x-powered-by");
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) =>
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ instance: cfg.instance })
);
app.use("/api/results", routes);
app.use((_req, res) => res.status(404).json({ message: "Not found" }));

mongoose
  .connect(cfg.mongoUri)
  .then(() => {
    startConsumer("result-projector", projector);
    startConsumer("result-audit", audit);
    const server = app.listen(cfg.port, () => console.log(`[${cfg.instance}] listening on ${cfg.port}`));
    const shutdown = () => { server.close(); setTimeout(() => process.exit(0), 1500); };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  });
