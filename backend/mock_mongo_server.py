"""Mock MongoDB server using mongomock for development."""
import sys
sys.path.insert(0, '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend')

import mongomock
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Create a mock client
mock_client = mongomock.MongoClient()

# Create a wrapper that mimics motor's interface
class MockMotorDatabase:
    def __init__(self, db):
        self._db = db
    
    async def items(self):
        return MockCollection(self._db['items'])
    
    async def lots(self):
        return MockCollection(self._db['lots'])
    
    async def log(self):
        return MockCollection(self._db['log'])
    
    async def users(self):
        return MockCollection(self._db['users'])
    
    async def settings(self):
        return MockCollection(self._db['settings'])
    
    async def purchase_orders(self):
        return MockCollection(self._db['purchase_orders'])
    
    async def digest_log(self):
        return MockCollection(self._db['digest_log'])

class MockCollection:
    def __init__(self, collection):
        self._collection = collection
    
    async def find(self, query=None, projection=None):
        if query is None:
            query = {}
        cursor = self._collection.find(query, projection)
        return MockCursor(list(cursor))
    
    async def find_one(self, query=None, projection=None):
        if query is None:
            query = {}
        doc = self._collection.find_one(query, projection)
        return doc
    
    async def insert_one(self, document):
        return self._collection.insert_one(document)
    
    async def update_one(self, query, update, upsert=False):
        result = self._collection.update_one(query, update, upsert=upsert)
        return MockUpdateResult(result.modified_count)
    
    async def delete_one(self, query):
        result = self._collection.delete_one(query)
        return MockDeleteResult(result.deleted_count)
    
    async def delete_many(self, query):
        result = self._collection.delete_many(query)
        return MockDeleteResult(result.deleted_count)
    
    async def count_documents(self, query=None):
        if query is None:
            query = {}
        return self._collection.count_documents(query)
    
    async def distinct(self, key, filter=None):
        return self._collection.distinct(key, filter)

class MockCursor:
    def __init__(self, docs):
        self._docs = list(docs)
    
    async def to_list(self, length=None):
        if length:
            return self._docs[:length]
        return self._docs

class MockUpdateResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count
        self.matched_count = modified_count

class MockDeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count

# Create the mock database
mock_db = MockMotorDatabase(mock_client['labstock'])

print("✓ Mock MongoDB server created successfully")
print(f"  Database: labstock")
print(f"  Collections: {list(mock_db._db.list_collection_names())}")
