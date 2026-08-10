"""Async mock MongoDB using mongomock."""
import asyncio
from typing import Optional, List, Any

class MockAsyncCursor:
    """Async cursor wrapper for mongomock cursors."""
    def __init__(self, cursor):
        self._cursor = cursor
    
    async def to_list(self, length=None) -> list:
        docs = list(self._cursor)
        if length:
            return docs[:length]
        return docs

class MockAsyncCollection:
    """Async wrapper around mongomock collection."""
    def __init__(self, collection):
        self._collection = collection
    
    async def find(self, query=None, projection=None) -> MockAsyncCursor:
        if query is None:
            query = {}
        cursor = self._collection.find(query, projection)
        return MockAsyncCursor(cursor)
    
    async def find_one(self, query=None, projection=None):
        if query is None:
            query = {}
        return self._collection.find_one(query, projection)
    
    async def insert_one(self, document):
        return self._collection.insert_one(document)
    
    async def update_one(self, query, update, upsert=False):
        result = self._collection.update_one(query, update, upsert=upsert)
        return type('Result', (), {'modified_count': result.modified_count, 'matched_count': result.modified_count})()
    
    async def delete_one(self, query):
        result = self._collection.delete_one(query)
        return type('Result', (), {'deleted_count': result.deleted_count})()
    
    async def delete_many(self, query):
        result = self._collection.delete_many(query)
        return type('Result', (), {'deleted_count': result.deleted_count})()
    
    async def count_documents(self, query=None) -> int:
        if query is None:
            query = {}
        return self._collection.count_documents(query)
    
    async def distinct(self, key, filter=None):
        return self._collection.distinct(key, filter)

class MockAsyncDatabase:
    """Async wrapper around mongomock database."""
    def __init__(self, db):
        self._db = db
    
    async def items(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['items'])
    
    async def lots(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['lots'])
    
    async def log(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['log'])
    
    async def users(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['users'])
    
    async def settings(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['settings'])
    
    async def purchase_orders(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['purchase_orders'])
    
    async def digest_log(self) -> MockAsyncCollection:
        return MockAsyncCollection(self._db['digest_log'])

# Create the mock database instance
mock_client = None
mock_db = None

def init_mock():
    """Initialize the mock MongoDB."""
    global mock_client, mock_db
    import mongomock
    mock_client = mongomock.MongoClient()
    mock_db = MockAsyncDatabase(mock_client['labstock'])
    return mock_db

print("✓ Mock async MongoDB module ready")
