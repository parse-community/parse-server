import ParseServer, { FileSystemAdapter } from 'parse-server';

async function server() {
  // $ExpectType ParseServer
  const parseServer = await ParseServer.startApp({});

  // $ExpectType void
  await parseServer.handleShutdown();

  // $ExpectType any
  parseServer.app;

  // $ExpectType any
  ParseServer.app({});

  // $ExpectType any
  ParseServer.promiseRouter({ appId: 'appId' });

  // $ExpectType ParseLiveQueryServer
  await ParseServer.createLiveQueryServer({}, {}, {});

  // $ExpectType any
  ParseServer.verifyServerUrl();

  // $ExpectError
  await ParseServer.startApp();

  // $ExpectError
  ParseServer.promiseRouter();

  // $ExpectError
  await ParseServer.createLiveQueryServer();

  // $ExpectType ParseServer
  const parseServer2 = new ParseServer({});

  // $ExpectType ParseServer
  await parseServer2.start();
}

function exports() {
  // $ExpectType any
  FileSystemAdapter;
}
