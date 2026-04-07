import os

path = r"c:\Users\Saim\Desktop\SafeTradeHub\SafeTradeHub\SafeTradeHub\SafeTradeHub-master\database.rules.json"
with open(path, "r", encoding="utf-8") as f:
    content = f.read().strip()

# Find the last two closing braces and insert before them
if content.endswith("}"):
    # Find second to last '}'
    idx = content.rfind("}", 0, content.rfind("}"))
    
    rules_to_add = """
        "reviews": {
            ".read": true,
            ".indexOn": ["targetId", "productId", "reviewerId"],
            ".write": false
        },
        "reports": {
            ".read": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'Admin' || root.child('staff_registry').child(auth.uid).exists())",
            ".write": "auth != null",
            ".indexOn": ["targetId", "status", "timestamp"]
        }\n"""
    
    new_content = content[:idx].strip()
    if new_content.endswith(","):
        new_content += rules_to_add
    else:
        new_content += "," + rules_to_add
    
    new_content += "    }\n}"

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Database rules patched successfully.")
else:
    print("Could not find ending of file.")
