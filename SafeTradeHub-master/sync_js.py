import re

admin_js_path = 'static/js/admin-dashboard.js'
staff_js_path = 'static/js/staff-dashboard.js'

with open(admin_js_path, 'r', encoding='utf-8') as f:
    admin_js = f.read()

# Helper to extract a function's full code
def extract_function(name, is_async=False):
    prefix = 'async ' if is_async else ''
    start_str = f'{prefix}function {name}('
    idx = admin_js.find(start_str)
    if idx == -1: return ""
    
    # Simple brace matching
    open_braces = 0
    in_string = False
    str_char = ''
    i = idx
    started = False
    
    while i < len(admin_js):
        char = admin_js[i]
        
        # handle strings to avoid counting braces inside them
        if char in ["'", '"', '`'] and (i == 0 or admin_js[i-1] != '\\'):
            if not in_string:
                in_string = True
                str_char = char
            elif char == str_char:
                in_string = False
                
        if not in_string:
            if char == '{':
                open_braces += 1
                started = True
            elif char == '}':
                open_braces -= 1
                if started and open_braces == 0:
                    return admin_js[idx:i+1]
        i += 1
    return ""

functions_to_extract = [
    ('updateUsersTable', False),
    ('updateOrdersTable', True),
    ('updateProductsTable', False),
    ('updateVerificationTable', False),
    ('getStatusBadgeColor', False)
]

extracted_code = ""

for func_name, is_async in functions_to_extract:
    code = extract_function(func_name, is_async)
    # Replace references to adminData with staffData
    code = code.replace("adminData", "staffData")
    extracted_code += code + "\n\n"

# In staff-dashboard.js we need to intercept loadUsers, loadOrders etc. to populate staffData and call these.
# Alternatively, we can just replace the whole module loaders in staff-dashboard.js!
# Let's extract the load functions too!
loaders_to_extract = [
    ('loadUsersData', True),
    ('loadOrdersData', True),
    ('loadProductsData', True),
    ('loadVerificationData', True)
]

for func_name, is_async in loaders_to_extract:
    code = extract_function(func_name, is_async)
    code = code.replace("adminData", "staffData")
    # Quick fix for verification table naming
    code = code.replace("updateElementText('verificationsCount", "// updateElementText('verificationsCount")
    extracted_code += code + "\n\n"

# Now we need to update staff-dashboard.js switch statement to call these instead.
with open(staff_js_path, 'r', encoding='utf-8') as f:
    staff_js = f.read()

# Add staffData arrays if missing
if 'let staffData = {' not in staff_js:
    # staffData is declared in auth.js mostly, but we can ensure arrays exist
    init_code = """
window.staffData = window.staffData || {};
staffData.users = staffData.users || [];
staffData.orders = staffData.orders || [];
staffData.products = staffData.products || [];
staffData.verifications = staffData.verifications || [];

// Helper from admin
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}
function showLoading(section) {
    const el = document.getElementById(section+'-section');
    if(el) {
        // basic loading indicator
    }
}
function hideLoading(section) {}
function showError(msg) { console.error(msg); }
"""
    extracted_code = init_code + extracted_code


# Replace loadModuleData calls
replacements = {
    "case 'users': loadUsers(); break;": "case 'users': loadUsersData(); break;",
    "case 'verification': loadVerifications(); break;": "case 'verification': loadVerificationData(); break;",
    "case 'products': loadAllProducts(); break;": "case 'products': loadProductsData(); break;",
    "case 'orders': loadOrders(); break;": "case 'orders': loadOrdersData(); break;"
}

for old, new in replacements.items():
    staff_js = staff_js.replace(old, new)


# Append our extracted code to the end of staff-dashboard.js
with open('static/js/staff-dashboard.js', 'w', encoding='utf-8') as f:
    f.write(staff_js + "\n\n/* --- SYNCED FROM ADMIN --- */\n" + extracted_code)

print("Synchronized rendering logic!")
