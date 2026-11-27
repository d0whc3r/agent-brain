# Changelog

## [0.4.1](https://github.com/d0whc3r/agent-brain/compare/v0.4.0...v0.4.1) (2026-11-27)


### Bug Fixes

* skills ([00e3fb0](https://github.com/d0whc3r/agent-brain/commit/00e3fb08d99ab8d8f68628e8f9713c22031db9bf))

## [0.4.0](https://github.com/d0whc3r/agent-brain/compare/v0.3.0...v0.4.0) (2026-11-05)


### Features

* keep one DoD per task with brain dod --task and brain dod list ([48334b8](https://github.com/d0whc3r/agent-brain/commit/48334b8df0c239e99b1036634d22659ffa62d4be))


### Bug Fixes

* run third-party skills through pnpm dlx, not npx ([f4768e5](https://github.com/d0whc3r/agent-brain/commit/f4768e52829781d9609b7581ad4acbc1f1be106c))

## [0.3.0](https://github.com/d0whc3r/agent-brain/compare/v0.2.1...v0.3.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* the brain no longer reads memory/, dod/, flows of the user, or brain.config.json from the checkout. Before you pull, clone this version into a new folder, run scripts/install.sh there, and run brain home migrate --from <old checkout> --apply.

### Features

* add brain-web-researcher, a read-only web research agent ([e4ea60a](https://github.com/d0whc3r/agent-brain/commit/e4ea60a7f3a5b4397632162c77f3797a18c368a3))
* give each scope its own Chrome profile through brain chrome-mcp ([bafdaa8](https://github.com/d0whc3r/agent-brain/commit/bafdaa8ed55414af85219d5fc5df835969de2758))
* install the brain home from your git repo, and document the sync ([181fee1](https://github.com/d0whc3r/agent-brain/commit/181fee17a14b46428a9c1fa255585473813e3d26))
* keep the user data in a brain home outside the checkout ([e514ca6](https://github.com/d0whc3r/agent-brain/commit/e514ca632a9f3d4eff6a1849aa4f7d8af9c9f456))
* name the chrome-devtools server and the screenshot folder of the scope at session start ([d2ed71b](https://github.com/d0whc3r/agent-brain/commit/d2ed71b56e3524e11ef87d1b478bcfdc29dccd3f))
* pin Node 24 and pnpm 12.15.0 through devEngines ([ed663df](https://github.com/d0whc3r/agent-brain/commit/ed663dff61831f97f58e6bc9ebe794a6229b3a55))
* sync the brain home with brain home sync, and pull it at session start ([a41e64a](https://github.com/d0whc3r/agent-brain/commit/a41e64a9388a151644320a24dbefccc68454219f))


### Bug Fixes

* write the trigger phrases of brain-learn in English ([d8618a8](https://github.com/d0whc3r/agent-brain/commit/d8618a8dea1abafdbd86e58f6cac2491521ebe2e))

## [0.2.1](https://github.com/d0whc3r/agent-brain/compare/v0.2.0...v0.2.1) (2026-10-26)


### Bug Fixes

* update third-party skills with -a codex --copy, not npx skills update ([0512d6d](https://github.com/d0whc3r/agent-brain/commit/0512d6dd90cfcde4a593003ef21afac52ae9554b))

## [0.2.0](https://github.com/d0whc3r/agent-brain/compare/v0.1.0...v0.2.0) (2026-10-26)


### Features

* add the skip-generated-files premise ([4947459](https://github.com/d0whc3r/agent-brain/commit/4947459b65f0e88efffff4dae22d97062743175b))
* serve brain-premises with MCP SDK v2 ([13120c6](https://github.com/d0whc3r/agent-brain/commit/13120c6ff50f4ae4bcbfef73c0a163643548277b))
* ship the brain-lsp language server plugin ([a82a151](https://github.com/d0whc3r/agent-brain/commit/a82a1510138c5de472b6062249e7a827c17efa21))
* version the brain with semver and release it with release-please ([5b06e75](https://github.com/d0whc3r/agent-brain/commit/5b06e7544a57702b5f1ff517e91781d55cc53d5d))


### Bug Fixes

* install the dependencies before the skills check in update-skills ([1a2b601](https://github.com/d0whc3r/agent-brain/commit/1a2b601d7c5bb21b54f6cc048e6fb9f2a1839e77))
