"""
LabStock Backend API Test Suite
Tests all endpoints with focus on FEFO logic, auth, and admin permissions
"""
import requests
import sys
import json
from datetime import datetime, timedelta

BASE_URL = "https://doc-parser-hub-3.preview.emergentagent.com/api"

class LabStockTester:
    def __init__(self):
        self.admin_token = None
        self.tech_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
    def log_result(self, test_name, passed, details=""):
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
        
    def test_auth_login_success(self):
        """Test login with correct credentials"""
        print("\n=== Testing Auth: Login Success ===")
        
        # Admin login
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "admin123",
            "pin": "1234"
        })
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            self.admin_token = data.get("token")
            passed = self.admin_token is not None and data.get("user", {}).get("role") == "admin"
            self.log_result("Admin login with correct password+PIN", passed, 
                          f"Token received, role={data.get('user', {}).get('role')}")
        else:
            self.log_result("Admin login with correct password+PIN", False, 
                          f"Status {resp.status_code}: {resp.text}")
            
        # Tech login
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "tech",
            "password": "tech123",
            "pin": "5678"
        })
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            self.tech_token = data.get("token")
            passed = self.tech_token is not None and data.get("user", {}).get("role") == "technician"
            self.log_result("Tech login with correct password+PIN", passed,
                          f"Token received, role={data.get('user', {}).get('role')}")
        else:
            self.log_result("Tech login with correct password+PIN", False,
                          f"Status {resp.status_code}: {resp.text}")
            
    def test_auth_login_failures(self):
        """Test login with wrong credentials"""
        print("\n=== Testing Auth: Login Failures ===")
        
        # Wrong password
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "wrongpassword",
            "pin": "1234"
        })
        passed = resp.status_code == 401
        self.log_result("Login with wrong password returns 401", passed,
                       f"Status {resp.status_code}")
        
        # Wrong PIN
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "admin123",
            "pin": "9999"
        })
        passed = resp.status_code == 401
        self.log_result("Login with wrong PIN returns 401", passed,
                       f"Status {resp.status_code}")
        
    def test_auth_me(self):
        """Test /api/auth/me endpoint"""
        print("\n=== Testing Auth: /me endpoint ===")
        
        # With token
        resp = requests.get(f"{BASE_URL}/auth/me", 
                           headers={"Authorization": f"Bearer {self.admin_token}"})
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("username") == "admin"
        self.log_result("GET /auth/me with token returns user", passed,
                       f"Status {resp.status_code}")
        
        # Without token
        resp = requests.get(f"{BASE_URL}/auth/me")
        passed = resp.status_code == 401
        self.log_result("GET /auth/me without token returns 401", passed,
                       f"Status {resp.status_code}")
        
    def test_resolve(self):
        """Test barcode resolution"""
        print("\n=== Testing Resolve ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Unknown barcode
        resp = requests.post(f"{BASE_URL}/resolve", 
                            json={"barcode": "UNKNOWN_TEST_123"},
                            headers=headers)
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("found") == False and data.get("type") == "item"
        self.log_result("Resolve unknown barcode returns found=false", passed,
                       f"Response: {resp.json() if resp.status_code == 200 else resp.text}")
        
        # LOC: prefix
        resp = requests.post(f"{BASE_URL}/resolve",
                            json={"barcode": "LOC:SHELF_A1"},
                            headers=headers)
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("type") == "location"
        self.log_result("Resolve LOC: prefix returns type=location", passed,
                       f"Response: {resp.json() if resp.status_code == 200 else resp.text}")
        
    def test_stock_in_auto_register(self):
        """Test stock-in with auto-registration"""
        print("\n=== Testing Stock-In Auto-Registration ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        test_barcode = f"TEST_AUTO_{datetime.now().strftime('%H%M%S%f')}"
        
        resp = requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 10,
            "lot": "LOT001",
            "expiry": "2026-12-31",
            "name": "Test Auto Item",
            "unit": "ml"
        }, headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = (data.get("ok") == True and 
                     data.get("registered") == True and
                     data.get("total") == 10)
            self.log_result("Stock-in auto-registers unknown barcode", passed,
                          f"registered={data.get('registered')}, total={data.get('total')}")
        else:
            self.log_result("Stock-in auto-registers unknown barcode", False,
                          f"Status {resp.status_code}: {resp.text}")
            
        # Verify log entries (should have 'register' and 'in')
        resp = requests.get(f"{BASE_URL}/history?limit=10", headers=headers)
        if resp.status_code == 200:
            logs = resp.json().get("logs", [])
            register_log = any(l.get("action") == "register" for l in logs)
            in_log = any(l.get("action") == "in" for l in logs)
            passed = register_log and in_log
            self.log_result("Stock-in logs 'register' and 'in' actions", passed,
                          f"register={register_log}, in={in_log}")
        
        return test_barcode
        
    def test_fefo_consumption(self):
        """Test FEFO (First-Expiry-First-Out) consumption logic"""
        print("\n=== Testing FEFO Consumption ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        test_barcode = f"TEST_FEFO_{datetime.now().strftime('%H%M%S%f')}"
        
        # Create item with 3 lots:
        # - expiry 2026-06-01, qty 5
        # - expiry 2026-01-01, qty 5 (earliest, should be consumed first)
        # - blank expiry, qty 5 (should be consumed LAST)
        
        print(f"Creating test item {test_barcode} with 3 lots...")
        
        # Lot 1: 2026-06-01
        resp1 = requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 5,
            "lot": "LOT_JUNE",
            "expiry": "2026-06-01",
            "name": "FEFO Test Item"
        }, headers=headers)
        
        # Lot 2: 2026-01-01 (earliest)
        resp2 = requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 5,
            "lot": "LOT_JAN",
            "expiry": "2026-01-01"
        }, headers=headers)
        
        # Lot 3: blank expiry (should be last)
        resp3 = requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 5,
            "lot": "LOT_BLANK",
            "expiry": ""
        }, headers=headers)
        
        if not all(r.status_code == 200 for r in [resp1, resp2, resp3]):
            self.log_result("FEFO setup: create 3 lots", False, "Failed to create test lots")
            return
            
        total = resp3.json().get("total", 0)
        self.log_result("FEFO setup: create 3 lots", total == 15, f"Total qty={total}")
        
        # Now use 7 units - should consume LOT_JAN (5) + LOT_JUNE (2), leaving LOT_BLANK untouched
        print(f"Using 7 units from {test_barcode}...")
        resp = requests.post(f"{BASE_URL}/use", json={
            "barcode": test_barcode,
            "qty": 7
        }, headers=headers)
        
        if resp.status_code != 200:
            self.log_result("FEFO: use 7 units", False, f"Status {resp.status_code}: {resp.text}")
            return
            
        data = resp.json()
        consumed = data.get("consumed", [])
        total_after = data.get("total", 0)
        
        # Check consumption pattern
        jan_consumed = sum(c.get("taken", 0) for c in consumed if c.get("lot") == "LOT_JAN")
        june_consumed = sum(c.get("taken", 0) for c in consumed if c.get("lot") == "LOT_JUNE")
        blank_consumed = sum(c.get("taken", 0) for c in consumed if c.get("lot") == "LOT_BLANK")
        
        fefo_correct = (jan_consumed == 5 and june_consumed == 2 and blank_consumed == 0)
        self.log_result("FEFO: consumes earliest expiry first (2026-01-01)", jan_consumed == 5,
                       f"LOT_JAN consumed={jan_consumed}, expected=5")
        self.log_result("FEFO: then consumes next earliest (2026-06-01)", june_consumed == 2,
                       f"LOT_JUNE consumed={june_consumed}, expected=2")
        self.log_result("FEFO: leaves blank expiry untouched", blank_consumed == 0,
                       f"LOT_BLANK consumed={blank_consumed}, expected=0")
        self.log_result("FEFO: total remaining correct", total_after == 8,
                       f"Total after={total_after}, expected=8")
        
        # Verify remaining lots
        resp = requests.post(f"{BASE_URL}/resolve", json={"barcode": test_barcode}, headers=headers)
        if resp.status_code == 200:
            lots = resp.json().get("lots", [])
            jan_remaining = sum(l.get("qty", 0) for l in lots if l.get("lot") == "LOT_JAN")
            june_remaining = sum(l.get("qty", 0) for l in lots if l.get("lot") == "LOT_JUNE")
            blank_remaining = sum(l.get("qty", 0) for l in lots if l.get("lot") == "LOT_BLANK")
            
            self.log_result("FEFO verify: LOT_JAN fully consumed", jan_remaining == 0,
                           f"LOT_JAN remaining={jan_remaining}")
            self.log_result("FEFO verify: LOT_JUNE partially consumed", june_remaining == 3,
                           f"LOT_JUNE remaining={june_remaining}")
            self.log_result("FEFO verify: LOT_BLANK untouched", blank_remaining == 5,
                           f"LOT_BLANK remaining={blank_remaining}")
        
        # Test shortfall
        print(f"Testing shortfall with {test_barcode}...")
        resp = requests.post(f"{BASE_URL}/use", json={
            "barcode": test_barcode,
            "qty": 100
        }, headers=headers)
        
        if resp.status_code == 200:
            data = resp.json()
            shortfall = data.get("shortfall", 0)
            passed = shortfall > 0 and data.get("ok") == False
            self.log_result("FEFO: reports shortfall when insufficient", passed,
                           f"shortfall={shortfall}, ok={data.get('ok')}")
        
        # Verify no negative quantities
        resp = requests.post(f"{BASE_URL}/resolve", json={"barcode": test_barcode}, headers=headers)
        if resp.status_code == 200:
            lots = resp.json().get("lots", [])
            no_negatives = all(l.get("qty", 0) >= 0 for l in lots)
            self.log_result("FEFO: no negative quantities", no_negatives,
                           f"All lot quantities >= 0")
        
    def test_stocktake(self):
        """Test stocktake functionality"""
        print("\n=== Testing Stocktake ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        test_barcode = f"TEST_STOCK_{datetime.now().strftime('%H%M%S%f')}"
        
        # Create item
        requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 10,
            "lot": "LOT1"
        }, headers=headers)
        
        # Stocktake with different count
        resp = requests.post(f"{BASE_URL}/stocktake", json={
            "barcode": test_barcode,
            "counted": 15
        }, headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = (data.get("ok") == True and 
                     data.get("counted") == 15 and
                     data.get("adjustment") == 5 and
                     data.get("total") == 15)
            self.log_result("Stocktake sets counted qty and logs adjust", passed,
                           f"counted={data.get('counted')}, adjustment={data.get('adjustment')}, total={data.get('total')}")
        else:
            self.log_result("Stocktake sets counted qty and logs adjust", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def test_move(self):
        """Test move functionality"""
        print("\n=== Testing Move ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        test_barcode = f"TEST_MOVE_{datetime.now().strftime('%H%M%S%f')}"
        
        # Create item
        requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 5,
            "location": "Shelf A"
        }, headers=headers)
        
        # Move to new location
        resp = requests.post(f"{BASE_URL}/move", json={
            "barcode": test_barcode,
            "location": "Shelf B"
        }, headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("ok") == True and data.get("location") == "Shelf B"
            self.log_result("Move updates location", passed,
                           f"location={data.get('location')}")
        else:
            self.log_result("Move updates location", False,
                           f"Status {resp.status_code}: {resp.text}")
        
        # Move with LOC: prefix
        resp = requests.post(f"{BASE_URL}/move", json={
            "barcode": test_barcode,
            "location": "LOC:SHELF_C"
        }, headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("ok") == True
            self.log_result("Move supports LOC: prefix", passed,
                           f"location={data.get('location')}")
        else:
            self.log_result("Move supports LOC: prefix", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def test_item_update(self):
        """Test item update"""
        print("\n=== Testing Item Update ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        test_barcode = f"TEST_UPDATE_{datetime.now().strftime('%H%M%S%f')}"
        
        # Create item
        resp = requests.post(f"{BASE_URL}/stock-in", json={
            "barcode": test_barcode,
            "qty": 5,
            "name": "Original Name"
        }, headers=headers)
        item_id = resp.json().get("item_id")
        
        # Update item
        resp = requests.post(f"{BASE_URL}/item-update", json={
            "id": item_id,
            "name": "Updated Name",
            "min_stock": 10,
            "cost": 25.50
        }, headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("ok") == True
            self.log_result("Item update works", passed,
                           f"ok={data.get('ok')}")
        else:
            self.log_result("Item update works", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def test_dashboard(self):
        """Test dashboard KPIs"""
        print("\n=== Testing Dashboard ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        resp = requests.get(f"{BASE_URL}/dashboard", headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            kpis = data.get("kpis", {})
            has_required = all(k in kpis for k in ["total_value", "low_stock_count", 
                                                     "expiring_count", "expiring_buckets"])
            buckets = kpis.get("expiring_buckets", {})
            has_buckets = all(k in buckets for k in ["d30", "d60", "d90"])
            
            passed = has_required and has_buckets
            self.log_result("Dashboard returns KPIs", passed,
                           f"KPIs present: {list(kpis.keys())}")
            
            has_lists = all(k in data for k in ["reorder", "expiring", "items"])
            self.log_result("Dashboard returns reorder/expiring/items lists", has_lists,
                           f"Lists present: {[k for k in ['reorder', 'expiring', 'items'] if k in data]}")
        else:
            self.log_result("Dashboard returns KPIs", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def test_history(self):
        """Test history log"""
        print("\n=== Testing History ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Get all history
        resp = requests.get(f"{BASE_URL}/history", headers=headers)
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            logs = data.get("logs", [])
            passed = isinstance(logs, list)
            self.log_result("History returns log entries", passed,
                           f"Count: {len(logs)}")
        else:
            self.log_result("History returns log entries", False,
                           f"Status {resp.status_code}: {resp.text}")
        
        # Filter by action
        resp = requests.get(f"{BASE_URL}/history?action=in", headers=headers)
        if resp.status_code == 200:
            logs = resp.json().get("logs", [])
            all_in = all(l.get("action") == "in" for l in logs)
            self.log_result("History filter by action works", all_in,
                           f"All entries have action='in': {all_in}")
        
        # Filter by technician
        resp = requests.get(f"{BASE_URL}/history?technician=Lab Admin", headers=headers)
        if resp.status_code == 200:
            logs = resp.json().get("logs", [])
            all_admin = all(l.get("technician") == "Lab Admin" for l in logs)
            self.log_result("History filter by technician works", all_admin,
                           f"All entries have technician='Lab Admin': {all_admin}")
        
    def test_csv_import(self):
        """Test CSV import"""
        print("\n=== Testing CSV Import ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        csv_data = """barcode,name,qty,lot,expiry,min_stock,location,storage,cost,unit
TEST_CSV_001,CSV Item 1,10,LOT1,2026-12-31,5,Shelf A,Ambient,10.50,ml
TEST_CSV_002,CSV Item 2,20,LOT2,2027-01-15,10,Shelf B,Fridge,25.00,unit"""
        
        resp = requests.post(f"{BASE_URL}/import", json={"text": csv_data}, headers=headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("ok") == True and data.get("imported") == 2
            self.log_result("CSV import works", passed,
                           f"imported={data.get('imported')}, errors={len(data.get('errors', []))}")
        else:
            self.log_result("CSV import works", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def test_export_backup(self):
        """Test export and backup endpoints"""
        print("\n=== Testing Export/Backup ===")
        
        # Export items
        resp = requests.get(f"{BASE_URL}/export/items.csv?token={self.admin_token}")
        passed = resp.status_code == 200 and "text/csv" in resp.headers.get("content-type", "")
        self.log_result("Export items.csv works", passed,
                       f"Status {resp.status_code}, content-type={resp.headers.get('content-type')}")
        
        # Export history
        resp = requests.get(f"{BASE_URL}/export/history.csv?token={self.admin_token}")
        passed = resp.status_code == 200 and "text/csv" in resp.headers.get("content-type", "")
        self.log_result("Export history.csv works", passed,
                       f"Status {resp.status_code}, content-type={resp.headers.get('content-type')}")
        
        # Backup
        resp = requests.get(f"{BASE_URL}/backup?token={self.admin_token}")
        passed = resp.status_code == 200 and "application/json" in resp.headers.get("content-type", "")
        if passed:
            try:
                data = resp.json()
                passed = all(k in data for k in ["created_at", "counts", "items", "lots", "log"])
                self.log_result("Backup returns JSON snapshot", passed,
                               f"Keys present: {list(data.keys())}")
            except:
                self.log_result("Backup returns JSON snapshot", False, "Invalid JSON")
        else:
            self.log_result("Backup returns JSON snapshot", False,
                           f"Status {resp.status_code}")
        
    def test_user_management(self):
        """Test user management (admin only)"""
        print("\n=== Testing User Management ===")
        
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        tech_headers = {"Authorization": f"Bearer {self.tech_token}"}
        
        # Admin can list users
        resp = requests.get(f"{BASE_URL}/users", headers=admin_headers)
        passed = resp.status_code == 200
        if passed:
            users = resp.json()
            passed = isinstance(users, list) and len(users) >= 2
            self.log_result("Admin can list users", passed,
                           f"User count: {len(users) if isinstance(users, list) else 0}")
        else:
            self.log_result("Admin can list users", False,
                           f"Status {resp.status_code}: {resp.text}")
        
        # Tech cannot list users (403)
        resp = requests.get(f"{BASE_URL}/users", headers=tech_headers)
        passed = resp.status_code == 403
        self.log_result("Tech gets 403 on /users", passed,
                       f"Status {resp.status_code}")
        
        # Admin can create user
        test_username = f"testuser_{datetime.now().strftime('%H%M%S')}"
        resp = requests.post(f"{BASE_URL}/users", json={
            "username": test_username,
            "password": "test123",
            "pin": "9999",
            "name": "Test User",
            "role": "technician"
        }, headers=admin_headers)
        
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            passed = data.get("username") == test_username
            self.log_result("Admin can create user", passed,
                           f"Created user: {data.get('username')}")
        else:
            self.log_result("Admin can create user", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def test_technicians_locations(self):
        """Test technicians and locations lists"""
        print("\n=== Testing Technicians/Locations ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Technicians
        resp = requests.get(f"{BASE_URL}/technicians", headers=headers)
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            techs = data.get("technicians", [])
            passed = isinstance(techs, list)
            self.log_result("GET /technicians returns list", passed,
                           f"Count: {len(techs)}")
        else:
            self.log_result("GET /technicians returns list", False,
                           f"Status {resp.status_code}: {resp.text}")
        
        # Locations
        resp = requests.get(f"{BASE_URL}/locations", headers=headers)
        passed = resp.status_code == 200
        if passed:
            data = resp.json()
            locs = data.get("locations", [])
            passed = isinstance(locs, list)
            self.log_result("GET /locations returns list", passed,
                           f"Count: {len(locs)}")
        else:
            self.log_result("GET /locations returns list", False,
                           f"Status {resp.status_code}: {resp.text}")
        
    def run_all_tests(self):
        """Run all test suites"""
        print("=" * 60)
        print("LabStock Backend API Test Suite")
        print("=" * 60)
        
        # Auth tests
        self.test_auth_login_success()
        if not self.admin_token or not self.tech_token:
            print("\n❌ CRITICAL: Auth failed, cannot continue tests")
            return False
            
        self.test_auth_login_failures()
        self.test_auth_me()
        
        # Core functionality
        self.test_resolve()
        self.test_stock_in_auto_register()
        self.test_fefo_consumption()
        self.test_stocktake()
        self.test_move()
        self.test_item_update()
        
        # Dashboard and history
        self.test_dashboard()
        self.test_history()
        
        # Import/Export
        self.test_csv_import()
        self.test_export_backup()
        
        # Admin features
        self.test_user_management()
        self.test_technicians_locations()
        
        return True
        
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_run - self.tests_passed > 0:
            print("\nFailed tests:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}")
                    if result["details"]:
                        print(f"    {result['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = LabStockTester()
    
    try:
        success = tester.run_all_tests()
        tester.print_summary()
        
        # Save results to JSON
        with open("/app/test_reports/backend_test_results.json", "w") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "total_tests": tester.tests_run,
                "passed": tester.tests_passed,
                "failed": tester.tests_run - tester.tests_passed,
                "success_rate": round(tester.tests_passed/tester.tests_run*100, 1) if tester.tests_run > 0 else 0,
                "results": tester.test_results
            }, f, indent=2)
        
        return 0 if success else 1
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
