const { SocketEventsHandler } = require('./socket-events/socket-events');

const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const socketEventHandler = new SocketEventsHandler();

const SERVER_PORT = process.env.SERVER_PORT || 5000;

io.on('connection', socketEventHandler.handleConnect);

http.listen(SERVER_PORT, () => {
  console.log(`listening on *:${SERVER_PORT}`);
});
