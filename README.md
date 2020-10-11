# Match

[![Build Status:](https://github.com/Kareem-Emad/match/workflows/Build/badge.svg)](https://github.com/Kareem-Emad/match/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

match is a multiplayer game server that manages all logic behind starting a new game, matching/connecting online players, inviting friends to a game for you so you could focus on building the game itself wihtout worrying about such networking details.

## Setup

first make sure you set up the env variable properlly for:

- `MAX_PLAYERS_IN_GAME` max number of players to join a single game

- `MIN_PLAYERS_IN_GAME` minumum number of players enough to start a game

- `REDIS_CONNECTION_URL` redis connection url

- `SERVER_PORT` port number for the express server to listen to

```shell
npm install
npm start
```

## Features

- [x] connecting and mating random players.
- [x] handles disconnection and reconnection events from user due to network.
- [x] updates players with online teammates and disconnected ones.
- [x] Supports starting matches with players between min/max allowed using `ready` consent by users.
- [ ] In game chat
- [ ] Friends Invite and private rooms
- [ ] out of the box web sdk(js)
- [ ] out of the box android sdk
- [ ] jwt Authentication

## SDK

TBA
