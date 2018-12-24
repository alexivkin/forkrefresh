// serve and watch for changes under ./app/

// https://github.com/glenjamin/ultimate-hot-reloading-example/
// https://codeburst.io/dont-use-nodemon-there-are-better-ways-fc016b50b45e
// https://blog.cloudboost.io/reloading-the-express-server-without-nodemon-e7fa69294a96
const chalk  = require('chalk');
const figlet = require('figlet');
const fs = require("fs");
const path = require('path')

const debug = require('debug')('server')

var express = require('express')
var app = express()

const default_port=8080

debug("Running in "+process.env.NODE_ENV)
var production = process.env.NODE_ENV === 'production'

if(!production) {
  var chokidar = require('chokidar')
  var watcher = chokidar.watch(['./app','./lib'])

  watcher.on('ready', ()=>{
    watcher.on('all', (e,p)=> {
      // console.log(e, __dirname + '/'+p)
      // var x = __dirname + '/'+p
      // delete require.cache[__dirname + '/'+p]
      // clear all cache
      Object.keys(require.cache).forEach((id) => {
        if (id.startsWith(path.join(__dirname, 'app')) || id.startsWith(path.join(__dirname, 'lib')) || id == path.join(__dirname, 'server.js')){
          // debug("Clearing "+id+" module from the server cache")
          delete require.cache[id]
        }
      })
    })
  })
}

let port = process.env.PORT || default_port

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.send(200);
    }
    else {
      next();
    }
};

//app.use(allowCrossDomain)

// app/index.js is the actual router
app.use(function (req, res, next) {
  require('./app/index')(req, res, next)
})

const server=app.listen(port, () => {
  console.log("\n"+chalk.yellow(figlet.textSync('Serving on '+port, { font:'Shimrod', horizontalLayout: 'full' })));// Kban, Jazmine is good too
  }).on('error', (err) => {
    (err.code == 'EADDRINUSE')?console.log("\n"+chalk.red(`Port ${port} is in use`)):console.log("\n"+chalk.red(`Network error: ${err}`))
    process.exit(1)
  })
