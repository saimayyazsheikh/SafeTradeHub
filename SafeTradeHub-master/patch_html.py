import os
import glob

workspace = r"c:\Users\Saim\Desktop\SafeTradeHub\SafeTradeHub\SafeTradeHub\SafeTradeHub-master\templates"
files_to_patch = [
    "dashboard.html",
    "orders.html",
    "seller-profile.html",
    "wallet.html",
    "settings.html",
    "profile.html",
    "product-management.html",
    "messages.html",
    "cart.html",
    "checkout.html",
    "orderstatus.html"
]

target_str = '<script src="/static/js/header-manager.js"></script>'
replacement_str = '<script src="/static/js/header-manager.js"></script>\n  <script src="/static/js/notification-manager.js"></script>'

for filename in files_to_patch:
    filepath = os.path.join(workspace, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if 'notification-manager.js' not in content:
            if target_str in content:
                content = content.replace(target_str, replacement_str)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Patched {filename}")
            else:
                print(f"Target string not found in {filename}")
        else:
            print(f"Already patched {filename}")
    else:
        print(f"File not found: {filename}")
