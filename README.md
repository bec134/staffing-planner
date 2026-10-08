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

Every pull request and push runs the tests and build via `.github/workflows/ci-deploy.yml`. Deploying to GitHub Pages is off by default, because Pages isn't available for private repositories on GitHub's free plan. To turn it on:

1. Make the repository public or move it to a paid plan. The repo and site contain no real data, only code and fictional samples.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables**, add `PAGES_ENABLED` = `true`.

Pushes to `main` then deploy automatically.
