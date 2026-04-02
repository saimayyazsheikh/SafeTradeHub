import os

path = r"c:\Users\Saim\Desktop\SafeTradeHub\SafeTradeHub\SafeTradeHub\SafeTradeHub-master\templates\orderstatus.html"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "order.status === 'delivered' ?" in line:
        new_lines.append(line.replace("order.status === 'delivered' ?", "(order.status === 'delivered' || order.status === 'completed') ?"))
    else:
        new_lines.append(line)

with open(path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Orderstatus frontend patched successfully.")
