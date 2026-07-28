# InformationBoard

InformationBoard is a free-beta service for creating store, event, and meeting
guides and sharing them through a stable link or QR code.

## Requirements

- Node.js 20.9 or newer; Node.js 24 is used in CI.
- npm.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Run `npm ci`.
3. Run `npm run dev`.
4. Open <http://localhost:3000>.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build`
- `npm run test:e2e`
- `npm audit --audit-level=high`

The archived 2019 prototype lives under `legacy/` and must not be deployed.
