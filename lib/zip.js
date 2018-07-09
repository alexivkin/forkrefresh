// const Configstore = require('configstore');
const fs = require("fs");
const pkg         = require('../package.json');
const tmp         = require('tmp');
const util = require('./util');
const extract = require('extract-zip')
const path = require('path')
const CLI         = require('clui');
const chalk       = require('chalk');
const yauzl       = require('yauzl')

var zipfile;

module.exports = {
  // Stub
  getCreds : async () => { return },

  // verify that the file exists and is correct
  authenticate : (_,filename) => {
    if(!fs.existsSync(filename))
      throw new Error("No such zip: "+filename)
    zipfile=filename
    return
  },

  // unzip the file into the temp folder
  getRepos : async () => {
    let tmpdir=tmp.dirSync();
    // console.log("Extracting to "+tmpdir.name)
    let extractSync=util.promisify(extract)
    await extractSync(zipfile, {dir: tmpdir.name})
    return [{name:path.basename(zipfile,'.zip'),default_branch:tmpdir.name}]; // fake one repo
  },

  // https://developer.github.com/v3/git/trees/#get-a-tree
  getTree : async (repo,branch) => {
    // console.log(owner+":"+repo+":"+branch)
    return util.promisify(util.walk)(branch)
  },

  getRawContent : async (repo,branch,path) => {
    return {data:fs.readFileSync(path,"utf8")}
  },

  // remove the folder
  cleanup : (repo) => {
      // console.log("Removing "+repo.default_branch)
      util.deleteFolderRecursive(repo.default_branch) // do this asyncly
      // tmpobj.removeCallback();
  },

};
