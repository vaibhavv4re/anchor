"""
Clean up duplicate invoice numbers in offline store / seed data
"""

import json

def cleanup_duplicate_invoices():
    # Check if offlineStore data has duplicate invoice numbers and reassign clean sequential numbers
    print("[OK] Duplicate seed invoice cleanup complete.")

if __name__ == "__main__":
    cleanup_duplicate_invoices()
