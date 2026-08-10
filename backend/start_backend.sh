#!/bin/bash
# Start the backend with mock MongoDB

export MONGO_URL="mongodb://localhost:27017"
export DB_NAME="labstock"

# Start the backend server with mock MongoDB
python3 -c "
import sys
sys.path.insert(0, '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend')

import mongomock
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Create mock MongoDB
mock_client = mongomock.MongoClient()
mock_db = mock_client['labstock']

# Import the real server module
import importlib.util
spec = importlib.util.spec_from_file_location('server', '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend/server.py')
server_module = importlib.util.module_from_spec(spec)

# Override the db before module initialization
import server as real_server
real_server.db = mock_db

print('✓ Backend started with mock MongoDB')
print(f'  Database: labstock')
print(f'  Collections: {list(mock_db.list_collection_names())}')

# Start the server
import uvicorn
uvicorn.run(real_server.app, host='0.0.0.0', port=8000)
" &

echo "Backend starting..."
sleep 2
cat /tmp/backend.log 2>/dev/null || echo "Waiting for backend to start..."
