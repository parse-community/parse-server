const SQLiteStorageAdapter = require('./lib/Adapters/Storage/SQLite/SQLiteStorageAdapter').SQLiteStorageAdapter;
async function run() {
  const adapter = new SQLiteStorageAdapter({ uri: 'sqlite://:memory:', collectionPrefix: 'test_' });
  await adapter.performInitialization({ VolatileClassesSchemas: [] });
  
  const schema = { fields: { objectId: { type: 'String' }, file: { type: 'File' }, createdAt: { type: 'Date' } } };
  await adapter.createClass('TestObject', schema);
  
  const object = {
    objectId: "nAV1lUAbrk",
    file: { __type: "File", name: "f7e2a0aa2b5d550c86de656c9d05dc0b_hello.txt" },
    createdAt: { iso: "2026-07-06T12:52:45.124Z", __type: "Date" }
  };
  
  await adapter.createObject('TestObject', schema, object);
  console.log("Object created.");
  
  const findRes = await adapter.find('TestObject', schema, { objectId: "nAV1lUAbrk" }, {});
  console.log("Find by objectId result:", findRes);
  
  const allRes = await adapter.find('TestObject', schema, {}, {});
  console.log("Find all result:", allRes);
}
run().catch(console.error);
