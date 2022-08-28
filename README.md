# Swaptacular "Currency Holder UI" reference implementation

This project implements a [Payments Web
API](https://swaptacular.github.io/public/docs/swpt_creditors/redoc.html)
client for [Swaptacular]. The main deliverable is a [docker image],
generated from the project's [Dockerfile](../master/Dockerfile). The
generated image is a simple static web server, which serves a
[Progressive Web App].

To obtain permissions to act on behalf of the user, the Web App
performs [OAuth 2.0 Authorization Code Flow] with Proof Key for Code
Exchange (PKCE), which is specifically designed for clients that
cannot securely store a client secret, because their entire source is
available to the browser.


## Configuration

The behavior of the running container can be tuned with environment
variables. Here are the most important settings with some random
example values:

```shell
# An URL pointing to the "Redirect to the creditor's wallet"
# entrypoint on the server. (See the "Payments Web API"
# specification.)
SERVER_API_ENTRYPOINT=https://demo.swaptacular.org/creditors/.wallet

# OAuth 2.0 Authorization Code Flow parameters.
AUTHORIZATION_URL=https://demo.swaptacular.org/oauth2/auth
TOKEN_URL=https://demo.swaptacular.org/oauth2/token
CLIENT_ID=creditors-webapp

# This is the starting URL for the Web App, and it must exactly match
# the "redirect URL" that has been configured for the client with the
# given CLIENT_ID.
REDIRECT_URL=https://demo.swaptacular.org/creditors-webapp/
```

For more configuration options, check the
[app-config.env](../master/app-config.env) file.


## How to setup a development environment

*Note that you will need to have [Node.js](https://nodejs.org)
installed.*

Install the dependencies...

```bash
cd swpt_creditors_ui
npm install
```

...then start [Vite](https://vitejs.dev):

```bash
npm run dev
```

Navigate to [localhost:5000](http://localhost:5000). You should see
your app running. Edit a component file in `src`, save it, and reload
the page to see your changes.

By default, the server will only respond to requests from
localhost. To allow connections from other computers, edit the `dev`
command in package.json to include the option `--host 0.0.0.0`.

If you're using [Visual Studio Code](https://code.visualstudio.com/)
we recommend installing the official extension [Svelte for VS
Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode). If
you are using other editors you may need to install a plugin in order
to get syntax highlighting and intellisense.


## Building and running in production mode

To create an optimised version of the app:

```bash
npm run build
```

You can run the newly built app with `npm run serve`.



[Swaptacular]: https://swaptacular.github.io/overview
[docker image]: https://www.geeksforgeeks.org/what-is-docker-images/
[Progressive Web App]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
[OAuth 2.0 Authorization Code Flow]: https://developer.okta.com/blog/2018/04/10/oauth-authorization-code-grant-type
