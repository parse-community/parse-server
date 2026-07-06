# parse-server-sqlite-storage-adapter

This folder is a drop-in packaging of the SQLite storage adapter so it can live outside the Parse Server repo.

## Install in another Parse Server app

1. Copy this folder into your app, for example `vendor/parse-server-sqlite-storage-adapter`.
2. From the app root, install it so peer dependencies resolve from the host app:

```bash
npm install ./vendor/parse-server-sqlite-storage-adapter
```

3. Wire it into Parse Server:

```js
const { ParseServer } = require("parse-server");
const SQLiteStorageAdapter = require("./vendor/parse-server-sqlite-storage-adapter");

const api = new ParseServer({
  appId: "app",
  masterKey: "master",
  serverURL: "http://localhost:1337/parse",
  databaseAdapter: new SQLiteStorageAdapter({
    uri: "sqlite:///absolute/path/to/app.sqlite",
  }),
});
```

If you prefer Parse Server's adapter loader, this works too:

```js
const path = require("path");

const api = new ParseServer({
  appId: "app",
  masterKey: "master",
  serverURL: "http://localhost:1337/parse",
  databaseAdapter: {
    module: path.resolve(
      __dirname,
      "./vendor/parse-server-sqlite-storage-adapter"
    ),
    options: {
      uri: "sqlite:///absolute/path/to/app.sqlite",
    },
  },
});
```

If your own bootstrap code exposes a `setStorageAdapter()` helper, pass an instance of this class there. Parse Server itself uses the `databaseAdapter` option.

## Caveats

- This package depends on Parse Server internals under `parse-server/lib/...`, so keep it version-matched with the Parse Server build it came from.
- No Parse Server core patches are required. Class creation, schema changes, dashboard CRUD, and normal adapter calls still go through the adapter boundary.
