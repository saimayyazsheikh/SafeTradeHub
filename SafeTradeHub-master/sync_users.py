import os
import json
import firebase_admin
from firebase_admin import credentials, auth, db
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'backend/service-account.json')
firebase_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

if firebase_json:
    cred_dict = json.loads(firebase_json)
    cred = credentials.Certificate(cred_dict)
elif os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
else:
    print("No creds found in env or backend/service-account.json")
    exit(1)

firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
})

print("Fetching auth users...")
auth_users = set()
page = auth.list_users()
while page:
    for user in page.users:
        auth_users.add(user.uid)
    page = page.get_next_page()

print(f"Found {len(auth_users)} users in Auth.")

print("Fetching RTDB users...")
users_ref = db.reference('users')
rtdb_users = users_ref.get()

if rtdb_users:
    print(f"Found {len(rtdb_users)} users in RTDB.")
    deleted = 0
    for uid in rtdb_users.keys():
        if uid not in auth_users:
            print(f"Deleting orphaned user from RTDB: {uid}")
            db.reference(f'users/{uid}').delete()
            db.reference(f'staff_registry/{uid}').delete()
            deleted += 1
    print(f"Cleanup complete. Deleted {deleted} orphaned users.")
else:
    print("No RTDB users.")
