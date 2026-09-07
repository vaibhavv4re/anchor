import subprocess

cmd = ["git", "show", "3afcb7e:restaurantos/frontend/capabilities/inventory/ui/InventoryWorkspaceView.js"]
res = subprocess.run(cmd, capture_output=True, cwd="d:/Projects/Anchor")

if res.returncode == 0:
    target_path = "d:/Projects/Anchor/restaurantos/frontend/capabilities/inventory/ui/InventoryWorkspaceView.js"
    with open(target_path, "wb") as f:
        f.write(res.stdout)
    content = res.stdout.decode('utf-8', errors='ignore')
    print(f"Successfully restored InventoryWorkspaceView.js from commit 3afcb7e ({len(res.stdout)} bytes, {len(content.splitlines())} lines)!")
else:
    print("Failed to checkout file:", res.stderr)
