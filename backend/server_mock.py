"""Modified server.py to use mock MongoDB for development."""
import os
import sys

# Add the backend directory to path
sys.path.insert(0, '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend')

# Import mock MongoDB
import mongomock
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Create mock MongoDB
mock_client = mongomock.MongoClient()
mock_db = mock_client['labstock']

# Monkey-patch the database connection
import server as real_server

# Replace the database reference
real_server.db = mock_db

print("✓ Mock MongoDB initialized")
print(f"  Database: labstock")
print(f"  Collections: {list(mock_db.list_collection_names())}")

# Start the FastAPI server
import uvicorn
uvicorn.run(real_server.app, host="0.0.0.0", port=8000)
