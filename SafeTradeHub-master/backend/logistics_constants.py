# --- SAFE SHIP LOGISTICS CONSTANTS ---

LOGISTICS_STATES = [
    'pending',                      # Order Placed
    'received_at_seller_hub',       # Scan 1: Seller Hub
    'verified',                     # Verification complete
    'in_transit',                   # Moving between hubs
    'arrived_at_dest_hub',          # Scan 2: Destination Hub
    'out_for_delivery',             # Scan 3: Out for delivery
    'delivered'                     # Final: Delivered
]

PAKISTAN_HUBS = [
    "Karachi Central Hub",
    "Lahore Regional Hub",
    "Islamabad Federal Hub",
    "Faisalabad Textiles Hub",
    "Sialkot Industrial Hub",
    "Peshawar Frontier Hub",
    "Quetta Western Hub",
    "Multan Southern Hub"
]

STATUS_DISPLAY_NAMES = {
    'pending': 'Order Placed',
    'received_at_seller_hub': 'Received at Origin Hub',
    'verified': 'Verified & Sealed',
    'in_transit': 'In Transit',
    'arrived_at_dest_hub': 'Arrived at Destination Hub',
    'out_for_delivery': 'Out for Delivery',
    'delivered': 'Delivered'
}

STATUS_DESCRIPTIONS = {
    'pending': 'Seller has been notified to drop off the package at the nearest hub.',
    'received_at_seller_hub': 'Package has been received at the origin hub and is awaiting verification.',
    'verified': 'SafeTradeHub staff has verified the item matches the listing. Package is now sealed for security.',
    'in_transit': 'Package is currently moving towards the destination city hub.',
    'arrived_at_dest_hub': 'Package has reached the destination hub and is being assigned to a local courier.',
    'out_for_delivery': 'A SafeTradeHub local partner is on their way to your delivery address.',
    'delivered': 'Package has been successfully handed over. Escrow funds have been released to the seller.'
}
