# el-sitio

[![lint](https://github.com/doomsdaycat/el-sitio/actions/workflows/lint.yml/badge.svg)](https://github.com/doomsdaycat/el-sitio/actions/workflows/lint.yml)
[![release](https://github.com/doomsdaycat/el-sitio/actions/workflows/release.yml/badge.svg)](https://github.com/doomsdaycat/el-sitio/actions/workflows/release.yml)

A React frontend (Vite) packaged as an nginx Docker image, plus a backend service.

## Prerequisites

Install the following tools (macOS via [Homebrew](https://brew.sh/)):

| Tool          | Purpose                                            | Install                       |
|---------------|----------------------------------------------------|-------------------------------|
| [Task]        | Task runner (`Taskfile.yaml`).                     | `brew install go-task`        |
| [Node.js]     | Frontend build/dev (provides `npm`).               | `brew install node`           |
| [Docker]      | Build and run the frontend image.                  | `brew install --cask docker`  |
| [actionlint]  | Lint GitHub Actions workflows (`task lint`).       | `brew install actionlint`     |
| [Helm]        | Deploy the chart in [`chart/`](chart).             | `brew install helm`           |

One-liner:

```sh
brew install go-task node actionlint helm
brew install --cask docker
```

[Task]: https://taskfile.dev/
[Node.js]: https://nodejs.org/
[Docker]: https://www.docker.com/
[actionlint]: https://github.com/rhysd/actionlint
[Helm]: https://helm.sh/

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

## Deploy (ArgoCD)

Deployment is managed externally by ArgoCD, which syncs the Helm chart in
[`chart/`](chart) to the cluster. To deploy a release, bump `appVersion` in
[`chart/Chart.yaml`](chart/Chart.yaml) to the image tag you want and commit —
ArgoCD rolls it out.

```yaml
appVersion: "1.2.3"
```
