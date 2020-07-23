const pkg         = require('../package.json');
const configstore = require('configstore');
const sse = require('../lib/ssesocket')
const gh  = require('../lib/github');
const bb  = require('../lib/bitbucket');
const path = require('path')

const btoa = require('btoa-lite')
const qs = require('querystring');
const axios = require('axios')
const fs = require("fs");
const util = require('../lib/util');
const tmp         = require('tmp');
const extract = require('extract-zip')
// const streams = require('memory-streams');

const debug = require('debug')('controller')

// var qs = require('querystring');  qs.stringify( qs.parse

const conf = new configstore(pkg.name);
const ok = gh.getInstance();
const bi = bb.getInstance();

module.exports = {
  Root: (req, res) => {
    // if already logged in send to the appropriate repo list
    if (req.session.authed)
      res.redirect(`/${req.session.engine}/${req.session.user}`)
    else
      // if not just load index
      res.sendFile(path.resolve(__dirname + '/../public/index.html'));
  },

  // OAuth authentication
  // Github full web app flow OAuth -  https://developer.github.com/apps/building-oauth-apps/authorizing-oauth-apps/
  // Bitbucket full 3-LO flow - https://developer.atlassian.com/cloud/bitbucket/oauth-2/
  //          https://developer.atlassian.com/bitbucket/api/2/reference/meta/authentication
  OAuthStart: (req, res) => {
    let creds=(req.params.eng == 'gh') ? conf.get('github.oauth2') : conf.get('bitbucket.oauth2')
    if(creds && creds.id){
      // todo add state param to protect against CSRF
      if (req.params.eng == 'gh')
        res.redirect(`https://github.com/login/oauth/authorize?client_id=${creds.id}&scope=repo`)
      else {
        res.redirect(`https://bitbucket.org/site/oauth2/authorize?client_id=${creds.id}&response_type=code`)
      }
    } else {
      res.send('OAuth2 is not configured. Register the OAuth app and save the keys to '+conf.path +
      ' or set env GH_OAUTH2_ID, GH_OAUTH2_SECRET, BB_OAUTH2_ID, BB_OAUTH2_SECRET.')
    }
  },

  OAuthCallback: (req, res) => {
    if(!req.query.code){
      res.send('No OAuth2 code supplied for the callback: '+JSON.stringify(req.query))
      return
    }
    let creds=(req.params.eng == 'gh') ? conf.get('github.oauth2') : conf.get('bitbucket.oauth2')
    // todo check to make sure state param matches to protect against CSRF
    if(creds && creds.id && creds.secret) {
      if (req.params.eng == 'gh') {
        // exchange code for the token. sending as straight JSON, force a JSON return
        axios.post('https://github.com/login/oauth/access_token',{
          client_id: creds.id,
          client_secret: creds.secret,
          code: req.query.code
        }, { headers: { Accept: 'application/json' } }).then(rr => {
          // debug(rr)
          if (rr.data.error){
            res.send('OAuth2 error: '+rr.data.error_description)
            return
          }
          // inject auth
          ok.hook.wrap("request",(f, request)=>{
    			request.headers.authorization = `bearer ${rr.data.access_token}`;
    			return f(request);
    		})

          //ok.auth({ type:'token',tokenType:'oauth',token: rr.data.access_token }).then(ress=>{
          ok.users.getAuthenticated().then(result => {
            debug(result)
            req.session.authed=true
            req.session.engine="gh"
            req.session.user=result.data.login
            req.session.access_token=rr.data.access_token
            req.session.repostats={} // init
            // also have data.scope and data.token_type
            res.redirect('/gh/'+req.session.user)
          }).catch(err => {
            res.send('OAuth fine, but no cigar on the user: '+err)
            debug(err.stack)
          })
          //}).catch(err => {
          //  res.send('OAuth errored out: '+err)
          //})
        }).catch(err => {
          res.send('Cant get the OAuth code: '+err)
        })
      } else {
        // https://developer.atlassian.com/cloud/bitbucket/oauth-2/
        axios.post('https://bitbucket.org/site/oauth2/access_token',qs.stringify({
          grant_type: 'authorization_code',
          code: req.query.code
        }), { headers: {
          Authorization: 'Basic '+btoa(`${creds.id}:${creds.secret}`),
          Accept: 'application/json' }
         }).then((rr) => {
           // debug(rr)
           if (rr.data.error){
             res.send('OAuth2 error: '+rr.data.error_description)
             return
           }
           bi.authenticate({ type : 'oauth', token : rr.data.access_token });  // does nothing but sets internal state
           axios.get('https://api.bitbucket.org/2.0/user', { headers: { Authorization: `Bearer ${rr.data.access_token}` } })
           .then(result => {
               // debug(result)
               req.session.authed=true
               req.session.engine="bb"
               req.session.user=result.data.username
               req.session.access_token=rr.data.access_token // 1hr lifetime
               // https://developer.atlassian.com/cloud/bitbucket/oauth-2/
               req.session.refresh_token=rr.data.refresh_token // this thing can be exchanged for another access token if it expires
               req.session.repostats={} // init
               // also come data.scopes, data.expires_in, data.token_type
               bb.creds.username = result.data.username

               res.redirect('/bb/'+req.session.user)
             }).catch(err => {
               res.send('OAuth fine, but no cigar on the user: '+err+", "+err.response)
             })
            }).catch(err => {
             res.send('Cant get the OAuth code: '+err)
           })
         }
    } else {
      debug('OAuth2 is not configured. Set it in '+conf.path)
      res.send('OAuth2 is not configured. Set it in '+conf.path)
    }
  },

  Main: (req , res) => {
    if (!req.session.authed){
      res.redirect(req.baseUrl + '/')
    } else
      res.sendFile(path.resolve(__dirname + '/../public/repos.html'));
  },

  GetRepos: (req, res, next) => {
    var socket = new sse(req, res);
    let engine= req.params.eng == 'gh' ? gh : bb
    // first push the repos, then push the repo status
    engine.getRepos().then(async repos => {
      debug("in")
      try {
        // send the repos
        socket.emit("repos", repos)

        let promises=[]
        // now grab the status asyncly
        for(r of repos){
          if (!r.fork) {
            socket.emit("stats",{name:r.name,fork:r.fork})
          } else {
            // debug("fork"+r.name)
            // store promises to keep track later
            p = engine.getRepo(r.owner.login,r.name).then(async res => {
              try {
                // get the basics goign
                let ret={name:res.data.name,updated_at:res.data.updated_at,fork:true,default_branch:res.data.default_branch}
                // now grab commits for the main
                // debug(res.data.owner.login,res.data.name)

                // To get accurate results We should get all and compare all, but getting all commits takes a while.
                // let fc = await engine.getAllCommits(res.data.owner.login,res.data.name,res.data.default_branch)
                // let forkc=fc.reduce((a,v) => {
                //   a[v.sha] = v.commit.committer.date
                //   return a
                // },{})
                // let sc = await engine.getAllCommits(res.data.parent.owner.login,res.data.parent.name,res.data.parent.default_branch)
                // let sourcec=sc.reduce((a,v) => {
                //   a[v.sha] = v.commit.committer.date
                //   return a
                // },{})
                // ret.ahead = Object.keys(forkc).filter((x)=>!(x in sourcec)).length
                // ret.behind = Object.keys(sourcec).filter((x)=>!(x in forkc)).length

                // we could instead exploit the fact that they are in a reverse chronological border
                // but only for the first 100
                ret.compare_window=100 // beyond that window we can't tell if forks sync
                let fc = await engine.getLastCommits(res.data.owner.login,res.data.name,res.data.default_branch,ret.compare_window)
                let sc = await engine.getLastCommits(res.data.parent.owner.login,res.data.parent.name,res.data.parent.default_branch,ret.compare_window)
                // convert to a hashmap for easier lookup
                let sourcec=sc.reduce((a,v,i) => {
                  a.set(v.sha,i)
                  return a
                },new Map())
                ret.ahead=0
                ret.behind=0
                for (f of fc){
                  if (sourcec.has(f.sha)){
                    ret.behind=sourcec.get(f.sha)
                    break
                  }
                  ret.ahead++
                }
                if (ret.ahead == ret.compare_window)
                  ret.ahead =-1
                //https://octokit.github.io/rest.js/#api-Gitdata-updateReference
                // const result = await octokit.gitdata.updateReference({owner, repo, ref, sha, force})
                ret.source={     // send just the data, the view will render it
                  owner:res.data.parent.owner.login,
                  name:res.data.parent.name,
                  default_branch:res.data.parent.default_branch,
                  updated_at:res.data.parent.updated_at,
                  sha:sc[0].sha // latest commit to the source
                  // root:res.data.source.full_name || "", // the very source of the fork list
                  // commits:Array.from(sc.data, x => (x.sha || "nosha"))
                }
                socket.emit("stats",ret)
              } catch (e){
                debug(e)
              }
              // return r
            }).catch(e => {
              debug("err"+r.name+e)
              socket.emit("stats","Reponope "+e)
              // return "RepoNope: "+JSON.stringify(e)+" for "+r.name
            })
            promises.push(p)
          }
        }
        await Promise.all(promises)
        socket.emit("stats","zeend")
      } catch (e){
        debug(e)
      }
    }).catch (err => {
        socket.emit("repos", "Nope: "+JSON.stringify(err))
    })
    // next()
    // res.sendStatus(200)
  },

  PullRepoStats: (r) => {
    debug("calling on"+r.name)
  },

  SyncRepo: async (req, res, next) => {
    // no real need  to do this over sockets
    var socket = new sse(req, res);
    let engine= req.params.eng == 'gh' ? gh : bb
    debug(`Sync requested for ${req.params.user}/${req.params.repo}/${req.params.branch} to ${req.params.sha}`)
    try {
      await engine.fastForward(req.params.user,req.params.repo,req.params.branch,req.params.sha)
    } catch (err) {
      debug(err)
      //socket.emit("sync",err)
    }
    socket.emit("sync","zeend")
  },

  SignOut: (req, res) => {
    //ok.authenticate({ type : 'oauth', token : "0" }); // invalidate the header
    //bi.authenticate({ type : 'oauth', token : "0" }); // invalidate the header
    req.session.destroy() // ()=>{}
    res.redirect(req.baseUrl + '/')
  }

}
