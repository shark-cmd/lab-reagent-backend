#!/usr/bin/env python3
"""Start the LabStock backend with mock MongoDB."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mongomock

# Set environment variables before importing server
os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'labstock')


class MockAsyncCursor:
    """Mock cursor that wraps mongomock cursor and supports Motor-style usage."""

    def __init__(self, cursor):
        self._cursor = cursor
        self._sort_key = None
        self._sort_dir = None

    def sort(self, key_or_list, direction=None):
        """Store sort params for application in to_list()/__aiter__()."""
        if isinstance(key_or_list, str):
            self._sort_key = key_or_list
            self._sort_dir = direction or 1
        elif isinstance(key_or_list, list) and key_or_list:
            first = key_or_list[0]
            if isinstance(first, (list, tuple)):
                self._sort_key = first[0]
                self._sort_dir = first[1] if len(first) > 1 else 1
            else:
                self._sort_key = first
                self._sort_dir = direction or 1
        return self

    def _docs(self):
        docs = list(self._cursor)
        if self._sort_key:
            reverse = self._sort_dir == -1
            docs.sort(key=lambda d: d.get(self._sort_key, ""), reverse=reverse)
        return docs

    async def to_list(self, length=None):
        docs = self._docs()
        return docs[:length] if length else docs

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        for doc in self._docs():
            yield doc


class MockAsyncCollection:
    """Mock async collection that wraps a mongomock collection."""

    def __init__(self, collection):
        self._collection = collection

    def find(self, query=None, projection=None):
        """Return a MockAsyncCursor (not a coroutine)."""
        cursor = self._collection.find(query or {}, projection)
        return MockAsyncCursor(cursor)

    def aggregate(self, pipeline, **kwargs):
        """Return a MockAsyncCursor over the aggregation result."""
        return MockAsyncCursor(self._collection.aggregate(pipeline, **kwargs))

    async def find_one(self, query=None, projection=None):
        return self._collection.find_one(query or {}, projection)

    async def insert_one(self, document):
        return self._collection.insert_one(document)

    async def update_one(self, query, update, upsert=False):
        result = self._collection.update_one(query, update, upsert=upsert)

        class R:
            modified_count = result.modified_count
            matched_count = result.matched_count

        return R()

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        return self._collection.find_one_and_update(
            query, update, upsert=upsert,
            return_document=True if return_document is True else False,
        )

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
    """Mock database that handles attribute access for collections."""

    def __init__(self, db):
        self._db = db
        self._collections = {}

    def __getattr__(self, name):
        if name.startswith('_'):
            return object.__getattribute__(self, name)
        if name not in self._collections:
            self._collections[name] = MockAsyncCollection(self._db[name])
        return self._collections[name]


mock_client = mongomock.MongoClient()
mock_db = MockAsyncDatabase(mock_client['labstock'])

# Patch the server module's database handle
import server as real_server  # noqa: E402
real_server.db = mock_db

print("[ok] LabStock Backend (mock MongoDB)")
print(f"     Database: labstock")

import uvicorn  # noqa: E402
uvicorn.run(real_server.app, host="0.0.0.0", port=8003)
