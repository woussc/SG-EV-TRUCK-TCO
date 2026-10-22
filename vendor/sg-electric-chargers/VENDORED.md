# Vendored: sg-electric-chargers (BoCharge)

This directory contains a vendored, in-tree copy of an external open-source project.
It is included here for **future work building a fleet-manager tool** (public-charging
location/mapping context for Singapore EV chargers). It is **not** wired into the
Hong Seh EV TCO calculator at the repo root.

## Provenance

- Upstream repository: https://github.com/celesteanglm/sg-electric-chargers
- Upstream project name: BoCharge (Singapore / Malaysia EV charger locator, React + Vite)
- Vendored commit SHA: `6ce343185b8f7a3cd2739a87f6d5dc879a8c2a3a`
  (`Merge pull request #32 from celesteanglm/fix/mobile-filter-controls`)
- Vendored on: 2026-10-22
- License: MIT (see `LICENSE`). Attribution and data-source notices are preserved in
  `NOTICE.md`. The MIT `LICENSE` and `NOTICE.md` are kept byte-for-byte from upstream so
  attribution and license terms remain intact.

## How it was vendored

The upstream repository was cloned over HTTPS into a temporary directory and its
contents were copied into `vendor/sg-electric-chargers/` **excluding the upstream
`.git` directory**. It is deliberately vendored as plain in-tree files, **not** as a
git submodule, so the source lives directly in this repository for later integration.

## Why the upstream `.github/` was neutralized

Upstream ships its own GitHub Actions workflow at `.github/workflows/ci.yml` (an
`npm ci` + `npm run check` CI job). If that directory were copied in verbatim, GitHub
could surface or attempt to run the upstream CI inside the `woussc/SG-EV-TRUCK-TCO`
repository in a surprising way (and it has nothing to do with this repo). To avoid that,
the vendored `.github/` directory has been **renamed to `upstream-github-disabled/`**.
The files are preserved for reference but are no longer in a location GitHub treats as
active workflow / repo configuration. The only active workflows in this repository live
under the repo-root `.github/workflows/` (the GitHub Pages deploy workflow for the TCO
tool).

If you later want to run the upstream CI as part of this repo, port the relevant steps
into a new workflow under the repo-root `.github/workflows/` deliberately, rather than
re-activating the vendored copy as-is.

## Upstream docs

See the vendored `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `PRIVACY.md`, and
`NOTICE.md` in this directory for upstream usage, data-source terms, and contribution
guidance.
