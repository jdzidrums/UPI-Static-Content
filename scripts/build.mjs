import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(repositoryRoot, "site");
const outputDirectory = join(repositoryRoot, "dist");
const onboardOutputDirectory = join(outputDirectory, "onboard");
const trustOutputDirectory = join(outputDirectory, "trust");

const configuration = {
  "__EDI_SUPPORT_EMAIL__": process.env.EDI_SUPPORT_EMAIL || "edisupport@ultrapro.com",
  "__BOOKINGS_URL__": process.env.BOOKINGS_URL || "https://outlook.office.com/book/Gf5423982311f4b3ab05454634c0d6b7a@ultrapro.com/s/g887hXf47UGAtzwghQraEg2?ismsaljsauthenabled"
};

validateConfiguration(configuration);

await rm(outputDirectory, { recursive: true, force: true });
await Promise.all([
  buildOnboardSite(),
  buildTrustSite()
]);

console.log(`Built onboarding site in ${onboardOutputDirectory}`);
console.log(`Built trust center in ${trustOutputDirectory}`);

async function buildOnboardSite() {
  await mkdir(onboardOutputDirectory, { recursive: true });
  await Promise.all([
    copyPath("index.html", onboardOutputDirectory),
    copyPath("privacy.html", onboardOutputDirectory),
    copyPath("404.html", onboardOutputDirectory),
    copyPath("assets", onboardOutputDirectory),
    copyPath("downloads", onboardOutputDirectory)
  ]);
  await replaceTokens(onboardOutputDirectory);
  await writeBuildMetadata(onboardOutputDirectory, "onboard");
}

async function buildTrustSite() {
  await mkdir(trustOutputDirectory, { recursive: true });
  await Promise.all([
    cp(join(sourceDirectory, "trust.html"), join(trustOutputDirectory, "index.html")),
    cp(join(sourceDirectory, "trust-404.html"), join(trustOutputDirectory, "404.html")),
    copyPath("assets", trustOutputDirectory),
    copyPath("data", trustOutputDirectory),
    copyPath("audits", trustOutputDirectory)
  ]);
  await replaceTokens(trustOutputDirectory);
  await writeBuildMetadata(trustOutputDirectory, "trust");
}

async function copyPath(relativePath, destinationDirectory) {
  await cp(join(sourceDirectory, relativePath), join(destinationDirectory, relativePath), { recursive: true });
}

async function writeBuildMetadata(destinationDirectory, site) {
  await writeFile(
    join(destinationDirectory, "build.json"),
    JSON.stringify(
      {
        site,
        builtAt: new Date().toISOString(),
        gitSha: process.env.GITHUB_SHA || "local",
        environment: process.env.DEPLOYMENT_ENVIRONMENT || "local"
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function validateConfiguration(values) {
  const email = values["__EDI_SUPPORT_EMAIL__"];
  const bookingsUrl = values["__BOOKINGS_URL__"];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("EDI_SUPPORT_EMAIL must be a valid email address.");
  }

  const parsedBookingsUrl = new URL(bookingsUrl);
  if (parsedBookingsUrl.protocol !== "https:" || parsedBookingsUrl.hostname !== "outlook.office.com") {
    throw new Error("BOOKINGS_URL must be an HTTPS outlook.office.com URL.");
  }
}

async function replaceTokens(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await replaceTokens(path);
      continue;
    }

    if (!/\.(html|js|json|txt|xml|webmanifest)$/i.test(entry.name)) continue;

    let content = await readFile(path, "utf8");
    for (const [token, value] of Object.entries(configuration)) {
      content = content.replaceAll(token, value);
    }
    await writeFile(path, content, "utf8");
  }
}
