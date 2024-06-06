import { libraries } from "@detail-dev/replay";
import NodeEnvironment from "jest-environment-node";

class DetailEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();

    const workerId = process.env.JEST_WORKER_ID || "default";

    // This will create a polly instance if one doesn't exist for this worker.
    this.global.__HTTP_CALL_HOOKS__ =
      libraries.HttpInterceptor.getHttpHooks(workerId);
  }
}

export default DetailEnvironment;
