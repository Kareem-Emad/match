const assert = require('assert');
const Redis = require('ioredis-mock');
const SocketMock = require('socket.io-mock');

const { describe, it} = require('mocha');

const { GameCache } = require('../cache');
const { SocketEventsHandler } = require('../socket-events');


const redisMock = new Redis();

redisMock.blpop = async function(key, timeout){
  while (!(await redisMock.lpop(key))){};

  return;
};

describe('cache manipulation', () => {

  beforeEach(function() {
    redisMock.flushall();
  });

  it('should be able to register new players and get their info', async() => {
    const playerID = 'player-id';
    const playerInfo = {username: 'testo'};


    const gameCache = new GameCache(redisMock);

    await gameCache.registerPlayer(playerID, playerInfo);
    const retrievedPlayerInfo = await gameCache.getPlayerInfo(playerID);

    assert.deepStrictEqual(retrievedPlayerInfo, playerInfo);
  });

  it('should be able to delete registered players', async() => {
    const playerID = 'player-id';
    const playerInfo = {username: 'testo'};


    const gameCache = new GameCache(redisMock);

    await gameCache.registerPlayer(playerID, playerInfo);
    await gameCache.deletePlayer(playerID);

    const retrievedPlayerInfo = await gameCache.getPlayerInfo(playerID);
    assert.equal(retrievedPlayerInfo, null);
  });

  it('should be able to create, join and leave rooms', async() => {
    const playerID = 'player-id';
    const playerInfo = {username: 'testo'};

    const gameCache = new GameCache(redisMock);

    await gameCache.registerPlayer(playerID, playerInfo);
    const roomName = await gameCache.createNewRoom();

    await gameCache.joinRoom(roomName, playerID);

    let joinedCount = await gameCache.getCurrentPlayersCountInRoom(roomName);
    assert.equal(joinedCount, 1);

    let joinedIDs = await gameCache.getCurrentPlayersInRoom(roomName);
    assert.deepStrictEqual(joinedIDs, [playerID]);

    await gameCache.leaveRoom(roomName, playerID);

    joinedCount = await gameCache.getCurrentPlayersCountInRoom(roomName);
    assert.equal(joinedCount, 0);

    joinedIDs = await gameCache.getCurrentPlayersInRoom(roomName);
    assert.deepStrictEqual(joinedIDs, []);
  });

  it('should create a new room if none aviable and start a game with it', async() => {
    const gameCache = new GameCache(redisMock);
    const roomName = await gameCache.getAvaiableRoom();
    let rooms = await gameCache.getAllActiveRooms();

    assert.equal(rooms.includes(roomName), true);
    assert.equal(await gameCache.getAvaiableRoom(), roomName);
    assert.equal((await gameCache.getAllActiveRooms()).length, 1);

    await gameCache.startGameInRoom(roomName);
    rooms = await gameCache.getAllActiveRooms();
    const playingRooms = await gameCache.getAllPlayingRooms();

    assert.equal(rooms.includes(roomName), false);
    assert.equal(playingRooms.includes(roomName), true);
  });

  it('should remove player from room if he is in any', async() => {
    const playerID = 'player-id';
    const playerInfo = {username: 'testo', room: false, ready: false};

    const gameCache = new GameCache(redisMock);

    await gameCache.registerPlayer(playerID, playerInfo);
    const roomName = await gameCache.createNewRoom();

    await gameCache.joinRoom(roomName, playerID);

    let playerExpectedInfo = await gameCache.getPlayerInfo(playerID);
    assert.equal(playerExpectedInfo.room, roomName);

    let joinedCount = await gameCache.getCurrentPlayersCountInRoom(roomName);
    assert.equal(joinedCount, 1);

    let joinedIDs = await gameCache.getCurrentPlayersInRoom(roomName);
    assert.deepStrictEqual(joinedIDs, [playerID]);

    await gameCache.deletePlayer(playerID);

    joinedCount = await gameCache.getCurrentPlayersCountInRoom(roomName);
    assert.equal(joinedCount, 0);
  });

  it('should be able to get a list of all players with full data dicts', async() => {
    const playerID1 = 'player-id+1';
    const playerInfo1 = {username: 'testo+1', room: false, ready: false};
    const playerID2 = 'player-id+2';
    const playerInfo2 = {username: 'testo+2', room: false, ready: false};

    const gameCache = new GameCache(redisMock);

    await gameCache.registerPlayer(playerID1, playerInfo1);
    await gameCache.registerPlayer(playerID2, playerInfo2);

    const roomName = await gameCache.createNewRoom();

    await gameCache.joinRoom(roomName, playerID1);
    await gameCache.joinRoom(roomName, playerID2);

    playerInfo1.room = roomName;
    playerInfo2.room = roomName;

    let joinedDicts = await gameCache.getCurrentPlayersInRoom(roomName, true);
    assert.deepStrictEqual(joinedDicts, [playerInfo2, playerInfo1]);
  });
});

describe('socket events', function(){
  beforeEach(function() {
    redisMock.flushall();
  });

  it('Socket should reject a client connect if he does not have a username/token attached', function(done) {
    const socket = new SocketMock();
    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache);

    socket.disconnect = function(flag) {
      assert(flag, true);
      done();
    };
    socketEventsHandler.handleConnect(socket);
  });

  it('Socket should accept a client with valid username/token in query and register him in cache and attach callbacks', async function() {
    const socket = new SocketMock();
    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache);

    socket.disconnect = function(flag) {
      assert.fail('should not call disconnect for a valid client');
    };

    socket.handshake = {query: {username: 'testak', token: 'some_token'}};
    socket.client = {id: 123};

    socketEventsHandler.handleConnect(socket);

    const eventsSet = socketEventsHandler.events;
    const hookedEvents = [`$${eventsSet.playerDisconnectedEvent}`, `$${eventsSet.pairRequestEvent}`,
      `$${eventsSet.playerEndGameEvent}`, `$${eventsSet.playerLeaveEvent}`];

    assert.deepStrictEqual(Object.keys(socket._callbacks), hookedEvents);

    const playerInfo = await gameCache.getPlayerInfo(123);
    assert.deepStrictEqual(playerInfo, {ready: false, room: false, user_id: 123, username: 'testak'});
  });

  it('should assign client a room when client issues a pair request ', function(done) {
    const socket = new SocketMock();
    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache);

    socket.disconnect = function(flag) {
      assert.fail('should not call disconnect for a valid client');
    };
    socket.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };
    socket.socketClient.on(socketEventsHandler.events.newPlayerEvent, async function(message){
      const expectedMessage = {
        all_players: [
          {
            ready: false,
            room: 'room#0',
            user_id: 123,
            username: 'testak',
          },
        ],
        user_id: 123,
        username: 'testak',
      };
      assert.deepStrictEqual(message, expectedMessage);

      const playerInfo = await gameCache.getPlayerInfo(123);
      assert.deepStrictEqual(playerInfo, {ready: false, room: 'room#0', user_id: 123, username: 'testak'});

      const players = await gameCache.getCurrentPlayersInRoom('room#0');
      assert.deepStrictEqual(players, ['123']);
      done();
    });

    socket.handshake = {query: {username: 'testak', token: 'some_token'}};
    socket.client = {id: 123};

    socketEventsHandler.handleConnect(socket);

    socket.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});
  });

  it('should start the game when max game players reached ', function(done) {
    const socket = new SocketMock();
    const socket2 = new SocketMock();

    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache, 2);

    socket.disconnect = function(flag) {
      assert.fail('should not call disconnect for a valid client');
    };

    socket.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };

    socket2.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };

    const messageSequence = [
      {
        user_id: 300,
        username: 'testak22',
        all_players: [
          {
            username: 'testak22',
            user_id: 300,
            room: 'room#0',
            ready: false,
          },
          { username: 'testak', user_id: 200, room: 'room#0', ready: false },
        ],
      },
      {
        user_id: 200,
        username: 'testak',
        all_players: [
          { username: 'testak', user_id: 200, room: 'room#0', ready: false },
        ],
      },
    ];

    socket.socketClient.on(socketEventsHandler.events.newPlayerEvent, async function(message){
      assert.deepStrictEqual(messageSequence.pop(), message);
    });

    socket.socketClient.on(socketEventsHandler.events.gameStartedEvent, async function(){
      done();
    });

    socket.handshake = {query: {username: 'testak', token: 'some_token'}};
    socket.client = {id: 200};
    socketEventsHandler.handleConnect(socket);
    socket.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});

    socket2.handshake = {query: {username: 'testak22', token: 'some_token'}};
    socket2.client = {id: 300};
    socketEventsHandler.handleConnect(socket2);
    socket2.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});

  });
  it('should announce player leaving to everyone in the room and remove him from room list', function(done) {
    const socket = new SocketMock();
    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache);

    socket.disconnect = function(flag) {
      assert.fail('should not call disconnect for a valid client');
    };
    socket.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };

    socket.socketClient.on(socketEventsHandler.events.newPlayerEvent, async function(message){
      assert.deepStrictEqual({
        user_id: 200,
        username: 'testak',
        all_players: [
          { username: 'testak', user_id: 200, room: 'room#0', ready: false },
        ],
      }, message);
      assert.deepStrictEqual(['room#0'], socket.rooms);
      socket.socketClient.emit(socketEventsHandler.events.playerLeaveEvent, {});
    });

    socket.socketClient.on(socketEventsHandler.events.leaveEvent, async function(message){
      assert.deepStrictEqual({user_id: 200, username: 'testak'}, message);
      assert.deepStrictEqual(socket.rooms, []);
      assert.strictEqual(await gameCache.getCurrentPlayersCountInRoom(), 0);
      assert.deepStrictEqual(await gameCache.getCurrentPlayersInRoom(), []);
      done();
    });

    socket.handshake = {query: {username: 'testak', token: 'some_token'}};
    socket.client = {id: 200};
    socketEventsHandler.handleConnect(socket);
    socket.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});
  });


  it('should delete user from cache if disconnected', function(done) {
    const socket = new SocketMock();
    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache);

    socket.disconnect = function(flag) {
      assert.fail('should not call disconnect for a valid client');
    };
    socket.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };

    socket.socketClient.on(socketEventsHandler.events.newPlayerEvent, async function(message){
      assert.deepStrictEqual({
        user_id: 200,
        username: 'testak',
        all_players: [
          { username: 'testak', user_id: 200, room: 'room#0', ready: false },
        ],
      }, message);
      assert.deepStrictEqual(['room#0'], socket.rooms);
      socket.socketClient.emit(socketEventsHandler.events.playerDisconnectedEvent, {});
    });

    socket.socketClient.on(socketEventsHandler.events.leaveEvent, async function(message){
      assert.deepStrictEqual({user_id: 200, username: 'testak'}, message);
      assert.deepStrictEqual(socket.rooms, []);
      assert.strictEqual(await gameCache.getCurrentPlayersCountInRoom(), 0);
      assert.deepStrictEqual(await gameCache.getCurrentPlayersInRoom(), []);
      assert.deepStrictEqual(await gameCache.getPlayerInfo(200), null);
      done();
    });

    socket.handshake = {query: {username: 'testak', token: 'some_token'}};
    socket.client = {id: 200};
    socketEventsHandler.handleConnect(socket);
    socket.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});
  });


  it('should send end game event when game is done ', function(done) {
    const socket = new SocketMock();
    const socket2 = new SocketMock();

    const gameCache = new GameCache(redisMock);
    const socketEventsHandler = new SocketEventsHandler(gameCache, 2);

    socket.disconnect = function(flag) {
      assert.fail('should not call disconnect for a valid client');
    };

    socket.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };

    socket2.to = function(room) {
      assert.equal('room#0', room);
      return socket;
    };

    socket.socketClient.on(socketEventsHandler.events.gameEndedEvent, async function(){
      done();
    });
    socket.socketClient.on(socketEventsHandler.events.gameStartedEvent, async function(){
      socket.socketClient.emit(socketEventsHandler.events.playerEndGameEvent, {});
    });

    socket.handshake = {query: {username: 'testak', token: 'some_token'}};
    socket.client = {id: 200};
    socketEventsHandler.handleConnect(socket);
    socket.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});

    socket2.handshake = {query: {username: 'testak22', token: 'some_token'}};
    socket2.client = {id: 300};
    socketEventsHandler.handleConnect(socket2);
    socket2.socketClient.emit(socketEventsHandler.events.pairRequestEvent, {});

  });
});
