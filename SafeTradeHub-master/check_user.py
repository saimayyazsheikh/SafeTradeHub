
import firebase_admin
from firebase_admin import credentials, db
import json
import os
from dotenv import load_dotenv

def find_user_email(username):
    load_dotenv()
    firebase_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    if not firebase_json:
        print("Error: FIREBASE_SERVICE_ACCOUNT_JSON not set")
        return

    try:
        cred_dict = json.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
            })
        
        ref = db.reference('staff_registry')
        snapshot = ref.order_by_child('username').equal_to(username).get()
        
        if snapshot:
            for uid, data in snapshot.items():
                print(f"FOUND: Username {username} has Email: {data.get('email')}")
        else:
            print(f"NOT_FOUND: Username {username} not in registry.")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    find_user_email("saimsthfyp")
