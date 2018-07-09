# Forkrefresh

Bring git forks in sync with the original repositories. This is a full stack app. It could be done as a client-only single page app, but handling the GitHub OAuth SPA flow and API pagination may get tricky on the client only.

## Running natively

1. Install NodeJS 10.5+
2. Clone this repository
3. Run `npm install`
4. Register the app with the OAuth provider (see "configuring authentication")
5. Now run it as `node server.js`

## Configuring authentication

It uses the full flow OAuth2. You will need to register your app on the server and then configure the app before you can login.
* GitHub - go to [new OAuth app](https://github.com/settings/applications/new), name the app, point the callback to http://yourhost:port/gh/callback. No need to specify permissions scopes as they are handled at the access time. Copy key and secret and then set GH_OAUTH2_ID and GH_OAUTH2_SECRET environment variables and run CxLoC so it can store them. With docker you can do it using the docker `-e` option.
* Bitbucket - go to [new OAuth consumer](https://bitbucket.org/account/user/cxai/oauth-consumers/new). Give read permissions to the account and the repositories. Point the callback to http://yourhost:port/bb/callback. Copy key and secret and then set BB_OAUTH2_ID and BB_OAUTH2_SECRET environment variables and run CxLoC so it can store them

Authentication details are saved in the configstore, so you only need to do it once. To reset authentication simply remove `.config/configstore`.

## Notes
* MS Edge is not supported until it gains SSE
* Tested against [GitHub API v3](https://developer.github.com/v3/)

## References
* [Similar app as SPA](https://github.com/upriver/upriver.github.io) and its [GitHub login proxy](https://github.com/prose/gatekeeper)
