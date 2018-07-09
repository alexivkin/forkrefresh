function SSESocket(req, res) {
    req.socket.setTimeout(0); // 500000

    this.res = res;
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    this.res.write('\n');

    this.counter = 0;

    this.emit = (eventType, data) => {
      this.counter++;
      this.res.write('id: ' + this.counter + '\n');
      this.res.write('event: ' + eventType + '\n');
      this.res.write('data: ' + JSON.stringify(data) + '\n\n');
    }
  }

module.exports = SSESocket
