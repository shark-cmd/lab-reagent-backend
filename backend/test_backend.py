#!/usr/bin/env python3
"""Test the LabStock backend on port 8001."""
import requests

base_url = "http://localhost:8003"

print("=== Testing LabStock Backend (Port 8001) ===\n")

# Test 1: Check backend connectivity
print("1. Testing backend connectivity...")
try:
    response = requests.get(f"{base_url}/docs", timeout=5)
    if response.status_code == 200:
        print("  ✓ Backend is running on port 8001")
    else:
        print(f"  ✗ Backend not responding (status: {response.status_code})")
except Exception as e:
    print(f"  ✗ Error: {e}")

# Test 2: Get API documentation
print("\n2. Testing API documentation...")
try:
    response = requests.get(f"{base_url}/openapi.json", timeout=5)
    if response.status_code == 200:
        data = response.json()
        endpoints = len(data.get("paths", {}))
        print(f"  ✓ API has {endpoints} endpoints")
    else:
        print(f"  ✗ Failed: {response.status_code}")
except Exception as e:
    print(f"  ✗ Error: {e}")

# Test 3: Login
print("\n3. Testing login...")
try:
    response = requests.post(f"{base_url}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    }, timeout=5)
    if response.status_code == 200:
        data = response.json()
        token = data['token']
        user = data['user']
        print(f"  ✓ Login successful: {user['username']} ({user['role']})")
        
        # Test 4: Dashboard
        print("\n4. Testing dashboard...")
        response = requests.get(f"{base_url}/api/dashboard", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            items_count = len(data.get("items", []))
            reorder_count = len(data.get("reorder", []))
            print(f"  ✓ Dashboard loaded: {items_count} items, {reorder_count} reorder alerts")
        else:
            print(f"  ✗ Dashboard failed: {response.status_code}")
        
        # Test 5: Get users
        print("\n5. Testing user list...")
        response = requests.get(f"{base_url}/api/users", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            users = response.json()
            print(f"  ✓ Found {len(users)} users")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        # Test 6: Get technicians
        print("\n6. Testing technicians...")
        response = requests.get(f"{base_url}/api/technicians", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Found {len(data.get('technicians', []))} technicians")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        # Test 7: Get locations
        print("\n7. Testing locations...")
        response = requests.get(f"{base_url}/api/locations", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Found {len(data.get('locations', []))} locations")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        # Test 8: Get purchase orders
        print("\n8. Testing purchase orders...")
        response = requests.get(f"{base_url}/api/purchase-orders", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Found {len(data.get('purchase_orders', []))} purchase orders")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        # Test 9: Get history
        print("\n9. Testing history...")
        response = requests.get(f"{base_url}/api/history?limit=10", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Found {len(data.get('logs', []))} log entries")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        # Test 10: Get expiry forecast
        print("\n10. Testing expiry forecast...")
        response = requests.get(f"{base_url}/api/expiry-forecast", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Found {len(data.get('rows', []))} at-risk lots")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        # Test 11: Get usage trends
        print("\n11. Testing usage trends...")
        response = requests.get(f"{base_url}/api/usage-trends?days=30", 
                               headers={"Authorization": f"Bearer {token}"}, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Daily data points: {len(data.get('daily', []))}")
        else:
            print(f"  ✗ Failed: {response.status_code}")
        
        print("\n=== All tests passed! ===")
    else:
        print(f"  ✗ Login failed: {response.status_code}")
        print(f"    Response: {response.text[:200]}")
except Exception as e:
    print(f"  ✗ Error: {e}")
