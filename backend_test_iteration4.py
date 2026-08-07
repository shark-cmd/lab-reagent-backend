"""
LabStock Backend API Test Suite - Iteration 4
Testing 3 NEW features:
1. PO PDF + Email supplier (email is PREVIEW-ONLY)
2. Expiry Forecast (FEFO consumption vs usage rate)
3. Barcode Label preset sizes (backend support - supplier_email field)
"""
import requests
import sys
import json
from datetime import datetime, timedelta

BASE_URL = "https://doc-parser-hub-3.preview.emergentagent.com/api"

class LabStockTesterIteration4:
    def __init__(self):
        self.admin_token = None
        self.tech_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.po_id = None
        
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
        
    def setup_auth(self):
        """Login to get tokens"""
        print("\n=== Setting up authentication ===")
        
        # Admin login
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "admin123",
            "pin": "1234"
        })
        if resp.status_code == 200:
            self.admin_token = resp.json().get("token")
            print(f"✅ Admin token obtained")
        else:
            print(f"❌ Admin login failed: {resp.status_code}")
            sys.exit(1)
            
        # Tech login
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "tech",
            "password": "tech123",
            "pin": "5678"
        })
        if resp.status_code == 200:
            self.tech_token = resp.json().get("token")
            print(f"✅ Tech token obtained")
        else:
            print(f"❌ Tech login failed: {resp.status_code}")
            
    def test_expiry_forecast(self):
        """Test GET /api/expiry-forecast endpoint"""
        print("\n=== Testing Expiry Forecast ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp = requests.get(f"{BASE_URL}/expiry-forecast", headers=headers)
        
        passed = resp.status_code == 200
        if not passed:
            self.log_result("GET /api/expiry-forecast returns 200", False, 
                          f"Status {resp.status_code}: {resp.text}")
            return
            
        data = resp.json()
        
        # Check structure
        has_rows = "rows" in data
        has_summary = "summary" in data
        passed = has_rows and has_summary
        self.log_result("Expiry forecast has 'rows' and 'summary' keys", passed,
                       f"Keys: {list(data.keys())}")
        
        if not passed:
            return
            
        # Check summary structure
        summary = data.get("summary", {})
        has_at_risk = "at_risk_lots" in summary
        has_waste_value = "total_waste_value" in summary
        has_high_expired = "high_or_expired" in summary
        passed = has_at_risk and has_waste_value and has_high_expired
        self.log_result("Summary has at_risk_lots, total_waste_value, high_or_expired", passed,
                       f"Summary keys: {list(summary.keys())}")
        
        # Check row structure (if any rows exist)
        rows = data.get("rows", [])
        if len(rows) > 0:
            row = rows[0]
            required_fields = ["name", "barcode", "lot", "expiry", "days_to_expiry", 
                             "qty", "usage_rate", "projected_waste", "waste_value", 
                             "risk", "location"]
            has_all_fields = all(field in row for field in required_fields)
            self.log_result("Forecast row has all required fields", has_all_fields,
                           f"Row keys: {list(row.keys())}")
            
            # Check for expired lot (if days_to_expiry < 0, risk should be 'expired')
            expired_lots = [r for r in rows if r.get("days_to_expiry", 0) < 0]
            if expired_lots:
                expired_lot = expired_lots[0]
                passed = expired_lot.get("risk") == "expired"
                self.log_result("Expired lot (days_to_expiry < 0) has risk='expired'", passed,
                               f"days_to_expiry={expired_lot.get('days_to_expiry')}, risk={expired_lot.get('risk')}")
            
            # Check for no_usage risk (usage_rate == 0 should show risk='no_usage')
            no_usage_lots = [r for r in rows if r.get("usage_rate", 0) == 0 and r.get("projected_waste", 0) > 0]
            if no_usage_lots:
                no_usage_lot = no_usage_lots[0]
                passed = no_usage_lot.get("risk") == "no_usage"
                self.log_result("Lot with no usage history has risk='no_usage'", passed,
                               f"usage_rate={no_usage_lot.get('usage_rate')}, risk={no_usage_lot.get('risk')}")
                
                # Check that projected_waste == qty for no_usage items
                passed = no_usage_lot.get("projected_waste") == no_usage_lot.get("qty")
                self.log_result("No usage lot: projected_waste equals full qty", passed,
                               f"qty={no_usage_lot.get('qty')}, projected_waste={no_usage_lot.get('projected_waste')}")
        else:
            print("   ℹ️  No forecast rows (no at-risk lots)")
            
    def test_po_pdf(self):
        """Test GET /api/purchase-orders/{id}/pdf endpoint"""
        print("\n=== Testing PO PDF Generation ===")
        
        # First create a PO
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        po_data = {
            "supplier": "Test Supplier Inc",
            "supplier_email": "sales@testsupplier.com",
            "notes": "Test PO for PDF generation",
            "lines": [
                {
                    "name": "Test Reagent A",
                    "barcode": "TEST-A-001",
                    "unit": "mL",
                    "order_qty": 100,
                    "cost": 25.50
                }
            ]
        }
        
        resp = requests.post(f"{BASE_URL}/purchase-orders", json=po_data, headers=headers)
        if resp.status_code != 200:
            self.log_result("Create PO for PDF test", False, 
                          f"Status {resp.status_code}: {resp.text}")
            return
            
        po = resp.json()
        self.po_id = po.get("id")
        print(f"   Created PO: {po.get('po_number')}")
        
        # Test PDF generation with valid token
        resp = requests.get(f"{BASE_URL}/purchase-orders/{self.po_id}/pdf", 
                          params={"token": self.admin_token})
        
        passed = resp.status_code == 200
        self.log_result("GET /api/purchase-orders/{id}/pdf with token returns 200", passed,
                       f"Status {resp.status_code}")
        
        if passed:
            # Check content-type
            content_type = resp.headers.get("content-type", "")
            passed = "application/pdf" in content_type
            self.log_result("PDF response has content-type application/pdf", passed,
                           f"Content-Type: {content_type}")
            
            # Check PDF signature (first bytes should be '%PDF')
            pdf_bytes = resp.content
            passed = len(pdf_bytes) > 0 and pdf_bytes[:4] == b'%PDF'
            self.log_result("PDF response starts with '%PDF' signature", passed,
                           f"First 4 bytes: {pdf_bytes[:4]}, Size: {len(pdf_bytes)} bytes")
        
        # Test PDF generation without token (should return 401)
        resp = requests.get(f"{BASE_URL}/purchase-orders/{self.po_id}/pdf")
        passed = resp.status_code == 401
        self.log_result("GET /api/purchase-orders/{id}/pdf without token returns 401", passed,
                       f"Status {resp.status_code}")
        
        # Test PDF generation with invalid token
        resp = requests.get(f"{BASE_URL}/purchase-orders/{self.po_id}/pdf", 
                          params={"token": "invalid-token-xyz"})
        passed = resp.status_code == 401
        self.log_result("GET /api/purchase-orders/{id}/pdf with invalid token returns 401", passed,
                       f"Status {resp.status_code}")
        
    def test_po_email(self):
        """Test POST /api/purchase-orders/{id}/email endpoint (preview-only)"""
        print("\n=== Testing PO Email (Preview-Only) ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Test 1: Email a PO that HAS supplier_email
        if self.po_id:
            resp = requests.post(f"{BASE_URL}/purchase-orders/{self.po_id}/email", 
                               headers=headers)
            
            passed = resp.status_code == 200
            if not passed:
                self.log_result("POST /api/purchase-orders/{id}/email returns 200", False,
                               f"Status {resp.status_code}: {resp.text}")
                return
                
            data = resp.json()
            
            # Should return ok=false (preview-only)
            passed = data.get("ok") == False
            self.log_result("Email response has ok=false (preview-only)", passed,
                           f"ok={data.get('ok')}")
            
            # Should return provider_configured=false
            passed = data.get("provider_configured") == False
            self.log_result("Email response has provider_configured=false", passed,
                           f"provider_configured={data.get('provider_configured')}")
            
            # Should have recipient set
            passed = data.get("recipient") == "sales@testsupplier.com"
            self.log_result("Email response has correct recipient", passed,
                           f"recipient={data.get('recipient')}")
            
            # Should have message mentioning it would send
            message = data.get("message", "")
            passed = "would send" in message.lower() or "not configured" in message.lower()
            self.log_result("Email response message mentions preview/not configured", passed,
                           f"message={message[:100]}")
        
        # Test 2: Email a PO WITHOUT supplier_email
        po_data_no_email = {
            "supplier": "No Email Supplier",
            "supplier_email": "",
            "notes": "Test PO without email",
            "lines": [
                {
                    "name": "Test Reagent B",
                    "barcode": "TEST-B-001",
                    "unit": "unit",
                    "order_qty": 10,
                    "cost": 5.00
                }
            ]
        }
        
        resp = requests.post(f"{BASE_URL}/purchase-orders", json=po_data_no_email, headers=headers)
        if resp.status_code == 200:
            po_no_email = resp.json()
            po_no_email_id = po_no_email.get("id")
            
            resp = requests.post(f"{BASE_URL}/purchase-orders/{po_no_email_id}/email", 
                               headers=headers)
            
            if resp.status_code == 200:
                data = resp.json()
                
                # Should return ok=false
                passed = data.get("ok") == False
                self.log_result("Email PO without supplier_email returns ok=false", passed,
                               f"ok={data.get('ok')}")
                
                # Should have message asking to add supplier email
                message = data.get("message", "")
                passed = "add" in message.lower() and "email" in message.lower()
                self.log_result("Email response asks to add supplier email", passed,
                               f"message={message[:100]}")
        
    def test_po_supplier_email_field(self):
        """Test that supplier_email field is persisted in PO create/update"""
        print("\n=== Testing PO supplier_email Field Persistence ===")
        
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Create PO with supplier_email
        po_data = {
            "supplier": "Email Test Supplier",
            "supplier_email": "contact@emailtest.com",
            "notes": "Testing email field persistence",
            "lines": [
                {
                    "name": "Test Item",
                    "barcode": "TEST-EMAIL-001",
                    "unit": "unit",
                    "order_qty": 5,
                    "cost": 10.00
                }
            ]
        }
        
        resp = requests.post(f"{BASE_URL}/purchase-orders", json=po_data, headers=headers)
        passed = resp.status_code == 200
        if not passed:
            self.log_result("Create PO with supplier_email", False,
                           f"Status {resp.status_code}: {resp.text}")
            return
            
        po = resp.json()
        po_id = po.get("id")
        
        # Check that supplier_email is in response
        passed = po.get("supplier_email") == "contact@emailtest.com"
        self.log_result("Created PO returns supplier_email field", passed,
                       f"supplier_email={po.get('supplier_email')}")
        
        # GET the PO and verify supplier_email is persisted
        resp = requests.get(f"{BASE_URL}/purchase-orders/{po_id}", headers=headers)
        if resp.status_code == 200:
            po_retrieved = resp.json()
            passed = po_retrieved.get("supplier_email") == "contact@emailtest.com"
            self.log_result("GET PO returns persisted supplier_email", passed,
                           f"supplier_email={po_retrieved.get('supplier_email')}")
        
        # Update PO supplier_email
        resp = requests.put(f"{BASE_URL}/purchase-orders/{po_id}", 
                          json={"supplier_email": "updated@emailtest.com"}, 
                          headers=headers)
        if resp.status_code == 200:
            po_updated = resp.json()
            passed = po_updated.get("supplier_email") == "updated@emailtest.com"
            self.log_result("PUT PO updates supplier_email field", passed,
                           f"supplier_email={po_updated.get('supplier_email')}")
        
    def run_all_tests(self):
        """Run all iteration 4 tests"""
        print("=" * 60)
        print("LabStock Backend Test Suite - Iteration 4")
        print("Testing 3 NEW features:")
        print("1. PO PDF + Email supplier (preview-only)")
        print("2. Expiry Forecast")
        print("3. PO supplier_email field persistence")
        print("=" * 60)
        
        self.setup_auth()
        
        # Test new features
        self.test_expiry_forecast()
        self.test_po_pdf()
        self.test_po_email()
        self.test_po_supplier_email_field()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"TESTS COMPLETED: {self.tests_passed}/{self.tests_run} passed")
        print("=" * 60)
        
        # Save results
        results = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": self.tests_run,
            "passed": self.tests_passed,
            "failed": self.tests_run - self.tests_passed,
            "success_rate": f"{(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%",
            "tests": self.test_results
        }
        
        with open("/app/test_reports/backend_test_iteration4_results.json", "w") as f:
            json.dump(results, f, indent=2)
        
        return 0 if self.tests_passed == self.tests_run else 1

if __name__ == "__main__":
    tester = LabStockTesterIteration4()
    sys.exit(tester.run_all_tests())
