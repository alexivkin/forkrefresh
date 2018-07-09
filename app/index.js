const express = require('express')
const path = require('path')
const ctl = require('./controller.js')
const session = require('express-session');
const configstore = require('configstore');
const fs = require("fs");
const pkg = require('../package.json');

const app = express() //.Router()
const MemoryStore = require('memorystore')(session)
const conf = new configstore(pkg.name);

if (process.env.GH_OAUTH2_ID && process.env.GH_OAUTH2_SECRET) // for heroku deployment and the like
    conf.set('github.oauth2',{id:process.env.GH_OAUTH2_ID, secret:process.env.GH_OAUTH2_SECRET})

if (process.env.BB_OAUTH2_ID && process.env.BB_OAUTH2_SECRET) // for heroku deployment and the like
    conf.set('bitbucket.oauth2',{id:process.env.BB_OAUTH2_ID, secret:process.env.BB_OAUTH2_SECRET})

  // process.env.SERVER_API_URL would contain the custome server API url. Passed from the cli.js as an env variable

app.use(session({
    store: new MemoryStore({ checkPeriod: 86400000 }),// prune expired entries every 24h
    secret: process.env.SESSION_SECRET || 'somenotsosecretkey',
    // todo: secure cookie for production https://www.npmjs.com/package/express-session#compatible-session-stores
    resave: true, // might actually need false.
    saveUninitialized: true
}))

app.get('/', ctl.Root)
app.use(express.static(path.join(__dirname, '../public'))) // dynamic content - during development and between version changes { maxAge: 31557600000, index : false }
app.get('/:eng/auth', ctl.OAuthStart)
app.get('/:eng/callback', ctl.OAuthCallback)
app.get('/:eng/:user', ctl.Main)
app.get('/:eng/:user/repos', ctl.GetRepos)
app.get('/:eng/:user/:repo/:branch/:sha/sync', ctl.SyncRepo)
app.get('/signout', ctl.SignOut)

module.exports = app;
