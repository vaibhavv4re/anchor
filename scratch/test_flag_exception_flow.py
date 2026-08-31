import json

with open("businessos/platform/accounting/accountingProjectionService.js", "r", encoding="utf-8") as f:
    code = f.read()

print("Auditing flagException method in accountingProjectionService.js...")
if "flagException" in code and "this._getUnifiedExceptionsStore" in code:
    print("[OK] flagException uses unified store.")
else:
    print("[FAIL] flagException does NOT use unified store!")

if "proposeResolution" in code and "this._getUnifiedExceptionsStore" in code:
    print("[OK] proposeResolution uses unified store.")
else:
    print("[FAIL] proposeResolution does NOT use unified store!")
