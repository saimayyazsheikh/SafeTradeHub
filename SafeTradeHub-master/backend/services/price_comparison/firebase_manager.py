import firebase_admin
from firebase_admin import credentials, db
import os

class FirebaseManager:
    def __init__(self):
        self.db_ref = None
        self.initialize_firebase()

    def initialize_firebase(self):
        try:
            # Check if app is already initialized to avoid error on re-init
            if not firebase_admin._apps:
                cred_path = os.environ.get('FIREBASE_CREDENTIALS', 'serviceAccountKey.json')
                db_url = os.environ.get('FIREBASE_DB_URL')
                
                if os.path.exists(cred_path) and db_url:
                    cred = credentials.Certificate(cred_path)
                    firebase_admin.initialize_app(cred, {
                        'databaseURL': db_url
                    })
                    self.db_ref = db.reference('price_comparisons')
                    print("Firebase initialized successfully.")
                else:
                    print("Firebase credentials not found. Skipping initialization.")
        except Exception as e:
            print(f"Error initializing Firebase: {e}")

    def save_search(self, product_data, insights):
        if not self.db_ref:
            return
        
        try:
            # Create a new record
            new_ref = self.db_ref.push()
            new_ref.set({
                'product': product_data,
                'insights': insights,
                'timestamp': {'.sv': 'timestamp'}
            })
        except Exception as e:
            print(f"Error saving to Firebase: {e}")
