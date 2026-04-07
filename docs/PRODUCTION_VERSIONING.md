# Production Versioning

This project uses a single production release flow that keeps version data aligned across:

- `package.json` -> `version`
- `app.json` -> `expo.version`
- `app.json` -> `expo.ios.buildNumber`

## Rules

1. `package.json.version` and `app.json.expo.version` must always match.
2. Every production iOS build increments `expo.ios.buildNumber`.
3. The iOS app identity is fixed at `expo.ios.bundleIdentifier = com.autointel.app`.
4. Only use the release scripts below to prepare production versions.

## Commands

- Patch release: `npm run release:prod:patch`
- Minor release: `npm run release:prod:minor`
- Major release: `npm run release:prod:major`
- Build-only bump (same semver, next iOS build): `npm run release:prod:build`
- Validate config before shipping: `npm run version:verify`

## What each release command does

1. Verifies `package.json.version` and `app.json.expo.version` are currently aligned.
2. Bumps semantic version when using `patch`, `minor`, or `major`.
3. Increments `app.json.expo.ios.buildNumber` by 1 on every release command.
4. Writes changes to `package.json` and `app.json`.

## Suggested production checklist

1. Run `npm run version:verify`.
2. Run one release command based on the release scope.
3. Commit version changes.
4. Build and submit the iOS artifact.
