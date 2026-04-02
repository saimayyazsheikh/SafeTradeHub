import firebase_admin
from firebase_admin import credentials, auth, db
import json
import os
from dotenv import load_dotenv

load_dotenv()

firebase_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
if firebase_json:
    cred_dict = json.loads(firebase_json)
    cred = credentials.Certificate(cred_dict)
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
    })

    print("--- Checking staff_registry ---")
    ref = db.reference('staff_registry')
    snapshot = ref.get()
    print(json.dumps(snapshot, indent=2))

    print("\n--- Checking Auth Users ---")
    users_list = auth.list_users()
    for user in users_list.users:
        print(f"UID: {user.uid}, Email: {user.email}, Display Name: {user.display_name}")
else:
    print("No FIREBASE_SERVICE_ACCOUNT_JSON found in .env")
