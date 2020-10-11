const assert = require('assert');
const Redis = require('ioredis-mock');

const { describe, it} = require('mocha');

const { GameCache } = require('../cache');


const redisMock = new Redis();


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
