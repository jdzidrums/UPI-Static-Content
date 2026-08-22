import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(repositoryRoot, "site");
const outputDirectory = join(repositoryRoot, "dist");

const configuration = {
  "__EDI_SUPPORT_EMAIL__": process.env.EDI_SUPPORT_EMAIL || "edisupport@ultrapro.com",
  "__BOOKINGS_URL__": process.env.BOOKINGS_URL || "https://outlook.office.com/book/Gf5423982311f4b3ab05454634c0d6b7a@ultrapro.com/"
};

validateConfiguration(configuration);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
await replaceTokens(outputDirectory);

await writeFile(
  join(outputDirectory, "build.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      gitSha: process.env.GITHUB_SHA || "local",
      environment: process.env.DEPLOYMENT_ENVIRONMENT || "local"
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`Built partner portal in ${outputDirectory}`);

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
