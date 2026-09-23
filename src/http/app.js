const fs = require("fs");
const path = require("path");
const express = require("express");
const { createApiRouter } = require("./routes");
const {
  createCorsMiddleware,
  createOriginGuard,
  createSessionMiddleware,
  redactDetails,
  sendError,
} = require("./middleware");

function createApp(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, "../.."));
  const publicDir = path.resolve(options.publicDir || path.join(rootDir, "public"));
  const port = Number(options.port || process.env.PORT || 3000);
  const allowedOrigins = defaultAllowedOrigins(
    port,
    options.mushengPort || process.env.MUSHENG_PORT,
  );
  for (const origin of options.allowedOrigins || []) {
    if (origin) {
      allowedOrigins.add(origin);
    }
  }

  const app = express();
  app.use(["/api/v1", "/api"], setApiNoStoreHeaders);
  app.disable("x-powered-by");
  app.use(createCorsMiddleware({ allowedOrigins }));
  app.use(createOriginGuard({ allowedOrigins }));
  app.use(express.json({ limit: options.jsonLimit || "10mb" }));
  app.use(createSessionMiddleware(options.userStore));

  const apiRouter = createApiRouter(options);
  app.use("/api/v1", apiRouter);
  app.use("/api/v1", apiNotFound);
  app.use("/api", apiRouter);
  app.use("/api", apiNotFound);

  installStaticRoutes(app, { rootDir, publicDir });

  app.get("/", (_req, res) => {
    return sendPublicPage(res, { publicDir, filename: "index.html" });
  });
  app.get(["/studio", "/studio/"], (_req, res) => {
    return sendPublicPage(res, { publicDir, filename: "studio.html" });
  });

  app.use((_req, res) => {
    return res.status(404).type("text/plain").send("Not found");
  });
  app.use(errorHandler);
  return app;
}

function installStaticRoutes(app, { rootDir, publicDir }) {
  // Only files under public/ are browser assets. The root directory contains
  // runtime data and local configuration and must never become static content.
  app.use(
    express.static(publicDir, {
      dotfiles: "deny",
      index: false,
    }),
  );
}

function sendPublicPage(res, { publicDir, filename }) {
  const target = path.join(publicDir, filename);
  if (!fs.existsSync(target)) {
    return res.status(404).type("text/plain").send("Public entry not found");
  }
  return res.sendFile(target);
}

function setApiNoStoreHeaders(_req, res, next) {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  return next();
}

function apiNotFound(_req, res) {
  return sendError(res, 404, "API route not found");
}

function errorHandler(error, _req, res, _next) {
  const statusCode = Number(error.statusCode || error.status) || (error instanceof SyntaxError ? 400 : 500);
  const message = statusCode >= 500
    ? error.publicMessage || "服务器处理失败"
    : error.message || "请求失败";
  return sendError(res, statusCode, message, statusCode >= 500 ? null : error.details);
}

function defaultAllowedOrigins(port, mushengPort) {
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const externalPort = Number(mushengPort);
  if (externalPort) {
    origins.add(`http://127.0.0.1:${externalPort}`);
    origins.add(`http://localhost:${externalPort}`);
  }
  for (const origin of String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    origins.add(origin);
  }
  return origins;
}

module.exports = {
  createApp,
  defaultAllowedOrigins,
  errorHandler,
  installStaticRoutes,
  redactDetails,
};
