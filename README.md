# Fast Four

Real-time word game: one letter, four answers (Name, Place, Animal, Thing). Solo against the clock or live rooms of 2 to 8 players. Web app plus an Android app (Trusted Web Activity). Internal project name: NPAT Arena.

Stack: MongoDB, Express, React 18 (Vite), Node 22, Socket.IO 4, Bootstrap 5, JavaScript only.

## Setup

1. Install Node 22 (`nvm use`), Git and Docker.
2. `npm install`
3. Create `server/.env` with the settings listed in [docs/ENV.md](docs/ENV.md). Use two different long random strings for the JWT secrets (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`). `.env` files are git-ignored and must never be committed.
4. `docker compose up mongo -d` (local database `npatarena`) or use a local MongoDB install
5. `npm run dev` (server on 4000, client on 5173)

## Scripts

| Command                           | What it does                |
| --------------------------------- | --------------------------- |
| `npm run dev`                     | Server and client together  |
| `npm run build`                   | Build the client            |
| `npm start`                       | Start the production server |
| `npm run lint` / `npm run format` | ESLint / Prettier           |
| `npm test`                        | Unit and integration tests  |

Contact and support: creatiquework@gmail.com
