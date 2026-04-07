#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const APP_JSON_PATH = path.join(ROOT, "app.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const packageJson = readJson(PACKAGE_JSON_PATH);
  const appJson = readJson(APP_JSON_PATH);

  const packageVersion = packageJson?.version;
  const appVersion = appJson?.expo?.version;
  const bundleIdentifier = appJson?.expo?.ios?.bundleIdentifier;
  const buildNumber = appJson?.expo?.ios?.buildNumber;

  assert(packageVersion, "package.json version is missing.");
  assert(appVersion, "app.json expo.version is missing.");
  assert(
    packageVersion === appVersion,
    `Version mismatch: package.json=${packageVersion}, app.json=${appVersion}.`
  );
  assert(
    typeof bundleIdentifier === "string" && bundleIdentifier.length > 0,
    "app.json expo.ios.bundleIdentifier must be set."
  );

  const numericBuild = Number(buildNumber);
  assert(
    Number.isInteger(numericBuild) && numericBuild >= 0,
    `app.json expo.ios.buildNumber must be a non-negative integer string. Current: ${buildNumber}`
  );

  console.log("Versioning check passed.");
  console.log(`- version: ${packageVersion}`);
  console.log(`- ios.bundleIdentifier: ${bundleIdentifier}`);
  console.log(`- ios.buildNumber: ${buildNumber}`);
}

main();
