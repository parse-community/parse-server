// Intercept process.exit, so that our afterEach/afterAll hooks always run.

let processExit: (code?: number | undefined) => never;

beforeEach(() => {
  // Store the original process.exit
  processExit = process.exit;

  // Mock process.exit
  process.exit = jest.fn() as any as (code?: number | undefined) => never;
});

afterEach(() => {
  // Restore the original process.exit
  process.exit = processExit;
});

// Capture any unexpected network activity. Our tests should never be able to
// make network calls. Note that we capture unexpected http requests in the
// http interceptor.

jest.mock("net", () => ({
  ...jest.requireActual("net"),
  connect: () => {
    throw new Error(
      "Outbound network connections are blocked during preflight tests",
    );
  },
}));

jest.mock("tls", () => ({
  ...jest.requireActual("tls"),
  connect: () => {
    throw new Error(
      "Outbound tls connections are blocked during preflight tests",
    );
  },
}));

jest.mock("dgram", () => ({
  ...jest.requireActual("dgram"),
  createSocket: () => {
    throw new Error("Datagram sockets are blocked during preflight tests");
  },
}));

jest.mock("dns", () => ({
  ...jest.requireActual("dns"),
  resolve: () => {
    throw new Error(
      "Outbound dns connections are blocked during preflight tests",
    );
  },
}));

jest.mock("child_process", () => ({
  ...jest.requireActual("child_process"),
  spawn: () => {
    throw new Error("Child process calls are blocked during preflight tests");
  },
  fork: () => {
    throw new Error("Child process calls are blocked during preflight tests");
  },
  exec: () => {
    throw new Error("Child process calls are blocked during preflight tests");
  },
  execFile: () => {
    throw new Error("Child process calls are blocked during preflight tests");
  },
}));

export {};
