# NSW Primary Staffing Planner

A browser-based tool for planning next year's staffing at a NSW primary school. See [PLAN.md](PLAN.md) for the full plan and [CLAUDE.md](CLAUDE.md) for contributor rules.

All data stays in your browser (IndexedDB). Nothing is sent to a server. The repository contains **fictional sample data only**; never commit real staff data.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

## Deployment

Pushes to `main` build and deploy to GitHub Pages via `.github/workflows/ci-deploy.yml`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
