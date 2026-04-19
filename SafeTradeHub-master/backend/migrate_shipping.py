import firebase_admin
from firebase_admin import credentials, db
import json
import os

def migrate():
    # Path to service account key - looking for it in the workspace
    service_account_path = 'c:/Users/Saim/Desktop/SafeTradeHub/SafeTradeHub-master/SafeTradeHub-master/service-account.json'
    
    if not os.path.exists(service_account_path):
        print(f"Error: Service account key not found at {service_account_path}")
        return

    # Fix corrupted JSON (invalid \q escape)
    with open(service_account_path, 'r') as f:
        content = f.read()
    
    fixed_content = content.replace('\\q', 'q')
    cred_dict = json.loads(fixed_content)
    cred = credentials.Certificate(cred_dict)
    
    # We need the database URL. It's usually in app.py or we can try to find it.
    database_url = "https://safetradehub-def1d-default-rtdb.firebaseio.com"
    
    try:
        firebase_admin.initialize_app(cred, {
            'databaseURL': database_url
        })
        
        print("Connected to Firebase. Fetching products...")
        products_ref = db.reference('products')
        products = products_ref.get()
        
        if not products:
            print("No products found.")
            return

        count = 0
        updates = {}
        
        for pid, pdata in products.items():
            if not pdata: continue
            
            # Skip sold items if we only want to target active listings
            status = pdata.get('status', 'active').lower()
            if status == 'sold':
                continue
                
            current_shipping = pdata.get('shippingCost')
            
            # If shippingCost is not 0, or is missing, or shippingMethod is not standard
            if current_shipping != 0 or pdata.get('shippingMethod') != 'standard':
                updates[f"{pid}/shippingCost"] = 0
                updates[f"{pid}/shippingMethod"] = 'standard'
                count += 1
        
        if updates:
            print(f"Applying updates to {count} products...")
            products_ref.update(updates)
            print("Migration successful.")
        else:
            print("No products required migration.")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    migrate()
