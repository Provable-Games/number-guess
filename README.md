# Number Guess

[![Scarb](https://img.shields.io/badge/Scarb-2.15.1-blue)](https://github.com/software-mansion/scarb)
[![Starknet Foundry](https://img.shields.io/badge/snforge-0.55.0-purple)](https://foundry-rs.github.io/starknet-foundry/)
[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](LICENSE)

On-chain number guessing game for Starknet. Players mint game tokens via [Denshokan](https://github.com/Provable-Games/denshokan) and play rounds of guess-the-number with configurable ranges, max attempts, and scoring.

## Architecture

```
number-guess/
├── contracts/               # Cairo smart contracts (Scarb 2.15.1)
│   └── packages/
│       └── number_guess/    # MinigameComponent-based game contract
│           └── src/
│               ├── number_guess.cairo    # Game logic and storage
│               └── tests/               # snforge unit tests
├── indexer/                 # Apibara event indexer (TypeScript)
│   ├── indexers/            # Indexer definitions
│   ├── src/lib/             # Schema and event decoders
│   └── migrations/          # PostgreSQL migrations (Drizzle)
├── api/                     # Hono REST API + WebSocket server
│   └── src/
│       ├── routes/          # sessions, leaderboard, stats, players
│       ├── ws/              # Real-time subscriptions
│       └── db/              # Database client
└── docker-compose.yml       # PostgreSQL, indexer, API services
```

## Game Mechanics

- **Configurable settings**: Range (min-max), max attempts, created via Denshokan settings system
- **Gameplay**: Players guess a secret number; contract responds with "too low", "too high", or "correct"
- **Range narrowing**: After each guess, the valid range narrows based on the result
- **Scoring**: Base 100 points + efficiency bonus for optimal guesses + 50 point bonus for first-guess wins
- **Token integration**: Games are played on Denshokan tokens with packed token IDs containing game metadata

## Events

| Event | Keys | Data |
|-------|------|------|
| `NewGameStarted` | selector, token_id | settings_id, range_min, range_max, max_attempts |
| `GuessMade` | selector, token_id | guess_value, result, guess_count, range_min, range_max |

## Prerequisites

- [Scarb](https://docs.swmansion.com/scarb/) 2.15.1+
- [Starknet Foundry](https://foundry-rs.github.io/starknet-foundry/) 0.55.0+
- Node.js 22+
- PostgreSQL 16+ (or Docker)

## Quick Start

### Contracts

```bash
cd contracts
scarb build                  # Compile
snforge test                 # Run all 78 tests
scarb fmt -w                 # Format code
```

### Local Development (Indexer + API)

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start API server (separate terminal)
npm run dev:api

# Start indexer (separate terminal)
npm run dev:indexer
```

### Docker (all services)

```bash
docker-compose up -d
```

## Contract Deployment

```bash
cd contracts
cp .env.example .env
# Edit .env: PROFILE, DENSHOKAN_ADDRESS, GAME_REGISTRY_ADDRESS

./scripts/deploy_number_guess.sh
```

The script declares and deploys the NumberGuess contract, registers it with the Denshokan game registry, and saves deployment info to `contracts/deployments/`.

## API

Hono-based REST API with WebSocket support on port 3002.

| Endpoint | Description |
|----------|-------------|
| `GET /sessions` | List game sessions (filter by tokenId, status, settingsId) |
| `GET /sessions/:id` | Session detail with embedded guesses |
| `GET /sessions/:id/guesses` | Guess history for a session |
| `GET /leaderboard` | Rankings by score, guess count, win rate |
| `GET /stats` | Aggregate game statistics |
| `GET /players/:tokenId` | Player game history |
| `GET /health` | Health check (includes DB status) |
| `WS /ws` | Real-time events (new_game, guess, win, loss) |

## Environment Configuration

### Contracts (`contracts/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PROFILE` | Yes | snfoundry.toml profile (sepolia, mainnet) |
| `DENSHOKAN_ADDRESS` | Yes | Denshokan token contract address |
| `GAME_REGISTRY_ADDRESS` | Yes | MinigameRegistry contract address |
| `SKIP_CONFIRMATION` | No | Skip deployment prompts |

### Indexer (`indexer/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NUMBER_GUESS_ADDRESS` | Yes | NumberGuess contract address |
| `STREAM_URL` | Yes | Apibara DNA stream URL |
| `STARTING_BLOCK` | Yes | Block number to start indexing from |

### API (`api/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Server port (default: 3002) |
| `CORS_ORIGIN` | No | Allowed CORS origin |

## Dependencies

The contract uses the [game-components](https://github.com/Provable-Games/game-components) library:
- `game_components_embeddable_game_standard` - MinigameComponent for game lifecycle

OpenZeppelin Cairo v3.0.0 for token standards.

Test dependencies reference [Denshokan](https://github.com/Provable-Games/denshokan) packages for shared test infrastructure (deploy helpers, constants, mock contracts).

## License

All rights reserved. Provable Games.
