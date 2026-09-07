"""
Import HMNR Consumption Report August 2026 data into LabStock backend.
Stocks opening balances and records kit consumption.
"""
import requests

BACKEND_URL = "http://localhost:8003"

# Parsed from the consumption report PDF
# Each entry: (item_code, test_name, pack_size, expiry, total_available, used, closing_balance, stock_months)
# total_available = Opening + Indent + Received - Sent
CONSUMPTION_DATA = [
    ("I0000727", "Glucose R1 4X53 Ml R2 4X27 Ml-(6400T)-(Osr6221)-Olumpus", "6400", "01.02.2028", 55, 33, 22, 0.6),
    ("I0000575", "CREATININE (BECKMAN)-4X51ML- R1 &51ML- R2--(4860T)--(OSR6178)-NEW", "4860", "01.04.2028", 40, 25, 15, 0.6),
    ("I0001104", "UREA (R1:4X25ML & R2:4X25ML)--(2440T) CAT-NO-OSR6134", "2440", "01.04.2027", 37, 21, 16, 0.7),
    ("I0001098", "TRIGLYCERIDES-R1-4X50ML-R2-4X12.5ML- (OLYMPUS)--(3000T)-(OSR61118)", "3000", "01.09.2027", 43, 22, 21, 0.9),
    ("I0000548", "CHOLESTROL-(BECKMAN)-(9520T)-4X45ML-R1-(OSR6216)-NEW", "9520", "01.01.2028", 15, 6, 9, 1.4),
    ("I0000752", "HDL-Cholesterol--4 X 51.3Ml R1 17.1Ml R2--(1820T)--(Osr6287)", "1820", "01.10.2027", 59, 35, 24, 0.6),
    ("I0000800", "LDL CHOLESTEROL (BECKMAN)4X27/4X9ML--960T-(CODE-OSR6183)", "960", "01.07.2027", 10, 5, 5, 0.9),
    ("I0000487", "Bilirubin Total (Backman)4X40/4X40Ml-(8080T)-Osr6212", "8080", "01.11.2026", 26, 9, 17, 1.8),
    ("I0000486", "Bilirubin Direct (Backman)4X20/4X20Ml-(4200T)--Osr6211", "4200", "01.02.2027", 34, 12, 22, 1.7),
    ("I0000366", "Alk Phosphate - (Beckman)4X30/4X30Ml--(3780T)-(Code-Osr6104)", "3780", "01.08.2027", 34, 14, 20, 1.3),
    ("I0001020", "SGPT-(BECKMAN)-4X50ML- R1-4X25ML-R2--(3920T)--(OSR6107)", "3920", "01.02.2028", 31, 15, 16, 1.0),
    ("I0001016", "SGOT (BECKMAN)R1-4X50ML-R2-4X50ML--(7740T)--(OSR6209)", "7740", "01.10.2027", 22, 8, 14, 1.6),
    ("I0001084", "Total Protein (Beckman)4X48/4X48-(7520T)--(Osr6232)", "7520", "01.04.2027", 16, 7, 9, 1.2),
    ("I0000362", "Albumin (Beckman) 4X54Ml--(5800T)-(Osr6202)", "5800", "01.07.2027", 21, 9, 12, 1.2),
    ("I0000718", "Gamma Gt (Beckman)4X18/4X18--(1300T)--(Osr6020)", "1300", "01.07.2027", 71, 40, 31, 0.7),
    ("I0000412", "ASO LATEX(4X51+4X7)--1720T-(CODE-OSR6194)", "1720", "01.07.2026", 7, 1, 6, 5.6),
    ("I0000578", "CRP LATEX (BECKMAN)2X4X30--(1200T)--(OSR6199)", "1200", "01.04.2027", 39, 21, 18, 0.8),
    ("I0000989", "RA LATEX(BECKMAN)-R1-4X24ML-4X8ML--(960T)--(OSR61105)", "960", "01.06.2027", 17, 6, 11, 1.7),
    ("I0000551", "CK - NAC (BECKMAN)4X22+4X4+4X6--(1200T)--OSR6179", "1200", "01.07.2027", 7, 2, 5, 2.3),
    ("I0000798", "LDH (BECKMAN)-R1-4X50-R2-4X25ML-(4320T)--OSR6126", "4320", "01.09.2025", 6, 2, 4, 1.9),
    ("I0000956", "Phosphorous (Beckman)4X15/4X15Ml-(3160T)-Osr6122", "3160", "01.12.2027", 10, 1, 9, 8.4),
    ("I0000354", "ACID PHOSPHATES(ACCUREX)1ML", "8x1 ml", "31.03.2027", 15, 2, 13, 6.1),
    ("I0001083", "TOTAL BILE ACID-RX:2X60ML-R2:2X20ML--800T-(REDCELL)", "800", "31.08.2027", 4, 1, 3, 2.8),
    ("I0000795", "LACTATE(RANDOX)16X6", "16x6 ml", "28.09.2026", 7, 2, 5, 2.3),
    ("I0000570", "COPPER 5 X 20ML(RANDOX)", "5x20 Ml", "26.09.2027", 5, 1, 4, 4),
    ("I0000355", "ADA KINETIC KIT-2X20ML,1X20ML&CALIBRATOR 1X1ML & CONTROL 2X1ML-(RED CELL)", "2x20 ml", "31.08.2027", 2, 1, 1, 1),
    ("I0000512", "CALCIUM (BECKMAN)4X15ML-R1--(3560T)-(OSR60117)", "3560", "01.07.2028", 19, 7, 12, 2),
    ("I0000380", "AMYLASE (4 X 10 ML)-(320T) - OSR 6006-(BECKMAN)", "320", "01.07.2027", 4, 3, 1, 0.3),
    ("I0000805", "Lipase (R1 4X30Ml 4Xlyo R2 4X10Ml 2Xcalibrator)-920T--Osr6230", "6230", "01.08.2027", 7, 4, 3, 0.7),
    ("I0001495", "AMMONIA WITH CAL-2X16ML & 1X3ML--186T--93CATRIDGE--BECKMAN--(CODE-OSR61154)", "186", "01.08.2027", 6, 4, 2, 0.5),
    ("I0001109", "URIC ACID (BECKMAN)4X30/4X12.5--(3200T)--(OSR6198)", "3200", "01.03.2027", 30, 16, 14, 0.8),
    ("I0000812", "MAGNESIUM (BECKMAN)4X40ML--(1000T)--(CODE-OSR6189)", "1000", "01.03.2028", 29, 16, 13, 0.8),
    ("I0000549", "CHOLINE ESTERASE ( CHE) ( OSR6114)--720T", "720", "01.10.2026", 3, 0, 3, 0),
    ("I0000353", "ACE-10X10ML-(RED CELL)", "10x10 ml", "30.04.2027", 27, 3, 24, 7.5),
    ("I0000713", "G6PDH QUANTITATIVE-2X18ML,2X1.5ML-(RED CELLS)", "2x18 ml", "31.06.2027", 6, 2, 4, 1.9),
    ("I0000541", "CERULOPLASMIN(BECKMAN)--(OSR6164)", "480", "01.10.2026", 5, 1, 4, 3.7),
    ("I0007759", "Zinc-fs-2x25ml-include calibrator-(Cat-No-10300295002)-300 Tests, Make: Diasys", "2x25 ml", "NA", 9, 9, 0, 0),
    ("I0001498", "BICARBONATE R1 4X25ML-2320TEST--TEST CATRIDGE-580--(CODE-OSR6190)", "2320", "01.03.2027", 8, 4, 4, 0.9),
    ("I0000779", "IRON (BECKMAN)4X15/4X15", "2000T", "01.07.2027", 20, 11, 9, 0.8),
    ("I0001103", "UIBC (BECKMAN)4X27/4X34X6-(800T)-(OSR61205)", "800", "01.01.2027", 20, 10, 10, 0.9),
    ("I0000785", "ISE Na+/K+ Selectivity Check, 2 x 25 mL-(code-66313-AU680-beckman)", "2*25 ml", "10.02.2027", 2, 0, 2, 0),
    ("I0000830", "Micro Albumin (Beckman)4X15/4X5--(812T)--(B38858)", "812", "01.06.2027", 28, 10, 18, 1.7),
    ("I0001116", "Urinary Protein (Beckman)4X19Mlcalibrator 1X3Ml--(660T)--(Osr6170)", "660", "01.05.2027", 23, 9, 14, 1.5),
    ("I0014998", "Total Protein UC FS 6*20ml - 840T (Cat No:102109910930) - Diasys India", "840", "NA", 8, 8, 0, 0),
    ("I0000786", "Ise Reference 4 X 1000 Ml-(Code-66318-Au680-Beckman)", "4x1000 ml", "05.07.2027", 10, 1, 9, 8.4),
    ("I0000780", "Ise Buffer 4 X 2000 Ml-(Code-66320-Au680-Beckman)", "4x2000 ml", "17.06.2027", 16, 6, 10, 1.6),
    ("I0000781", "Ise High Serum Standard 4 X 100 Ml-(Code-66316-Au680-Beckman)", "4 X 100 Ml", "16.06.2027", 5, 1, 4, 3.7),
    ("I0000784", "Ise Mid Standard 4 X 2000 Ml--(Code-66319-Au680-Beckman)", "4 X 2000 Ml", "28.09.2027", 19, 9, 10, 1),
    ("I0000782", "Ise Low Serum Standard 4 X 100 Ml-(Code-66317-Au680-Beckman)", "4 X 100", "31.12.2026", 5, 1, 4, 3.7),
    ("I0000783", "Ise Low/High Urine Standard 2X100 Ml Low 2X100 Ml High-(Code-66315-Au680-Beckman)", "2X100", "NA", 2, 2, 0, 0),
    ("I0000495", "Biorad Chem Control Level 1 (1X12)-(C-310-5)", "1x12", "28.02.2029", 15, 3, 12, 3.7),
    ("I0000494", "Biorad Chem Control Level 2(1X12)-(C-315-5)", "1x12", "28.02.2029", 15, 3, 12, 3.7),
    ("I0000504", "Bio-Rad--Spinal Fluid Control-L1-(Cat-No-752)-6X3Ml", "6X3Ml", "31.05.2027", 6, 2, 4, 1.9),
    ("I0000505", "Bio-Rad--Spinal Fluid Control-L2-(Cat-No-752)-6X3Ml", "6X3Ml", "31.05.2027", 6, 2, 4, 1.9),
    ("I0007120", "Ammonia Control Level-2-6X3Ml-(Code-545)", "6X3Ml", "31.05.2027", 9, 2, 7, 3.3),
    ("I0001462", "Ammonia Control Level-3-6X3Ml-(Code-546)", "6X3Ml", "31.05.2027", 9, 2, 7, 3.3),
    ("I0001122", "Urine Control 1(Bio-Rad)12X10Ml-(397)", "12x10 ML", "30.09.2027", 12, 4, 8, 1.9),
    ("I0001123", "Urine Control 2(Bio-Rad)12X10Ml-(398)", "12x10 ML", "30.09.2027", 13, 5, 8, 1.5),
    ("I0010767", "Randox-Assayed chemistry control premium plus level-2-20x5ml-(Cat-No-HN1530)", "20x5 Ml", "28.06.2028", 59, 17, 42, 2.3),
    ("I0010768", "Randox-Assayed chemistry control premium plus level-3-20x5ml-(Cat-No-HE1532)", "20x5 Ml", "28.06.2028", 57, 13, 44, 3.2),
    ("I0001075", "System Calibrator (Beckman)20X5--(Code-6630)", "20x5 Ml", "01.05.2027", 31, 6, 25, 3.9),
    ("I0015209", "Apolipo Protein-A (Beckman) - 4X13 mL-R1 & 4*13 mL-R2 - (1320T) - (OSR6142)", "4*13 mL", "01.10.2027", 3, 0, 3, 0),
    ("I0015210", "Apolipo Protein-B (Beckman) - 4X13 mL-R1 & 4*7 mL-R2 - (1360T) - (OSR6143)", "4*7 mL", "01.11.2027", 3, 1, 2, 1.9),
    ("I0015214", "Immunoglobulin IgA (Beckman) - 4X14 mL-R1 & 4*11 mL-R2 - (1280T) - (OSR61171)", "4*11 mL", "01.01.2028", 3, 0, 3, 0),
    ("I0015215", "Immunoglobulin IgG (Beckman) - 4X22 mL-R1 & 4*20 mL-R2 - (1480T) - (OSR61172)", "4*20 mL", "01.01.2028", 3, 0, 3, 0),
    ("I0015216", "Immunoglobulin IgM (Beckman) - 4X14 mL-R1 & 4*11 mL-R2 - (1280T) - (OSR61173)", "4*11 mL", "01.03.2028", 7, 2, 5, 2.3),
    ("I0015212", "Complement C3 (Beckman) - 4X10 mL-R1 & 4*8 mL-R2 - (1280T) - (OSR6159)", "4*8 mL", "01.02.2028", 3, 0, 3, 0),
    ("I0015213", "Complement C4 (Beckman) - 4X10 mL-R1 & 4*8 mL-R2 - (1280T) - (OSR6160)", "4*8 mL", "01.02.2028", 3, 0, 3, 0),
    ("I0015218", "Diazyme Human Lambda Free Light Chain Assay (Beckman) - (210T) - (C82710)", "210T", "31.05.2027", 1, 0, 1, 0),
    ("I0015217", "Diazyme Human Kappa Free Light Chain Assay (Beckman) - (210T) - (C82709)", "210T", "NA", 0, 0, 0, 0),
    ("I0015219", "Haptoglobin (Beckman) - 4X16.5 mL-R1 & 4*4.5 mL-R2 - (680T) - (OSR6165)", "680T", "01.02.2028", 4, 1, 3, 2.8),
    ("I0015221", "Cystatin C Reagent - Gentian (Beckman) - (300T) - (B08179)", "300T", "NA", 0, 0, 0, 0),
]


def login(session):
    r = session.post(f"{BACKEND_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    r.raise_for_status()
    return r.json()["token"]


def main():
    import csv
    import io

    session = requests.Session()
    token = login(session)
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1: Import all items from Excel with original barcodes
    print("Step 1: Importing items from Excel with original Item Codes...")
    import openpyxl
    wb = openpyxl.load_workbook("Lab Inventory Optimized.xlsx")
    ws = wb.active
    csv_buf = io.StringIO()
    writer = csv.DictWriter(csv_buf, fieldnames=["barcode", "name", "qty", "lot", "expiry", "unit", "min_stock", "location", "storage", "cost"])
    writer.writeheader()
    count = 0
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, values_only=True):
        test_name = row[1]
        if not test_name or not str(test_name).strip():
            continue
        item_code = row[3]
        if not item_code:
            continue
        barcode = str(int(item_code)) if isinstance(item_code, float) else str(item_code)
        unit = row[2] if row[2] else "unit"
        writer.writerow({
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
        count += 1
    r = session.post(f"{BACKEND_URL}/api/import", json={"text": csv_buf.getvalue()}, headers=headers)
    result = r.json()
    print(f"  Items imported: {result.get('imported')}, errors: {len(result.get('errors', []))}")

    # Step 2: Stock in total available (opening + indent + received - sent) and record consumption
    print(f"\nStep 2: Stocking total available and recording consumption for {len(CONSUMPTION_DATA)} items...")
    stockin_errors = []
    use_errors = []
    for item_code, name, unit, expiry, total_avail, used, closing, stock_months in CONSUMPTION_DATA:
        # Stock in total available quantity
        if total_avail > 0:
            r = session.post(f"{BACKEND_URL}/api/stock-in", json={
                "barcode": item_code,
                "qty": float(total_avail),
                "lot": f"AUG26-{item_code}",
                "expiry": expiry if expiry != "NA" else "",
                "name": name,
                "unit": unit,
                "min_stock": 0,
                "location": "",
                "storage": "Ambient",
                "cost": 0,
            }, headers=headers)
            if r.status_code != 200:
                stockin_errors.append(f"{item_code}: {r.text[:100]}")

        # Record consumption (use)
        if used > 0:
            r = session.post(f"{BACKEND_URL}/api/use", json={
                "barcode": item_code,
                "qty": float(used),
            }, headers=headers)
            if r.status_code != 200:
                use_errors.append(f"{item_code}: {r.text[:100]}")

    print(f"  Stock-in errors: {len(stockin_errors)}")
    print(f"  Use errors: {len(use_errors)}")
    if stockin_errors:
        for e in stockin_errors[:5]:
            print(f"    {e}")
    if use_errors:
        for e in use_errors[:5]:
            print(f"    {e}")

    # Step 3: Verify a few items
    print("\nStep 3: Verifying sample items...")
    for item_code, name, unit, expiry, total_avail, used, closing, stock_months in CONSUMPTION_DATA[:5]:
        r = session.post(f"{BACKEND_URL}/api/resolve", json={"barcode": item_code}, headers=headers)
        if r.status_code == 200:
            data = r.json()
            total = data.get("total", 0)
            expected = closing
            match = "OK" if abs(total - expected) < 0.01 else f"MISMATCH (expected {expected})"
            print(f"  {item_code}: total={total} {match}")

    print("\nDone!")


if __name__ == "__main__":
    main()
