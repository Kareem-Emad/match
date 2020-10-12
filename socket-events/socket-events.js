const { GameCache } = require('../cache/cache');
const { verifyTokenSignature } = require('../auth/auth');

const MAX_PLAYERS = process.env.MAX_PLAYERS_IN_GAME || 2;
const MIN_PLAYERS = process.env.MIN_PLAYERS_IN_GAME || 2;

class SocketEventsHandler {
  constructor(gameCache, max_players, min_players) {
    this.gameCache = gameCache || new GameCache();
    this.maxPlayersAllowed = max_players || MAX_PLAYERS;
    this.minPlayersAllowed = min_players || MIN_PLAYERS;

    this.events = {
      leaveEvent: 'leave',
      playerLeaveEvent: 'player_leave',
      gameStartedEvent: 'game_start',
      pairRequestEvent: 'pair_me',
      gameEndedEvent: 'game_ended',
      newPlayerEvent: 'new_player',
      playerDisconnectedEvent: 'disconnect',
      playerEndGameEvent: 'end_game_notification',
      playerReadyEvent: 'player_ready',
      announcePlayerReadyEvent: 'player_ready_announcement',
    };
  }

  /**
   * @function {handleConnect}
   * @summary registers connected user in the cahce
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleConnect(socket) {
    let { username, token } = socket.handshake && socket.handshake.query ? socket.handshake.query : {};

    if (!username || !verifyTokenSignature(token)) {
      return socket.disconnect(true);
    } else {
      const playerInfo = { username, user_id: socket.client.id, room: false, ready: false};
      this.gameCache.registerPlayer(socket.client.id, playerInfo);

      this.handleDisconnect(socket);
      this.handlePairRequest(socket);
      this.handleGameEnded(socket);
      this.handleLeaveRequest(socket);
      this.handlePlayerReady(socket);
    }
  }

  /**
   * @function {handleDisconnect}
   * @summary adds a an event handler for client disconnection to delete player from cache
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleDisconnect(socket) {
    const context = this;
    socket.on(this.events.playerDisconnectedEvent, async function() {
      const roomName = await context.gameCache.deletePlayer(socket.client.id);
      context.handleLeave(socket, roomName);
    });
  }

  /**
   * @function {handleLeaveRequest}
   * @summary adds a an event handler for client requesting to leave the room
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleLeaveRequest(socket) {
    const context = this;

    socket.on(this.events.playerLeaveEvent, async function() {
      const room = socket.rooms[socket.rooms.length - 1];
      if (room) {
        context.handleLeave(socket, room);
      }
    });
  }

  /**
   * @function {handleLeave}
   * @summary handles notifying players of leaving player and cleaning the cache
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  async handleLeave(socket, roomName) {
    await this.gameCache.leaveRoom(roomName, socket.client.id);

    const eventPayload = {user_id: socket.client.id, username: socket.handshake.query.username};
    socket.leave(roomName);
    socket.to(roomName).emit(this.events.leaveEvent, eventPayload);
  }

  /**
   * @function {handlePairRequest}
   * @summary adds a an event handler for client pairing request to play a game with random players
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handlePairRequest(socket) {
    const context = this;

    socket.on(this.events.pairRequestEvent, async function() {
      if (socket.rooms.length > 1) {
        // this socket is connected to more than one room
        // should leave all rooms except his id room before connecting
        return;
      }

      const roomName = await context.gameCache.getAvaiableRoom();
      let playersCount = await context.gameCache.getCurrentPlayersCountInRoom(roomName);
      if (playersCount === context.maxPlayersAllowed) {
        return;// we already full here
      }
      await context.gameCache.lockRoomJoins(roomName); // critical section

      playersCount = await context.gameCache.getCurrentPlayersCountInRoom(roomName); // update count since we have been waiting
      await context.gameCache.joinRoom(roomName, socket.client.id);

      socket.join(roomName);
      const eventPayload = {
        user_id: socket.client.id,
        username: socket.handshake.query.username,
        all_players: await context.gameCache.getCurrentPlayersInRoom(roomName, true),
      };
      socket.to(roomName).emit(context.events.newPlayerEvent, eventPayload);

      if (playersCount + 1 === context.maxPlayersAllowed) {
        await context.handleGameStart(socket, roomName);
      }
      await context.gameCache.unlockRoomJoins(roomName); // release critical section
    });
  }

  /**
   * @function {handleGameStart}
   * @summary moves room to active playing state and informs players that game started
   * @param socket (SocketIO.Socket) socket object of the connected client
   * @param roomName (string) name of redis queue for this room
   */
  async handleGameStart(socket, roomName) {
    const status = await this.gameCache.startGameInRoom(roomName);

    if (status) {
      socket.to(roomName).emit(this.events.gameStartedEvent, {});
    }
  }

  /**
   * @function {handleGameEnded}
   * @summary removes a room from cache after game has concluded
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleGameEnded(socket) {
    const context = this;
    socket.on(this.events.playerEndGameEvent, async function() {
      const room = socket.rooms[socket.rooms.length - 1];
      context.gameCache.endGameInRoom(room);
      socket.to(room).emit(context.events.gameEndedEvent, {});
    });
  }

  /**
   * @function {handlePlayerReady}
   * @summary handles broadcasting event that player is ready to start game and starts the game if min players present
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handlePlayerReady(socket) {
    const context = this;
    socket.on(this.events.playerReadyEvent, async function() {

      const room = socket.rooms[socket.rooms.length - 1];
      const readyCount = await context.gameCache.markPlayerAsReady(socket.client.id, room);

      socket.to(room).emit(context.events.announcePlayerReadyEvent, {
        user_id: socket.client.id,
        username: socket.handshake.query.username,
        total_ready_count: readyCount,
      });

      if (readyCount >= context.minPlayersAllowed) {
        await context.handleGameStart(socket, room);
      }
    });
  }
}
module.exports = {
  SocketEventsHandler,
};
