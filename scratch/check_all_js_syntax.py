import os
import sys

def check_js_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check brace count
    open_braces = content.count('{')
    close_braces = content.count('}')
    
    if open_braces != close_braces:
        print(f"[ERROR] Mismatched braces in {file_path}: {open_braces} open vs {close_braces} close")
        return False
    return True

def main():
    root = r"d:\Projects\Anchor"
    js_files = []
    for r, d, files in os.walk(root):
        if ".git" in r or "node_modules" in r:
            continue
        for f in files:
            if f.endswith(".js") and f != "bundle.js" and f != "bundle.js.backup":
                js_files.append(os.path.join(r, f))
    
    all_ok = True
    for jf in js_files:
        if not check_js_file(jf):
            all_ok = False
    
    if all_ok:
        print(f"[OK] Checked {len(js_files)} JS files. Zero mismatched braces!")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
