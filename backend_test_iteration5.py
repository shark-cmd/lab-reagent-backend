"""
LabStock Backend API Test Suite - Iteration 5
Tests NEW fault-tolerant /api/receive-commit endpoint behavior
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://doc-parser-hub-3.preview.emergentagent.com/api"

class LabStockTesterIteration5:
    def __init__(self):
        self.admin_token = None
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
        
    def login_admin(self):
        """Login as admin to get token"""
        print("\n=== Logging in as admin ===")
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "admin123",
            "pin": "1234"
        })
        if resp.status_code == 200:
            data = resp.json()
            self.admin_token = data.get("token")
            print(f"✅ Admin login successful, token received")
            return True
        else:
            print(f"❌ Admin login failed: {resp.status_code} - {resp.text}")
            return False
            
    def test_receive_commit_fault_tolerant(self):
        """Test POST /api/receive-commit with mixed valid/invalid items"""
        print("\n=== Testing /api/receive-commit Fault Tolerance ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: Send items with one empty barcode and others valid
        timestamp = datetime.now().strftime("%H%M%S")
        items = [
            {
                "barcode": f"QA-VALID-1-{timestamp}",
                "name": "Valid Item 1",
                "qty": 10,
                "unit": "mL",
                "lot": "L001",
                "expiry": "2026-12-31",
                "min_stock": 5,
                "location": "Fridge 1",
                "storage": "2-8°C",
                "cost": 15.50
            },
            {
                "barcode": "",  # Empty barcode - should be skipped
                "name": "Invalid Item - No Barcode",
                "qty": 5,
                "unit": "unit",
                "lot": "",
                "expiry": "",
                "min_stock": 0,
                "location": "",
                "storage": "Ambient",
                "cost": 0
            },
            {
                "barcode": f"QA-VALID-2-{timestamp}",
                "name": "Valid Item 2",
                "qty": 20,
                "unit": "tests",
                "lot": "L002",
                "expiry": "2027-06-30",
                "min_stock": 10,
                "location": "Cold Room",
                "storage": "-20°C",
                "cost": 25.00
            }
        ]
        
        resp = requests.post(f"{BASE_URL}/receive-commit", json={"items": items}, headers=headers)
        
        # Should return 200, not 422
        passed = resp.status_code == 200
        self.log_result("POST /api/receive-commit returns 200 (not 422) with mixed valid/invalid items", 
                       passed, f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Check response structure
            has_ok = "ok" in data and data["ok"] is True
            self.log_result("Response has ok=true", has_ok, f"ok={data.get('ok')}")
            
            has_imported = "imported" in data
            self.log_result("Response has 'imported' field", has_imported, f"imported={data.get('imported')}")
            
            has_registered = "registered" in data
            self.log_result("Response has 'registered' field", has_registered, f"registered={data.get('registered')}")
            
            has_count = "count" in data
            self.log_result("Response has 'count' field", has_count, f"count={data.get('count')}")
            
            has_errors = "errors" in data
            self.log_result("Response has 'errors' field", has_errors, f"errors={data.get('errors')}")
            
            # Check that 2 valid items were imported
            imported_count = data.get("imported", 0)
            passed = imported_count == 2
            self.log_result("Imported count is 2 (valid items only)", passed, 
                           f"imported={imported_count}, expected=2")
            
            # Check that errors array contains the bad row
            errors = data.get("errors", [])
            has_error = len(errors) > 0
            self.log_result("Errors array contains at least one error for bad row", has_error,
                           f"errors={errors}")
            
            if has_error:
                error_mentions_barcode = any("barcode" in str(e).lower() for e in errors)
                self.log_result("Error message mentions 'barcode'", error_mentions_barcode,
                               f"First error: {errors[0] if errors else 'none'}")
            
            # Verify valid items were created by checking via /api/resolve
            print("\n--- Verifying valid items were created via /api/resolve ---")
            
            for i, barcode in enumerate([f"QA-VALID-1-{timestamp}", f"QA-VALID-2-{timestamp}"], 1):
                resolve_resp = requests.post(f"{BASE_URL}/resolve", 
                                            json={"barcode": barcode}, 
                                            headers=headers)
                if resolve_resp.status_code == 200:
                    resolve_data = resolve_resp.json()
                    found = resolve_data.get("found", False)
                    self.log_result(f"Valid item {i} ({barcode}) was created and can be resolved", 
                                   found, f"found={found}")
                    
                    if found:
                        item = resolve_data.get("item", {})
                        total = resolve_data.get("total", 0)
                        expected_qty = 10 if i == 1 else 20
                        qty_correct = total == expected_qty
                        self.log_result(f"Valid item {i} has correct quantity", qty_correct,
                                       f"total={total}, expected={expected_qty}")
                else:
                    self.log_result(f"Valid item {i} ({barcode}) resolve check", False,
                                   f"Status {resolve_resp.status_code}")
        else:
            print(f"   Response body: {resp.text}")
            
    def test_receive_commit_all_valid(self):
        """Test POST /api/receive-commit with all valid items"""
        print("\n=== Testing /api/receive-commit with All Valid Items ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        timestamp = datetime.now().strftime("%H%M%S")
        
        items = [
            {
                "barcode": f"QA-ALL-VALID-1-{timestamp}",
                "name": "All Valid Test 1",
                "qty": 15,
                "unit": "mL",
                "lot": "L100",
                "expiry": "2026-12-31",
                "min_stock": 5,
                "location": "Lab A",
                "storage": "Ambient",
                "cost": 10.00
            },
            {
                "barcode": f"QA-ALL-VALID-2-{timestamp}",
                "name": "All Valid Test 2",
                "qty": 25,
                "unit": "tests",
                "lot": "L101",
                "expiry": "2027-03-15",
                "min_stock": 10,
                "location": "Lab B",
                "storage": "2-8°C",
                "cost": 20.00
            }
        ]
        
        resp = requests.post(f"{BASE_URL}/receive-commit", json={"items": items}, headers=headers)
        
        passed = resp.status_code == 200
        self.log_result("POST /api/receive-commit with all valid items returns 200", 
                       passed, f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            imported = data.get("imported", 0)
            errors = data.get("errors", [])
            
            passed = imported == 2 and len(errors) == 0
            self.log_result("All valid items imported with no errors", passed,
                           f"imported={imported}, errors={len(errors)}")
        else:
            print(f"   Response body: {resp.text}")
            
    def run_all_tests(self):
        """Run all iteration 5 tests"""
        print("=" * 70)
        print("LabStock Backend API Tests - Iteration 5")
        print("Testing: Fault-tolerant /api/receive-commit endpoint")
        print("=" * 70)
        
        if not self.login_admin():
            print("\n❌ Cannot proceed without admin token")
            return False
            
        self.test_receive_commit_fault_tolerant()
        self.test_receive_commit_all_valid()
        
        # Summary
        print("\n" + "=" * 70)
        print(f"SUMMARY: {self.tests_passed}/{self.tests_run} tests passed")
        print("=" * 70)
        
        # Save results to JSON
        results = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": self.tests_run,
            "passed": self.tests_passed,
            "failed": self.tests_run - self.tests_passed,
            "success_rate": f"{(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%",
            "tests": self.test_results
        }
        
        with open("/app/test_reports/backend_test_iteration5_results.json", "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nDetailed results saved to: /app/test_reports/backend_test_iteration5_results.json")
        
        return self.tests_passed == self.tests_run

if __name__ == "__main__":
    tester = LabStockTesterIteration5()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
