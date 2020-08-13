// API docs:
// https://bitbucketjs.netlify.com/
// https://developer.atlassian.com/bitbucket/api/2/reference/

const { Bitbucket } = require('bitbucket')
const Configstore = require('configstore');
const pkg         = require('../package.json');
const CLI         = require('clui');
const chalk       = require('chalk');
const inquirer    = require('./inquirer');
const debug = require('debug')('bitbucket')
const btoa = require('btoa-lite')

const axios = require('axios')
const fs = require("fs");
const util = require('./util');
const tmp         = require('tmp');
const extract = require('extract-zip')

const conf = new Configstore(pkg.name);

const bitbucket = new Bitbucket()

module.exports = {
  creds: {},

  getInstance: () => {
    return bitbucket;
  },

  getCreds: async () => {
    // Fetch token from config store
    let creds=conf.get('bitbucket.creds');
    if(creds) {
      return creds;
    }
    creds = await inquirer.askBitbucketCredentials();
    conf.set('bitbucket.creds', creds);
    return creds
  },

  authenticate : (creds) => {
    module.exports.creds=creds
    bitbucket.authenticate({
      type : 'apppassword',
      username : creds.username,
      password : creds.password
    });
  },

  paginate: async (method, opts = {}) => {
    let response = await method(opts);
    let {values} = response.data;
    // console.log("Has next:"+bitbucket.hasNextPage(response.data))
    while (bitbucket.hasNextPage(response.data)) {
      // console.log(" > Has next:"+bitbucket.hasNextPage(response.data))
      // console.log(" > Paging "+method.name)
      // console.log(response.data)
      response = await bitbucket.getNextPage(response.data);
      values = values.concat(response.data.values);
    }
    return values;
  },

  getRepos : async () => {
    // debug("Getting repos for "+module.exports.creds.username)
    let repos = await module.exports.paginate(bitbucket.repositories.list,{username:module.exports.creds.username});
    // postprocess to match GitHub
    for (d of repos){
      // console.log(d.mainbranch)
      d.default_branch=d.mainbranch.name
      d.private=d.is_private
    }
    return repos;
  },

  gtree:[],
  tmpdir:{},

  getTree : async (reponame,branch,path) => {
    // getarchivelink takes a while so start displaying progress now
    // console.log('Downloading '+repo+' '+branch+', please wait...');
    // const downloadlinks = await bitbucket.downloads.list({username:creds.username, repo_slug:repo})
    // console.log(downloadlinks.data)

    // curl -L -H "Authorization: Bearer {$ACCESS_TOKEN}" https://bitbucket.org/{username}/{repo}/get/master.tar.gz

    let tmpname = tmp.tmpNameSync();
    const progress=new CLI.Progress(40)
    let currentLength=0
    // async/await version of the streaming download with axios.
    // https://futurestud.io/tutorials/download-files-images-with-axios-in-node-js
    // onDownloadProgress only works in the browser - https://github.com/axios/axios/issues/928
    zipfiledownloader=async () => {
      let response= await axios.get(`https://bitbucket.org/${module.exports.creds.username}/${reponame}/get/${branch}.zip`,{
        headers: { Authorization: 'Basic '+btoa(`${module.exports.creds.username}:${module.exports.creds.password}`) },
        responseType: 'stream',
        // onDownloadProgress: (progressEvent) => {
        //   const totalLength = progressEvent.lengthComputable ? progressEvent.total : progressEvent.target.getResponseHeader('content-length') || progressEvent.target.getResponseHeader('x-decompressed-content-length');
        //   console.log("onDownloadProgress", totalLength);
        //   if (totalLength !== null) {
        //     // progress.update(Math.round( (progressEvent.loaded * 100) / totalLength ),totalLength);
        //     process.stdout.write('\rDownloading '+tmpname+" : "+progress.update(progressEvent.loaded,totalLength));
        //   }
        // }
      })
      response.data.pipe(fs.createWriteStream(tmpname));
      // console.log(response.data)
      // console.log(response.data.headers['content-length'])
      // console.log(response.status)
      // console.log(response.headers['content-length'])
      // return a promise and resolve when download finishes
      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          currentLength+=chunk.length
          process.stdout.write('\rDownloading '+reponame+' '+branch+" zip : "+progress.update(currentLength,response.headers['content-length']));
         })
        response.data.on('end', () => {
          process.stdout.write('\n')
          resolve() })
        response.data.on('error', () => { reject() })
      })
    }
    await zipfiledownloader()

    module.exports.tmpdir=tmp.dirSync();
    // console.log(tree)
    let extractSync=util.promisify(extract)
    // console.log('Extracting '+tmpname+' to '+tmpdir.name+', please wait...')
    // an error here will cause cause the temp file and the temp folder to remain
    await extractSync(tmpname, {dir: module.exports.tmpdir.name})
    fs.unlink(tmpname,()=>{}); // or fs.unlinkSync(tmpname)

    tree=util.promisify(util.walk)(module.exports.tmpdir.name)

    // repo.default_branch=tmpdir // override with the disk location
    return tree
  },

  // there is a an internal API (discovered with ff dev tools) at https://bitbucket.org/!api/internal/repositories/[user]/apexapp/tree/
  // that returns the full tree but it does not work with apppasswords. Otherwise you can pull it like this:
  //
  // let { data, headers } = await bitbucket.repositories.listCommits({username:creds.username,repo_slug:repo})
  // let url = 'https://bitbucket.org/!api/internal/repositories/'+creds.username+'/'+repo+'/tree/'+data.values[0].hash
  // let requestOptions = { url,_paramGroups:{ body: [], path: [], query: [] } }
  // let tree = await bitbucket.request(requestOptions)
  // console.log(tree)

  // slow recursive walkthrough with the public api
  getTreeWithAPI : async (reponame,branch) => {
    // console.log(owner+":"+repo+":"+branch)
    if (path=='/')
      module.exports.gtree=[] // initialize for each new tree

    const listing = await module.exports.paginate(bitbucket.repositories.getSrc,{username:module.exports.creds.username, node:branch,path:path,repo_slug:reponame});
    // ,format:'meta'
    // console.log(listing)
    for (b of listing) {
      if (b.type=='commit_directory'){
        // console.log("Dropping to "+b.path)
        // console.log(b)
        module.exports.gtree.push({path:b.path,type:'tree'})
        await module.exports.getTree(reponame,branch,b.path)
      } else if (b.type=='commit_file'){
        // console.log("Adding "+b.path+" of "+b.type)
        // console.log(b)
        module.exports.gtree.push({path:b.path,type:'blob'})
      }
    }
    //,format:'meta'
    // console.log(b)
    // paginate otherwise the tree.tree is async
    return module.exports.gtree;
  },

  getRawContent : async (reponame,branch,path) => {
    return {data:fs.readFileSync(path,"utf8")}
  },

  getRawContentWithAPI : async (reponame,branch,path) => {
    // https://developer.atlassian.com/bitbucket/api/2/reference/resource/repositories/%7Busername%7D/%7Brepo_slug%7D/src/%7Bnode%7D/%7Bpath%7D
    const result = await bitbucket.repositories.getSrc({username:module.exports.creds.username, node:branch,path:path,repo_slug:reponame})
    return result
  },
  cleanup : () => {
    // console.log('Recursive delete of '+module.exports.tmpdir.name)
    util.deleteFolderRecursive(module.exports.tmpdir.name) // do this asyncly
   }
};
