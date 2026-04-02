import os

path = r"c:\Users\Saim\Desktop\SafeTradeHub\SafeTradeHub\SafeTradeHub\SafeTradeHub-master\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "# 1. Verify Order Status (Case-insensitive and allow completed)" in line:
        new_lines.append("        # 1. Verify Order Status\n")
        new_lines.append("        order_ref = db.reference(f'orders/{order_id}')\n")
        new_lines.append("        order = order_ref.get()\n")
        new_lines.append("        if not order:\n")
        new_lines.append("             return jsonify({'success': False, 'error': 'Order not found'}), 404\n")
        new_lines.append("\n")
        new_lines.append("        status = str(order.get('status', '')).lower()\n")
        new_lines.append("        if status not in ['delivered', 'completed']:\n")
        new_lines.append("            return jsonify({'success': False, 'error': f'Order must be delivered or completed to review (Current status: {status})'}), 400\n")
        skip = True
        continue
    if skip:
        if "if status not in ['delivered', 'completed']:" in line:
            # We skip the next line after this too
            pass
        elif "return jsonify({'success': False, 'error': f'Order must be delivered or completed to review (Current status: {status})'}), 400" in line:
            skip = False
        continue
    new_lines.append(line)

with open(path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Patch applied successfully.")
