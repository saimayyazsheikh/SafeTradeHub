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
    
    users = db.reference('users').get()
    if users:
        print(f"Found {len(users)} users.")
        for uid, udata in users.items():
            if udata.get('role') == 'Seller':
                print(f"Seller found: {uid}")
    else:
        print("No users found.")

if __name__ == "__main__":
    check()
