import firebase_admin
from firebase_admin import credentials, db
import json
import os

def check():
    service_account_path = 'c:/Users/Saim/Desktop/SafeTradeHub/SafeTradeHub-master/SafeTradeHub-master/service-account.json'
    with open(service_account_path, 'r') as f:
        content = f.read()
    fixed_content = content.replace('\\q', 'q')
    cred_dict = json.loads(fixed_content)
    cred = credentials.Certificate(cred_dict)
    
    database_url = "https://safetradehub-def1d-default-rtdb.firebaseio.com"
    
    firebase_admin.initialize_app(cred, {
        'databaseURL': database_url
    })
    
    products = db.reference('products').get()
    orders = db.reference('orders').get()
    
    print(f"Products: {len(products) if products else 0}")
    print(f"Orders: {len(orders) if orders else 0}")

if __name__ == "__main__":
    check()
