#!/usr/bin/env python3
"""Debug the backend errors."""
import os
import sys
import requests

try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

base_url = "http://localhost:8003"

print("=== Debugging Backend Errors ===\n")

# Get token
print("Getting auth token...")
response = requests.post(f"{base_url}/api/auth/login", json={
    "username": "admin",
    "password": "admin123",
    "pin": "1234"
})
if response.status_code == 200:
    token = response.json()['token']
    print(f"✓ Got token\n")
else:
    print(f"✗ Login failed: {response.status_code}")
    exit(1)

# Test purchase orders
print("Testing purchase orders endpoint...")
try:
    response = requests.get(f"{base_url}/api/purchase-orders", 
                           headers={"Authorization": f"Bearer {token}"}, timeout=5)
    print(f"  Status: {response.status_code}")
    if response.status_code != 200:
        print(f"  Response: {response.text[:500]}")
    else:
        print(f"  ✓ Success: {len(response.json().get('purchase_orders', []))} orders")
except Exception as e:
    print(f"  ✗ Error: {e}")

print()

# Test history
print("Testing history endpoint...")
try:
    response = requests.get(f"{base_url}/api/history?limit=10", 
                           headers={"Authorization": f"Bearer {token}"}, timeout=5)
    print(f"  Status: {response.status_code}")
    if response.status_code != 200:
        print(f"  Response: {response.text[:500]}")
    else:
        data = response.json()
        print(f"  ✓ Success: {len(data.get('logs', []))} log entries")
except Exception as e:
    print(f"  ✗ Error: {e}")

print()
print("Checking backend logs...")
log_path = os.path.join(os.path.dirname(__file__), "backend.log")
if os.path.exists(log_path):
    with open(log_path, "r", encoding="utf-8", errors="replace") as fh:
        print("".join(fh.readlines()[-20:])[-1000:])
else:
    print(f"  (no {log_path} found - start the server with output redirected to see logs)")
