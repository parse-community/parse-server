/**
 * Standalone entry point for cloud code SDKs.
 *
 * Import from 'parse-server/cloud' in cloud code files to avoid
 * circular dependencies with the main 'parse-server' entry point.
 *
 *   import { TriggerStore, TriggerType, HookType } from 'parse-server/cloud';
 */

export { TriggerStore, TriggerType, HookType } from './cloud-code/TriggerStore';

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
  BeforeSaveObjectTriggerHandler,
  ObjectTriggerHandler,
  QueryTriggerHandler,
  AfterFindHandler,
  TriggerHandler,
  TriggerHandlerMap,
  HookHandlerMap,
} from './cloud-code/types';
