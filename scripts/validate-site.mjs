import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = resolve(repositoryRoot, process.argv[2] || "dist");
const errors = [];

for (const requiredPath of [
  "index.html",
  "trust.html",
  "privacy.html",
  "404.html",
  "assets/css/styles.css",
  "assets/js/main.js",
  "assets/img/ultra-pro-logo-white.png",
  "data/trust-documents.json"
]) {
  await requireFile(requiredPath);
}

const files = await walk(siteRoot);
for (const absolutePath of files) {
  if (!/\.(html|css|js|json|txt|xml|webmanifest)$/i.test(absolutePath)) continue;
  const content = await readFile(absolutePath, "utf8");
  const relativePath = absolutePath.slice(siteRoot.length + 1);

  if (/__[A-Z0-9_]+__/.test(content)) {
    errors.push(`${relativePath}: contains an unreplaced configuration token.`);
  }

  if (/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(content)) {
    errors.push(`${relativePath}: appears to contain a credential or private key.`);
  }

  if (extname(absolutePath) === ".html") {
    await validateHtmlReferences(absolutePath, content);
  }
}

await validateTrustManifest();

if (errors.length) {
  console.error("Site validation failed:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${files.length} files in ${siteRoot}`);

async function requireFile(relativePath) {
  try {
    await access(join(siteRoot, relativePath));
  } catch {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(path)));
    else results.push(path);
  }

  return results;
}

async function validateHtmlReferences(htmlPath, content) {
  const referencePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  for (const match of content.matchAll(referencePattern)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) continue;

    const cleanReference = reference.split("#")[0].split("?")[0];
    if (!cleanReference) continue;

    const candidate = cleanReference.startsWith("/")
      ? join(siteRoot, cleanReference.slice(1))
      : resolve(dirname(htmlPath), cleanReference);

    const normalizedCandidate = normalize(candidate);
    if (!normalizedCandidate.startsWith(siteRoot)) {
      errors.push(`${htmlPath.slice(siteRoot.length + 1)}: local reference leaves site root: ${reference}`);
      continue;
    }

    try {
      await access(normalizedCandidate);
    } catch {
      errors.push(`${htmlPath.slice(siteRoot.length + 1)}: missing local reference ${reference}`);
    }
  }
}

async function validateTrustManifest() {
  const manifestPath = join(siteRoot, "data/trust-documents.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`data/trust-documents.json: ${error.message}`);
    return;
  }

  if (!Array.isArray(manifest.documents)) {
    errors.push("data/trust-documents.json: documents must be an array.");
    return;
  }

  const identifiers = new Set();
  for (const item of manifest.documents) {
    if (!item.id || !item.title || !item.description || !item.status) {
      errors.push("data/trust-documents.json: every document needs id, title, description, and status.");
      continue;
    }
    if (identifiers.has(item.id)) errors.push(`data/trust-documents.json: duplicate id ${item.id}.`);
    identifiers.add(item.id);

    if (item.status === "published") {
      if (!item.href || !item.href.startsWith("audits/") || item.href.includes("..")) {
        errors.push(`${item.id}: published documents must use a safe audits/ href.`);
      } else {
        await requireFile(item.href);
      }
    } else if (item.href) {
      errors.push(`${item.id}: restricted or controlled documents must not expose an href.`);
    }
  }
}
