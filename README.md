# Spumetrade

**Hold dollars. Reach every token worth watching.**

[![Live site](https://img.shields.io/badge/live-spumetrade.xyz-2588fc?style=flat-square)](https://spumetrade.xyz)
![Chain](https://img.shields.io/badge/chain-Solana-2588fc?style=flat-square)

| | |
|---|---|
| Chain | Solana mainnet |
| Contract address | `TBA` (announced on the site first, pinned in the bar at the top) |
| Site | https://spumetrade.xyz |
| X | https://x.com/spumetrade |

## Overview

Spumetrade is a front door to Solana markets. The idea is simple: your buying power
lives as one dollar figure, a live board shows what the market is chasing, and you
decide where the figure goes next. The site you are looking at is phase one: the board.

It is a static site. It reads public market data in the browser, holds no funds,
asks for no wallet connection and signs nothing.

## Features

- Live market board: the ten most-boosted Solana tokens with price, 24h change, volume and liquidity
- Price ticker built from the same live data
- Pinned row #1 for the Spumetrade token, active as soon as its contract address is stated
- Contract address bar fixed to the top of the page, click to copy, inert until an address exists
- Skeleton loaders, count-up numbers with change flashes, spring-driven reveals, hero parallax
- Polling every 60 seconds, paused while the tab is hidden, exponential backoff, last good data kept
- Full `prefers-reduced-motion` support

## Project layout

```
brand/        logo originals
reference/    brand reference slides
src/          site source (register, modules, styles, assets)
scripts/      build, gates, local server, asset preparation
docs/         whitepaper
dist/         deploy output (generated)
```

## Build

```
npm run build     # writes dist/
npm run gates     # builds both contract-address branches and runs every gate
npm run serve     # serves dist/ on http://localhost:4173
```

Every external fact (contract address, social links, market sources) is a single record in
`src/js/register.js` with a state of `stated`, `absent` or `unconfirmed`. Records that are
not stated render inert. To announce the contract address, set the `ca` record to
`{ state: 'stated', value: '<address>' }` and rebuild.

## Links

- Site: https://spumetrade.xyz
- X: https://x.com/spumetrade
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)
- License: [MIT](LICENSE)
