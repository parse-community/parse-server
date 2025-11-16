# Bug Report: Race Condition in Parse Server Schema Management

## Summary
Parse Server has a race condition in its schema creation/update mechanism that causes duplicate key errors when multiple concurrent requests try to create or update the same schema simultaneously. This issue is exposed when database operations have artificial latency or under high load conditions.

## How to Reproduce

1. Set up Parse Server with MongoDB
2. Add 100ms artificial latency to MongoDB operations (simulating network latency or slow DB)
3. Run concurrent `Parse.Object.saveAll()` operations that create new object classes
4. Observe `E11000 duplicate key error` on `_SCHEMA` collection

Example code that triggers the bug:
```javascript
// With 100ms DB latency applied
const Level2Class = Parse.Object.extend('Level2');
const objects = [];
for (let i = 0; i < 10; i++) {
  objects.push(new Level2Class().set('name', `object-${i}`));
}
await Parse.Object.saveAll(objects); // Throws duplicate key error
```

## Root Cause Analysis

### The Problem Flow:

1. **`Parse.Object.saveAll()`** sends 10 save operations in parallel
2. Each object save triggers schema creation/update for the class
3. All 10 operations try to update `_SCHEMA` collection simultaneously for `_id: "Level2"`
4. **Race condition**: Multiple `updateOne` operations execute concurrently
5. MongoDB throws `E11000 duplicate key error`

### Why It Happens:

**Without latency (works):**
- First object's schema update completes in ~10ms
- Remaining objects see schema exists, no conflict
- Total time: ~20ms

**With 100ms latency (fails):**
- All 10 operations start schema update simultaneously
- Each waits 100ms before executing
- Multiple concurrent updates on same document ID
- Duplicate key error on upsert operation

### Code Location:

The bug is in `/src/Adapters/Storage/Mongo/MongoSchemaCollection.js`:

```javascript
// Line 197-199: No error handling for concurrent updates
updateSchema(name: string, update) {
  return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update);
}

// Line 201-203: Upsert can fail with E11000 on race conditions
upsertSchema(name: string, query: string, update) {
  return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update);
}
```

**Note:** `insertSchema()` at line 183-195 DOES handle duplicate key errors correctly:
```javascript
insertSchema(schema: any) {
  return this._collection
    .insertOne(schema)
    .then(() => mongoSchemaToParseSchema(schema))
    .catch(error => {
      if (error.code === 11000) {
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'Class already exists.');
      } else {
        throw error;
      }
    });
}
```

## Impact

This bug affects:
- **High-load production environments** with many concurrent requests
- **Slow database connections** (network latency, cross-region deployments)
- **Multi-instance Parse Server deployments** where multiple servers create schemas simultaneously
- **Initial app launches** when many classes are created at once

## Proposed Fix

### Option 1: Add Error Handling (Quick Fix)

Add duplicate key error handling to `updateSchema` and `upsertSchema`:

```javascript
updateSchema(name: string, update) {
  return this._collection.updateOne(_mongoSchemaQueryFromNameQuery(name), update)
    .catch(error => {
      if (error.code === 11000) {
        // Duplicate key error - schema already exists/updated, safe to ignore
        return;
      }
      throw error;
    });
}

upsertSchema(name: string, query: string, update) {
  return this._collection.upsertOne(_mongoSchemaQueryFromNameQuery(name, query), update)
    .catch(error => {
      if (error.code === 11000) {
        // Duplicate key error - schema already exists, safe to ignore
        return;
      }
      throw error;
    });
}
```

### Option 2: Use Proper MongoDB Upsert (Better Fix)

Ensure the underlying `updateOne` and `upsertOne` operations use MongoDB's `{upsert: true}` option correctly with proper conflict handling.

Check `/src/Adapters/Storage/Mongo/MongoCollection.js` line 169-174:
```javascript
upsertOne(query, update, session) {
  return this._mongoCollection.updateOne(query, update, {
    upsert: true,
    session,
  });
}
```

This should handle duplicates gracefully, but the error is still bubbling up. The fix needs to be in `MongoSchemaCollection.js`.

### Option 3: Schema Update Locking (Comprehensive Fix)

Implement a locking mechanism or queue for schema updates:

1. Maintain a `Map<className, Promise>` of pending schema operations
2. Before updating a schema, check if an operation is in progress
3. If yes, wait for it to complete
4. If no, start new operation and store promise
5. Clean up after completion

Example:
```javascript
class MongoSchemaCollection {
  _schemaUpdateLocks = new Map();

  async updateSchema(name: string, update) {
    // Check if update already in progress
    if (this._schemaUpdateLocks.has(name)) {
      await this._schemaUpdateLocks.get(name);
      return; // Operation completed by another caller
    }

    // Start new update
    const updatePromise = this._collection.updateOne(
      _mongoSchemaQueryFromNameQuery(name),
      update
    )
    .catch(error => {
      if (error.code === 11000) return; // Safe to ignore
      throw error;
    })
    .finally(() => {
      this._schemaUpdateLocks.delete(name);
    });

    this._schemaUpdateLocks.set(name, updatePromise);
    return updatePromise;
  }
}
```

## Recommended Solution

**Start with Option 1** (add error handling) as it's the safest, quickest fix that solves the immediate problem without changing behavior.

**Then consider Option 3** (locking) for a more robust long-term solution that prevents unnecessary duplicate operations.

## Testing

After fixing, verify with:

1. **Unit test:** Concurrent schema updates for same class
2. **Integration test:** Run the benchmark with 100ms latency - should complete without errors
3. **Load test:** Simulate 100 concurrent requests creating objects of same new class

### How to Test with Artificial Latency

Use the MongoDB latency wrapper in the benchmark suite:

```bash
# Run benchmark with artificial DB latency
npm run benchmark:quick

# The benchmark in performance.js uses dbLatency: 100
# to simulate slow database connections
```

The test should complete successfully without E11000 errors.

## Files to Modify

Primary:
- `/src/Adapters/Storage/Mongo/MongoSchemaCollection.js` - Add error handling to `updateSchema()` and `upsertSchema()`

Optional (for comprehensive fix):
- Same file - Add locking mechanism for schema updates

## Success Criteria

- Benchmark with 100ms DB latency completes successfully
- No E11000 errors in production under high load
- Multiple concurrent schema creations handled gracefully
- Existing functionality unchanged (backward compatible)

## Additional Context

This bug was discovered using the MongoDB latency wrapper tool (`benchmark/MongoLatencyWrapper.js`) which adds artificial delays to database operations. The wrapper successfully exposed a real-world race condition that could occur in production environments with:
- Network latency
- Slow database connections
- High concurrent load
- Multi-region deployments

The latency wrapper is a valuable tool for testing Parse Server's behavior under realistic network conditions and can be used to test the fix.
