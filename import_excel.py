"""
Import lab inventory items from Excel file into LabStock backend.
Reads Lab Inventory Optimized.xlsx and posts items via /api/import endpoint.
"""
import csv
import io
import json
import openpyxl
import requests

BACKEND_URL = "http://localhost:8003"
EXCEL_FILE = "Lab Inventory Optimized.xlsx"


def extract_items_from_excel(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path)
    ws = wb.active
    items = []
    seq = 1
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
        test_name = row[1]
        if not test_name or not str(test_name).strip():
            continue
        item_code = row[3]
        if not item_code:
            continue
        barcode = str(int(item_code)) if isinstance(item_code, float) else str(item_code)
        unit = row[2] if row[2] else "unit"
        items.append({
            "barcode": barcode,
            "name": str(test_name).strip(),
            "qty": 0,
            "lot": "",
            "expiry": "",
            "unit": str(unit).strip(),
            "min_stock": 0,
            "location": "",
            "storage": "Ambient",
            "cost": 0,
        })
    return items


def items_to_csv(items: list[dict]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["barcode", "name", "qty", "lot", "expiry", "unit", "min_stock", "location", "storage", "cost"])
    writer.writeheader()
    writer.writerows(items)
    return buf.getvalue()


def login(session: requests.Session) -> str:
    resp = session.post(f"{BACKEND_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    resp.raise_for_status()
    token = resp.json()["token"]
    return token


def main():
    print(f"Reading items from {EXCEL_FILE}...")
    items = extract_items_from_excel(EXCEL_FILE)
    print(f"Found {len(items)} items with barcodes.")

    if not items:
        print("No items to import.")
        return

    csv_text = items_to_csv(items)

    session = requests.Session()
    print("Logging in to backend...")
    token = login(session)
    headers = {"Authorization": f"Bearer {token}"}

    print(f"Importing {len(items)} items (qty=0)...")
    resp = session.post(
        f"{BACKEND_URL}/api/import",
        json={"text": csv_text},
        headers=headers,
    )
    resp.raise_for_status()
    result = resp.json()
    print(f"Import result: imported={result.get('imported')}, errors={len(result.get('errors', []))}")
    if result.get("errors"):
        print("First 10 errors:")
        for e in result["errors"][:10]:
            print(f"  {e}")
    else:
        print("All items imported successfully with qty=0.")


if __name__ == "__main__":
    main()
