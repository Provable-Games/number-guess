# Number Guess

On-chain Number Guessing Game for Starknet. A standalone minigame that integrates with [Denshokan](https://github.com/Provable-Games/denshokan) for token minting and game registration.

## Project Structure

```
number-guess/
├── contracts/              # Cairo smart contracts (Scarb workspace)
│   ├── Scarb.toml          # Workspace config (Cairo 2.15.0, Scarb 2.15.0)
│   ├── snfoundry.toml      # sncast profiles only
│   ├── .env.example
│   ├── packages/
│   │   └── number_guess/   # NumberGuess contract
│   ├── scripts/            # Deployment scripts
│   └── deployments/        # Deployment artifacts
├── indexer/                # Apibara event indexer (TypeScript)
├── api/                    # Hono REST API + WebSocket server
├── docker-compose.yml      # PostgreSQL, indexer, API services
└── package.json            # npm workspaces root (indexer, api)
```

## Quick Commands

### Contracts

```bash
cd contracts
scarb build                          # Compile
snforge test                         # Run all tests
snforge test test_name               # Run specific test
snforge test -x                      # Stop on first failure
scarb fmt -w                         # Format code
scarb fmt --check --workspace        # Check formatting (CI)
```

### Indexer

```bash
cd indexer
npm run dev                     # Start indexer (dev mode)
npm run db:generate             # Generate migrations from schema
npm run db:migrate              # Run migrations
npm run db:studio               # Open Drizzle Studio
```

### API

```bash
cd api
npm run dev                     # Start API server (watch mode)
npm run build                   # Compile TypeScript
```

### Docker

```bash
docker-compose up -d postgres   # Start PostgreSQL only
docker-compose up -d            # Start all services
```

## Architecture

### Contract (`contracts/packages/number_guess/`)

The NumberGuess contract uses game-components for minigame standards:

- **MinigameComponent** - Base game registration & token interaction
- **ObjectivesComponent** - Achievement tracking
- **SettingsComponent** - Difficulty configuration
- **SRC5Component** - Interface introspection

**Game Features:**
- Pseudorandom number generation via Pedersen hash
- Binary search feedback (too low / too high / correct)
- Score calculation with efficiency bonuses
- Settings: Easy (1-10), Medium (1-100, 10 attempts), Hard (1-1000, 10 attempts)
- Objectives: First Win, Quick Thinker (5 guesses), Lucky Guess (1 guess)

**Events:**
- `NewGameStarted` - Keys: [selector, token_id], Data: [settings_id, range_min, range_max, max_attempts]
- `GuessMade` - Keys: [selector, token_id], Data: [guess_value, result, guess_count, range_min, range_max]

### Indexer (`indexer/`)

Apibara-based indexer watching the NumberGuess contract:

**Events Indexed:** NewGameStarted, GuessMade

**Database Tables:**
- `game_sessions` - Token game state (status, guessCount, score)
- `guesses` - Individual guess records with range narrowing
- `game_stats` - Aggregate statistics

### API (`api/`)

Hono-based REST API:

- `GET /sessions` - List game sessions (filter by tokenId, status, settingsId)
- `GET /sessions/:id` - Session detail with embedded guesses
- `GET /sessions/:id/guesses` - Guess history
- `GET /leaderboard` - Rankings by score
- `GET /stats` - Aggregate game stats
- `GET /players/:tokenId` - Player game history
- `GET /health` - Health check
- `WS /ws` - Real-time events (new_game, guess, game_won, game_lost)

## Dependencies

### game-components Library

```toml
game_components_embeddable_game_standard = { git = "...", branch = "next" }
```

### Denshokan (dev-dependencies for testing)

Tests require denshokan packages for the full game lifecycle (registry, token, renderer):

```toml
[dev-dependencies]
denshokan_testing = { git = "...", branch = "main" }
denshokan_token = { git = "...", branch = "main" }
denshokan_registry = { git = "...", branch = "main" }
denshokan_renderer = { git = "...", branch = "main" }
```

### OpenZeppelin Cairo (v3.0.0)

Used for ERC721, introspection, and access control interfaces.

## Deployment

### Contract

```bash
cd contracts
cp .env.example .env
# Edit .env: PROFILE, DENSHOKAN_ADDRESS, GAME_REGISTRY_ADDRESS
./scripts/deploy_number_guess.sh
```

### Indexer

Set environment:
- `NUMBER_GUESS_ADDRESS` - NumberGuess contract address
- `STREAM_URL` - Apibara DNA stream URL
- `STARTING_BLOCK` - Block to start indexing from
- `DATABASE_URL` - PostgreSQL connection string

### API

Set environment:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3002)
- `CORS_ORIGIN` - Allowed CORS origin

## Workflow Rules

### Cairo Contract Changes

After any modifications to Cairo contract files, always run `cd contracts && scarb fmt -w` before committing.

## RPC Endpoints

- Mainnet: `https://api.cartridge.gg/x/starknet/mainnet`
- Sepolia: `https://api.cartridge.gg/x/starknet/sepolia`
