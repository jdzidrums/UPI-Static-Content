import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = resolve(repositoryRoot, process.argv[2] || "dist");
const siteKind = process.argv[3] || "onboard";
const errors = [];

const sharedRequiredPaths = [
  "index.html",
  "404.html",
  "assets/css/styles.css",
  "assets/js/main.js",
  "assets/img/ultra-pro-logo-white.png"
];
const siteRequiredPaths = siteKind === "trust"
  ? ["data/trust-documents.json", "audits/README.txt"]
  : [
      "privacy.html",
      "downloads/Ultra-PRO-EDI-API-Integration-Onboarding-Workflow.docx",
      "downloads/Ultra-PRO-EDI-API-Integration-Onboarding-Workflow.pdf"
    ];
const socialPrefix = siteKind === "trust" ? "trust" : "onboard";
const socialRequiredPaths = [
  `assets/img/social/${socialPrefix}-og-1200x630.png`,
  `assets/img/social/${socialPrefix}-linkedin-1200x627.png`,
  `assets/img/social/${socialPrefix}-x-1600x900.png`,
  `assets/img/social/${socialPrefix}-square-1080x1080.png`
];

if (!["onboard", "trust"].includes(siteKind)) {
  errors.push(`Unknown site kind: ${siteKind}.`);
}

for (const requiredPath of [...sharedRequiredPaths, ...siteRequiredPaths, ...socialRequiredPaths]) {
  await requireFile(requiredPath);
}

await Promise.all([
  validatePngDimensions(`assets/img/social/${socialPrefix}-og-1200x630.png`, 1200, 630),
  validatePngDimensions(`assets/img/social/${socialPrefix}-linkedin-1200x627.png`, 1200, 627),
  validatePngDimensions(`assets/img/social/${socialPrefix}-x-1600x900.png`, 1600, 900),
  validatePngDimensions(`assets/img/social/${socialPrefix}-square-1080x1080.png`, 1080, 1080)
]);

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

if (siteKind === "trust") await validateTrustManifest();

if (siteKind === "onboard") {
  await forbidPath("trust.html");
  await forbidPath("data/trust-documents.json");
  await forbidPath("audits");

  const onboardIndex = await readFile(join(siteRoot, "index.html"), "utf8");
  if (!onboardIndex.includes("https://bookings.cloud.microsoft")) {
    errors.push("index.html: Microsoft Bookings redirect host is missing from the frame-src policy.");
  }
  validateSocialMetadata(onboardIndex, {
    canonicalUrl: "https://onboard.ultrapro.com/",
    imageUrl: "https://onboard.ultrapro.com/assets/img/social/onboard-og-1200x630.png"
  });
}

if (siteKind === "trust") {
  await forbidPath("privacy.html");
  await forbidPath("downloads");

  const trustIndex = await readFile(join(siteRoot, "index.html"), "utf8");
  if (!trustIndex.includes("security@ultrapro.com")) {
    errors.push("index.html: Trust Center security contact is missing.");
  }
  if (trustIndex.includes("edisupport@ultrapro.com")) {
    errors.push("index.html: Trust Center must not use the EDI support contact.");
  }
  const header = trustIndex.match(/<header\b[\s\S]*?<\/header>/i)?.[0] || "";
  if (/Integration onboarding/i.test(header)) {
    errors.push("index.html: Trust Center header must not link to Integration Onboarding.");
  }
  validateSocialMetadata(trustIndex, {
    canonicalUrl: "https://trust.ultrapro.com/",
    imageUrl: "https://trust.ultrapro.com/assets/img/social/trust-og-1200x630.png"
  });
}

if (errors.length) {
  console.error("Site validation failed:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${siteKind} site (${files.length} files) in ${siteRoot}`);

async function requireFile(relativePath) {
  try {
    await access(join(siteRoot, relativePath));
  } catch {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

async function forbidPath(relativePath) {
  try {
    await access(join(siteRoot, relativePath));
    errors.push(`Site boundary violation: ${relativePath} must not be present in the ${siteKind} site.`);
  } catch {
    // Expected: the other site's content must not be packaged here.
  }
}

async function validatePngDimensions(relativePath, expectedWidth, expectedHeight) {
  try {
    const image = await readFile(join(siteRoot, relativePath));
    const pngSignature = "89504e470d0a1a0a";
    if (image.length < 24 || image.subarray(0, 8).toString("hex") !== pngSignature) {
      errors.push(`${relativePath}: is not a valid PNG file.`);
      return;
    }

    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    if (width !== expectedWidth || height !== expectedHeight) {
      errors.push(`${relativePath}: expected ${expectedWidth}x${expectedHeight}, found ${width}x${height}.`);
    }
  } catch {
    // Missing files are reported by requireFile.
  }
}

function validateSocialMetadata(html, { canonicalUrl, imageUrl }) {
  const requiredFragments = [
    `<link rel="canonical" href="${canonicalUrl}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${canonicalUrl}">`,
    `<meta property="og:image" content="${imageUrl}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${imageUrl}">`,
    `"image": "${imageUrl}"`,
    `"url": "${canonicalUrl}"`
  ];

  for (const fragment of requiredFragments) {
    if (!html.includes(fragment)) {
      errors.push(`index.html: social preview metadata is missing ${fragment}.`);
    }
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
