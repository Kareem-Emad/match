const Redis = require('ioredis');

const STAGED_ROOMS_QUEUE = 'STAGED_ROOMS_QUEUE';
const PLAYING_ROOMS_QUEUE = 'PLAYING_ROOMS_QUEUE';
const MAX_ROOM_NUM_USED = 'MAX_ROOM_NUM_USED';

class GameCache {
  constructor(redisClient){
    this.redisClient = redisClient || new Redis(process.env.REDIS_CONNECTION_URL);
  }
  /**
   * @function {createNewRoom}
   * @summary starts a new players room in redis cache
   * @returns {promise} resolves to a string which is the name of the new room
   */
  async createNewRoom(){
    // get the largest num used for a room already(largest + 1)
    const roomNum = parseInt(await this.redisClient.get(MAX_ROOM_NUM_USED), 10) || 0;
    const roomName = `room#${roomNum}`;

    await this.redisClient.multi()
      .lpush(STAGED_ROOMS_QUEUE, roomName)
      .hset(MAX_ROOM_NUM_USED, `${roomNum + 1}`)// increase the largest room num used num by 1
      .exec();

    return roomName;
  };
  /**
   * @function {getAllPlayingRooms}
   * @summary fetches all active rooms that already started the game from cache
   * @returns {promise} resolves to a array of room names
   */
  getAllPlayingRooms(){
    return this.redisClient.lrange(PLAYING_ROOMS_QUEUE, 0, -1);
  };
  /**
   * @function {getAllActiveRoom}
   * @summary fetches all active room names from cache
   * @returns {promise} resolves to a array of room names
   */
  getAllActiveRooms(){
    return this.redisClient.lrange(STAGED_ROOMS_QUEUE, 0, -1);
  };
  /**
   * @function {getCurrentPlayersInRoom}
   * @summary fetches list of all players who are actively participating in the room passed
   * @param roomName (string) name of redis queue for this room
   * @param fullData (boolean) if true gets all players info from cache in array
   * @returns {promise} resolves to an array of player ids
   */
  async getCurrentPlayersInRoom(roomName, fullData = false){
    const playerIDs = await this.redisClient.lrange(roomName, 0, -1);

    if (fullData){
      let query = this.redisClient.pipeline();
      for (const playerID of playerIDs) {
        query = query.get(playerID);
      }

      const players = await query.exec();
      return players.map(p => JSON.parse(p[1]));
    } else {
      return playerIDs;
    }
  };

  /**
   * @function {getCurrentPlayersCountInRoom}
   * @summary fetches count of all players who are actively participating in the room
   * @param roomName (string) name of redis queue for this room
   * @returns {promise} resolves to count of active players in room
   */
  getCurrentPlayersCountInRoom(roomName){
    return this.redisClient.llen(roomName);
  };

  /**
   * @function {joinRoom}
   * @summary adds a new player in the room
   * @param roomName (string) name of redis queue for this room
   * @param playerID (string) id of the player(could be socket client id)
   * @returns {promise} resolves to the status of the operation in redis
   */
  async joinRoom(roomName, playerID){
    const palyerInfo = await this.getPlayerInfo(playerID);
    palyerInfo.room = roomName;

    return await this.redisClient.multi()
      .lpush(roomName, playerID)
      .set(playerID, JSON.stringify(palyerInfo))
      .exec();
  };

  /**
   * @function {leaveRoom}
   * @summary removes a player from the room
   * @param roomName (string) name of redis queue for this room
   * @param playerID (string) id of the player(could be socket client id)
   * @returns {promise} resolves to the status of the operation in redis
   */
  leaveRoom(roomName, playerID){
    return this.redisClient.lrem(roomName, -1, playerID);
  };

  /**
   * @function {registerPlayer}
   * @summary maps player info to his connection id
   * @param playerID (string) id of the player(could be socket client id)
   * @param palyerInfo (json_object) info about the player(username, ...)
   * @returns {promise} resolves to the status of the operation in redis
   */
  registerPlayer(playerID, palyerInfo){
    return this.redisClient.set(playerID, JSON.stringify(palyerInfo));
  };

  /**
   * @function {deletePlayer}
   * @summary removes player from cache
   * @param playerID (string) id of the player(could be socket client id)
   * @returns {promise} resolves to the status of the operation in redis
   */
  async deletePlayer(playerID){
    const {room} = await this.getPlayerInfo(playerID);

    if (room) {
      await this.leaveRoom(room, playerID);
    }

    await this.redisClient.del(playerID);
    return room;
  };

  /**
   * @function {getPlayerInfo}
   * @summary gets player info by connnection id
   * @param playerID (string) id of the player(could be socket client id)
   * @returns {promise} resolves to a json object containing player info
  */
  async getPlayerInfo(playerID){
    return JSON.parse(await this.redisClient.get(playerID));
  };

  /**
   * @function {getAvaiableRoom}
   * @summary searches for a room that needs player to join, if not found creates a new one
   * @returns {promise} resolves to a string name of the room avaiable to join
  */
  async getAvaiableRoom(){
    const rooms = await this.redisClient.lrange(STAGED_ROOMS_QUEUE, 0, 0);

    if (rooms.length === 1) { // we are fetching one room, so that is the expected size
      return rooms[0];
    } else {
      return await this.createNewRoom();
    }
  }
  /**
   * @function {startGameInRoom}
   * @summary moves a room from staging to playing state
   * @param roomName (string) name of redis queue for this room
   * @returns {promise} resolves to the status of the operation in redis
  */
  startGameInRoom(roomName){
    return this.redisClient.multi()
      .lrem(STAGED_ROOMS_QUEUE, -1, roomName)
      .lpush(PLAYING_ROOMS_QUEUE, roomName)
      .exec();
  }

  /**
   * @function {startGameInRoom}
   * @summary moves a room from staging to playing state
   * @param roomName (string) name of redis queue for this room
   * @returns {promise} resolves to the status of the operation in redis
  */
  endGameInRoom(roomName){
    return this.redisClient.multi()
      .lrem(PLAYING_ROOMS_QUEUE, -1, roomName)
      .del(roomName)
      .exec();
  }
}
module.exports = {
  GameCache,
};
