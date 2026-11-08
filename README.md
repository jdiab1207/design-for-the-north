# Design for the North

**Hackathon project** — water delivery visibility and priority routing for Inuit communities in the North.

In many northern communities, drinking water is delivered by truck. Households often don't know when their next delivery will arrive, and dispatchers and drivers need a clearer way to prioritize homes that are running critically low.

## What it does

- **Community view** — See household tank status (critical / low / stable), urgency, and available trucks at a glance.
- **Arrival awareness** — Give residents and operators a clearer sense of when water is expected to arrive.
- **Priority routing** — Build optimized delivery routes that prioritize homes that need water most (vulnerable households, low remaining days of water, etc.).
- **Driver app** — Mobile-style workflow for truckers: check in, follow the route, and mark deliveries complete.
- **Live map** — Map of homes, trucks, and planned routes for operations and dispatch simulation.

## Why it matters

Reliable water access is essential. This prototype explores how better information and smarter routing can help Inuit communities plan around deliveries, reduce uncertainty, and make sure the most urgent homes are served first.

## Tech stack

- React + TypeScript
- Vite
- Leaflet / React-Leaflet (maps)
- Lucide React (icons)

## Getting started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Hackathon note

This is a prototype built for a design / hackathon context. Data and routing are simulated for demonstration — not production dispatch software.

## License

MIT
