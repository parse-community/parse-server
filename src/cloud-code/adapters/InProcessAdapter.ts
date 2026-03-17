import type {
  CloudCodeAdapter,
  CloudCodeRegistry,
  ParseServerConfig,
  InProcessCloudCode,
} from '../types';
import { requestToWebhookBody, webhookResponseToResult, applyBeforeSaveResponse } from './webhook-bridge';

export class InProcessAdapter implements CloudCodeAdapter {
  readonly name = 'in-process';
  private cloudCode: InProcessCloudCode;

  constructor(cloudCode: InProcessCloudCode) {
    this.cloudCode = cloudCode;
  }

  async initialize(registry: CloudCodeRegistry, _config: ParseServerConfig): Promise<void> {
    const router = this.cloudCode.getRouter();
    const manifest = router.getManifest();

    for (const fn of manifest.hooks.functions) {
      registry.defineFunction(fn.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await router.dispatchFunction(fn.name, body);
        return webhookResponseToResult(response);
      });
    }

    for (const trigger of manifest.hooks.triggers) {
      const { className, triggerName } = trigger;
      registry.defineTrigger(className, triggerName as any, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await router.dispatchTrigger(className, triggerName, body);
        if (triggerName === 'beforeSave') {
          if (request.object) {
            applyBeforeSaveResponse(request, response);
            return;
          }
          const result = webhookResponseToResult(response);
          if (result && typeof result === 'object' && Object.keys(result).length === 0) {
            return;
          }
          return result;
        }
        return webhookResponseToResult(response);
      });
    }

    for (const job of manifest.hooks.jobs) {
      registry.defineJob(job.name, async (request) => {
        const body = requestToWebhookBody(request);
        const response = await router.dispatchJob(job.name, body);
        return webhookResponseToResult(response);
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {}
}
