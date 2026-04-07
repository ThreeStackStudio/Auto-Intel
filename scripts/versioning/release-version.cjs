#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const APP_JSON_PATH = path.join(ROOT, "app.json");
const VALID_RELEASE_TYPES = new Set(["major", "minor", "patch", "build"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, content) {
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

function bumpSemver(version, releaseType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported semver format "${version}". Expected x.y.z.`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (releaseType === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (releaseType === "minor") {
    minor += 1;
    patch = 0;
  } else if (releaseType === "patch") {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function bumpBuildNumber(buildNumber) {
  const numericBuild = Number(buildNumber);
  if (!Number.isInteger(numericBuild) || numericBuild < 0) {
    throw new Error(
      `Invalid iOS buildNumber "${buildNumber}". Expected a non-negative integer string.`
    );
  }

  return String(numericBuild + 1);
}

function main() {
  const releaseType = process.argv[2] || "patch";
  if (!VALID_RELEASE_TYPES.has(releaseType)) {
    throw new Error(
      `Invalid release type "${releaseType}". Use one of: ${[
        ...VALID_RELEASE_TYPES,
      ].join(", ")}`
    );
  }

  const packageJson = readJson(PACKAGE_JSON_PATH);
  const appJson = readJson(APP_JSON_PATH);
  const appVersion = appJson?.expo?.version;
  const pkgVersion = packageJson?.version;

  if (!appJson?.expo?.ios) {
    throw new Error("Missing expo.ios configuration in app.json.");
  }

  if (!appVersion || !pkgVersion) {
    throw new Error("Missing version in package.json or app.json.");
  }

  if (appVersion !== pkgVersion) {
    throw new Error(
      `Version mismatch: package.json=${pkgVersion}, app.json=${appVersion}. Align them before releasing.`
    );
  }

  const nextVersion =
    releaseType === "build" ? pkgVersion : bumpSemver(pkgVersion, releaseType);
  const currentBuildNumber = appJson.expo.ios.buildNumber;
  const nextBuildNumber = bumpBuildNumber(currentBuildNumber);

  packageJson.version = nextVersion;
  appJson.expo.version = nextVersion;
  appJson.expo.ios.buildNumber = nextBuildNumber;

  writeJson(PACKAGE_JSON_PATH, packageJson);
  writeJson(APP_JSON_PATH, appJson);

  console.log(`Release prepared:
- releaseType: ${releaseType}
- version: ${pkgVersion} -> ${nextVersion}
- ios.buildNumber: ${currentBuildNumber} -> ${nextBuildNumber}`);
}

main();
