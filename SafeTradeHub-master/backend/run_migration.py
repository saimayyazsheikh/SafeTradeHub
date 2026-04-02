import os
import json
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

import firebase_admin
from firebase_admin import credentials, db

cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'service-account.json')
firebase_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

try:
    if firebase_json:
        cred_dict = json.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
        })
    elif os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
        })
except ValueError:
    pass

users_ref = db.reference('users')
users = users_ref.get()
if users:
    wallets_ref = db.reference('wallets')
    migrated_count = 0
    for str_uid, user_data in users.items():
        if isinstance(user_data, dict) and 'wallet' in user_data:
            lw = user_data['wallet']
            if isinstance(lw, dict):
                bal = float(lw.get('balance', 0))
                if bal > 0:
                    current = wallets_ref.child(str_uid).get()
                    if not current or current.get('available_balance', 0) == 0:
                        wallets_ref.child(str_uid).set({
                            'available_balance': bal,
                            'in_escrow': float(lw.get('escrow', 0) or 0),
                            'total_withdrawn': float(lw.get('totalSpent', 0) or 0),
                            'total_deposited': float(lw.get('totalDeposited', 0) or 0)
                        })
                        migrated_count += 1
                        print(f"Migrated UID: {str_uid} - Balance: {bal}")
    print(f"Migration completed. Total migrated: {migrated_count}")
