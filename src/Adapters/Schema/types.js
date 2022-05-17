import type { Schema } from '../../Controllers/types';
import { SchemaData } from '../../Schema/SchemaData';

export type SchemaAndData = {
  allClasses: Array<Schema>,
  schemaData: SchemaData,
};
