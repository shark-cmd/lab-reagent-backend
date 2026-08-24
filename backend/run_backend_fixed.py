#!/usr/bin/env python3
"""Start the LabStock backend with mock MongoDB."""
import sys
sys.path.insert(0, '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend')

import mongomock
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Set environment variables before importing server
import os
os.environ['MONGO_URL'] = 'mongodb://localhost:27017'
os.environ['DB_NAME'] = 'labstock'

# Create mock MongoDB
mock_client = mongomock.MongoClient()
mock_db_raw = mock_client['labstock']

# Create async wrapper classes
class MockAsyncCursor:
    """Mock cursor that wraps mongomock cursor."""
    def __init__(self, cursor):
        self._cursor = cursor
    
    def sort(self, key_or_list, direction=None):
        """Mock sort method that returns self (no-op for mock)."""
        return self
    
    async def to_list(self, length=None):
        docs = list(self._cursor)
        return docs[:length] if length else docs

class MockAsyncCollection:
    """Mock async collection that wraps mongomock collection."""
    def __init__(self, collection):
        self._collection = collection
    
    def find(self, query=None, projection=None):
        """Return a MockAsyncCursor (not a coroutine)."""
        cursor = self._collection.find(query or {}, projection)
        return MockAsyncCursor(cursor)
    
    async def find_one(self, query=None, projection=None):
        return self._collection.find_one(query or {}, projection)
    
    async def insert_one(self, document):
        return self._collection.insert_one(document)
    
    async def update_one(self, query, update, upsert=False):
        result = self._collection.update_one(query, update, upsert=upsert)
        class R:
            modified_count = result.modified_count
            matched_count = result.modified_count
        return R()
    
    async def delete_one(self, query):
        result = self._collection.delete_one(query)
        return type('R', (), {'deleted_count': result.deleted_count})()
    
    async def delete_many(self, query):
        result = self._collection.delete_many(query)
        return type('R', (), {'deleted_count': result.deleted_count})()
    
    async def count_documents(self, query=None):
        return self._collection.count_documents(query or {})
    
    async def distinct(self, key, filter=None):
        return self._collection.distinct(key, filter)

    async def create_index(self, *args, **kwargs):
        """Match Motor's create_index API so startup index seeding stays quiet."""
        return self._collection.create_index(*args, **kwargs)

class MockAsyncDatabase:
    """Mock database that properly handles attribute access for collections."""
    def __init__(self, db):
        self._db = db
        self._collections = {}
    
    def __getattr__(self, name):
        if name.startswith('_'):
            return object.__getattribute__(self, name)
        
        # Return a MockAsyncCollection for any collection name
        if name not in self._collections:
            self._collections[name] = MockAsyncCollection(self._db[name])
        return self._collections[name]

mock_db = MockAsyncDatabase(mock_db_raw)

# Patch the server module
import server as real_server
real_server.db = mock_db

print("✓ LabStock Backend")
print(f"  Database: labstock")
print(f"  Collections: {list(mock_db._db.list_collection_names())}")

# Set environment variables if not set
import os
os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'labstock')

# Start the server
import uvicorn
uvicorn.run(real_server.app, host="0.0.0.0", port=8003)
