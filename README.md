# Fast Four

Real-time word game: one letter, four answers (Name, Place, Animal, Thing). Solo against the clock or live rooms of 2 to 8 players. Web app plus an Android app (Trusted Web Activity). Internal project name: NPAT Arena.

Stack: MongoDB, Express, React 18 (Vite), Node 22, Socket.IO 4, Bootstrap 5, JavaScript only.

## Setup

1. Install Node 22 (`nvm use`), Git and Docker.
2. `npm install`
3. `cp server/.env.example server/.env` and `cp client/.env.example client/.env`, then replace the two JWT secrets with long random strings (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`). `.env` files are git-ignored and must never be committed.
4. `docker compose up mongo -d` (local database `npatarena`)
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
