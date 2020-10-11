const { GameCache } = require('./cache');
const { verifyTokenSignature } = require('./auth');

const MAX_PLAYERS = process.env.MAX_PLAYERS_IN_GAME || 2;

class SocketEventsHandler {
  constructor(gameCache) {
    this.gameCache = gameCache || new GameCache();
    this.events = {
      leaveEvent: 'leave',
      playerLeaveEvent: 'player_leave',
      gameStartedEvent: 'game_start',
      pairRequestEvent: 'pair_me',
      gameEndedEvent: 'game_ended',
      newPlayerEvent: 'new_player',
      playerDisconnectedEvent: 'disconnect',
    };
  }

  /**
   * @function {handleConnect}
   * @summary registers connected user in the cahce
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleConnect(socket) {
    let { username, token } = socket.handshake.query;

    if (!username || !verifyTokenSignature(token)) {
      return socket.disconnect(true);
    } else {
      const playerInfo = { username, user_id: socket.client.id, room: false, ready: false};
      this.gameCache.registerPlayer(socket.client.id, playerInfo);

      this.handleDisconnect(socket);
      this.handlePairRequest(socket);
      this.handleGameEnded(socket);
      this.handleLeaveRequest(socket);
    }
  }

  /**
   * @function {handleDisconnect}
   * @summary adds a an event handler for client disconnection to delete player from cache
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleDisconnect(socket) {
    socket.on(this.events.playerDisconnectedEvent, async function() {
      const roomName = await this.gameCache.deletePlayer(socket.client.id);
      this.handleLeave(socket, roomName);
    });
  }

  /**
   * @function {handleLeaveRequest}
   * @summary adds a an event handler for client requesting to leave the room
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleLeaveRequest(socket) {
    socket.on(this.events.playerLeaveEvent, async function() {
      const room = socket.rooms[socket.rooms.length - 1];
      this.handleLeave(socket, room);
    });
  }

  /**
   * @function {handleLeave}
   * @summary handles notifying players of leaving player and cleaning the cache
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleLeave(socket, roomName) {
    if (roomName) {
      const eventPayload = {user_id: socket.client.id, username: socket.handshake.query.username};
      socket.to(roomName).broadcast.emit(this.events.leaveEvent, eventPayload);
      socket.leave(roomName);
    }
  }

  /**
   * @function {handlePairRequest}
   * @summary adds a an event handler for client pairing request to play a game with random players
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handlePairRequest(socket) {
    socket.on(this.events.pairRequestEvent, async function() {
      const roomName = await this.gameCache.getAvaiableRoom();
      if (socket.rooms.length > 1) {
        // this socket is connected to more than one room
        // should leave all rooms except his id room before connecting
        return;
      }

      await this.gameCache.joinRoom(roomName, socket.client.id);

      socket.join(roomName);
      const eventPayload = {
        user_id: socket.client.id,
        username: socket.handshake.query.username,
        all_players: await this.gameCache.getCurrentPlayersInRoom(roomName, true),
      };
      socket.to(roomName).emit(this.events.newPlayerEvent, eventPayload);


      const playersCount = await this.gameCache.getCurrentPlayersCountInRoom(roomName);

      if (playersCount >= MAX_PLAYERS) {
        this.handleGameStart(socket, roomName);
      }
    });
  }

  /**
   * @function {handleGameStart}
   * @summary moves room to active playing state and informs players that game started
   * @param socket (SocketIO.Socket) socket object of the connected client
   * @param roomName (string) name of redis queue for this room
   */
  handleGameStart(socket, roomName) {
    this.gameCache.startGameInRoom(roomName);
    socket.to(roomName).broadcast.emit(this.events.gameStartedEvent, {});
  }

  /**
   * @function {handleGameEnded}
   * @summary removes a room from cache after game has concluded
   * @param socket (SocketIO.Socket) socket object of the connected client
   */
  handleGameEnded(socket) {
    socket.on(this.events.gameEndedEvent, async function() {
      this.gameCache.endGameInRoom(socket.rooms[socket.rooms.length - 1]);
    });
  }
}

module.exports = {
  SocketEventsHandler,
};
