const fs = require("fs");
const path = require('path')
const debug = require('debug')('util')


module.exports = {

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

};
