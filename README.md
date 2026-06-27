# el-sitio

[![lint](https://github.com/doomsdaycat/el-sitio/actions/workflows/lint.yml/badge.svg)](https://github.com/doomsdaycat/el-sitio/actions/workflows/lint.yml)
[![release](https://github.com/doomsdaycat/el-sitio/actions/workflows/release.yml/badge.svg)](https://github.com/doomsdaycat/el-sitio/actions/workflows/release.yml)

A React frontend (Vite) packaged as an nginx Docker image, plus a backend service.

## Tasks

Run `task` to list everything. Common ones:

| Task            | Description                                                          |
|-----------------|---------------------------------------------------------------------|
| `task install`  | Install all dependencies.                                            |
| `task dev`      | Run the frontend in dev mode.                                        |
| `task build`    | Build the frontend.                                                  |
| `task docker`   | Install, build (`NODE_ENV=production`) and package the Docker image. |
| `task lint`     | Lint the frontend (eslint) and GitHub Actions workflows (actionlint). |

## Release model

Releases are driven by **git tags**. Pushing a tag matching `v*` triggers the
[`release`](.github/workflows/release.yml) workflow, which builds the frontend
in production mode and publishes the Docker image to the GitHub Container
Registry (GHCR).

### Cutting a release

```sh
git tag v1.2.3
git push origin v1.2.3
```

### Published image

The image is pushed to `ghcr.io/doomsdaycat/el-sitio` with these tags (via
[`docker/metadata-action`](https://github.com/docker/metadata-action)):

- `1.2.3` — full semver version from the tag
- `1.2` — major.minor
- `latest` — most recent release

Pull and run a release:

```sh
docker pull ghcr.io/doomsdaycat/el-sitio:latest
docker run --rm -p 8080:80 ghcr.io/doomsdaycat/el-sitio:latest
```

Use [semantic versioning](https://semver.org/) for tags so the `major.minor`
and full-version image tags stay meaningful.

## Deploy (Helm)

A Helm chart lives in [`chart/`](chart). It deploys the frontend image with a
`Deployment`, `Service`, and optional `Ingress`/HPA.

```sh
helm upgrade --install el-sitio ./chart \
  --set image.tag=1.2.3
```

The image tag is pinned via `image.tag` in
[`chart/values.yaml`](chart/values.yaml) and bumped automatically by ArgoCD
Image Updater on new releases. Override `image.tag` to deploy a specific
version manually.
