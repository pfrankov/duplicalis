# Release

Publishing is automated by `.github/workflows/publish-npm.yml`.

## Requirements

- npm Trusted Publisher configured for `pfrankov/duplicalis`, workflow filename `publish-npm.yml`, allowed action `npm publish`
- Tag format: `vX.Y.Z`

## Flow

1. Update `package.json` version.
2. Push a matching tag, for example `v1.1.1`.
3. GitHub Actions runs `npm ci`, `npm test`, and `npm publish --provenance --access public` through OIDC without an npm token secret.

The test suite is CI-safe on a clean checkout and does not require a pre-downloaded
`models/all-MiniLM-L6-v2` tree.
