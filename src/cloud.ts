/**
 * Standalone entry point for cloud code SDKs.
 *
 * Import from 'parse-server/cloud' in cloud code files to avoid
 * circular dependencies with the main 'parse-server' entry point.
 *
 *   import { CloudCodeRegistrar, TriggerType, HookType } from 'parse-server/cloud';
 */

export { CloudCodeRegistrar, TriggerType, HookType } from './cloud-code/CloudCodeRegistrar';
export type { RegistrarConfig } from './cloud-code/CloudCodeRegistrar';

export type {
  CloudRequestBase,
  QueryDescriptor,
  ObjectTriggerRequest,
  BeforeSaveResult,
  AfterTriggerResult,
  QueryTriggerRequest,
  BeforeFindResult,
  AfterFindRequest,
  AfterFindResult,
  FunctionRequest,
  JobRequest,
  FunctionHandler,
  JobHandler,
  ObjectTriggerHandler,
  QueryTriggerHandler,
  AfterFindHandler,
  TriggerHandler,
  TriggerHandlerMap,
  HookHandlerMap,
} from './cloud-code/types';
