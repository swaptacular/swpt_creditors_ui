# UI for the Swaptacular service that manages creditors

This service implements a [Payments Web
API](https://epandurski.github.io/swaptacular/swpt_creditors/redoc.html)
client. The main deliverable is a docker image, generated from the
project's
[Dockerfile](https://github.com/epandurski/swpt_creditors_ui/blob/master/Dockerfile).
The generated image is a simple static web server (using nginx), which
uses the following environment variables for configuration (along with
some example values):

```
SERVER_API_ENTRYPOINT=https://demo.swaptacular.org/creditors/.wallet
SERVER_API_TIMEOUT=8000  # milliseconds
AUTHORIZATION_URL=https://demo.swaptacular.org/creditors-hydra/oauth2/auth
TOKEN_URL=https://demo.swaptacular.org/creditors-hydra/oauth2/token
CLIENT_ID=creditors-webapp
REDIRECT_URL=https://demo.swaptacular.org/creditors-webapp/
TRANSFER_DELETION_DELAY_SECONDS=1296000
DEBTOR_INFOS_REVISION_DAYS=7
```

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
