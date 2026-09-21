# OpenSCORM web

The React front-end for [OpenSCORM](https://www.openscorm.com), an open-source SCORM content delivery platform. This SPA serves the app at [live.openscorm.com](https://live.openscorm.com): sign-in, registration, course library, SCORM player, dashboards, and operator surfaces.

## What is OpenSCORM?

OpenSCORM is a hosted platform for delivering SCORM-based training without
a full LMS. Upload SCORM 1.2 or xAPI packages, deliver them through any LMS
(or none), and track learner completions for audit.

- SCORM 1.2 and xAPI content support
- Completion tracking and CSV reporting
- Multi-tenant organization management
- Flat-rate pricing with no overage fees
- Open source under the GNU AGPL v3

## Stack

- React 18 + TypeScript, built with Vite
- Tailwind CSS v4 with shadcn-style components
- TanStack Query for server state
- React Router, React Hook Form + Zod
- Vitest + Testing Library

## Development

Requires Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

The dev server proxies `/api` to `http://localhost:5100`. The OpenSCORM API is not part of this repository, so API-backed pages need a running backend. The UI itself builds, lints, and tests standalone:

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

## About this repository

This repository is published from the private OpenSCORM platform monorepo, where day-to-day development happens. Issues and pull requests are welcome. Accepted changes are ported into the monorepo and flow back out with the next publish.

## Links

- Website: [www.openscorm.com](https://www.openscorm.com)
- Docs: [www.openscorm.com/docs](https://www.openscorm.com/docs)
- Pricing: [www.openscorm.com/pricing](https://www.openscorm.com/pricing)
- Blog: [www.openscorm.com/blog](https://www.openscorm.com/blog)

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

Copyright (c) 2025-2026 OpenSCORM.
