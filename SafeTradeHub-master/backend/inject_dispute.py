from app import db
import time

dispute_data = {
    "orderId": "ORD-7X8F9A",
    "reportedBy": "user-abcdef12345",
    "complainantName": "John Doe",
    "reason": "Item arrived completely damaged, and the seller stops responding.",
    "status": "open",
    "priority": "high",
    "createdAt": int(time.time() * 1000)
}

try:
    db.reference('disputes').push(dispute_data)
    print("Test dispute successfully injected into Firebase RTDB!")
except Exception as e:
    print(f"Error: {e}")
