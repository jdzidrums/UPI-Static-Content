import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const configuredRoot = process.env.SITE_ROOT ? normalize(process.env.SITE_ROOT) : join(moduleDirectory, "dist");
const siteRoot = await exists(join(configuredRoot, "index.html")) ? configuredRoot : moduleDirectory;
const port = Number(process.env.PORT || 8080);

const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const requestPath = decodeURIComponent(requestUrl.pathname);
    const safePath = normalize(requestPath).replace(/^([/\\])+/, "");

    if (safePath.includes("..")) return sendText(response, 400, "Bad request");

    let filePath = join(siteRoot, safePath);
    if (!safePath || requestPath.endsWith("/")) filePath = join(filePath, "index.html");
    if (!(await exists(filePath)) && !extname(filePath) && (await exists(filePath + ".html"))) filePath += ".html";

    if (!(await exists(filePath)) || !(await stat(filePath)).isFile()) {
      filePath = join(siteRoot, "404.html");
      response.statusCode = 404;
    } else {
      response.statusCode = 200;
    }

    applySecurityHeaders(response);
    response.setHeader("Content-Type", mimeTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream");
    response.setHeader("Cache-Control", cachePolicy(filePath));

    if (request.method === "HEAD") return response.end();
    if (request.method !== "GET") return sendText(response, 405, "Method not allowed");

    createReadStream(filePath).pipe(response);
  } catch (error) {
    console.error(error);
    sendText(response, 500, "Internal server error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Ultra PRO Partner Integration Portal listening on port ${port}`);
});

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src https://outlook.office.com https://outlook.office365.com; base-uri 'self'; form-action 'self' mailto:; frame-ancestors 'none'; upgrade-insecure-requests");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function cachePolicy(filePath) {
  const extension = extname(filePath).toLowerCase();
  if ([".css", ".js", ".png", ".jpg", ".jpeg", ".avif", ".webp", ".woff", ".woff2"].includes(extension)) {
    return "public, max-age=86400, stale-while-revalidate=604800";
  }
  if ([".pdf", ".docx"].includes(extension)) return "public, max-age=3600";
  return "no-cache";
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sendText(response, status, text) {
  if (!response.headersSent) applySecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(text);
}
