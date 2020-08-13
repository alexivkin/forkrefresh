const fs = require("fs");
const path = require('path')
const debug = require('debug')('util')


module.exports = {

  walk: (dir, done) => {
    debug("walking "+dir)
    var results = [];
    fs.readdir(dir, function(err, list) {
      if (err) return done(err);
      var pending = list.length;
      if (!pending) return done(null, results);
      list.forEach(function(file) {
        file = path.resolve(dir, file);
        fs.stat(file, function(err, stat) {
          if (stat && stat.isDirectory()) {
            module.exports.walk(file, function(err, res) {
              results = results.concat(res);
              if (!--pending) done(null, results);
            });
          } else {
            results.push({path:file,type:'blob'});
            if (!--pending) done(null, results);
          }
        });
      });
    });
  },

  promisify: (api) => {
    return function(...args) {
      return new Promise(function(resolve, reject) {
        api(...args, function(err, response) {
          if (err) return reject(err);
          resolve(response);
        });
      });
    };
  },

  deleteFolderRecursive: (path) => {
    debug("deleting "+path)
    if(fs.existsSync(path))  {
      fs.readdirSync(path).forEach(function(file,index){
        var curPath = path + "/" + file;
        try {
          if(fs.lstatSync(curPath).isDirectory()) {  // handle symlinks links as files via lstat
            module.exports.deleteFolderRecursive(curPath); // recurse
          } else { // delete file
            fs.unlinkSync(curPath);
          }
        } catch (err) {
          // just ignore
        }
      });
      fs.rmdirSync(path);
    }
  }

};
