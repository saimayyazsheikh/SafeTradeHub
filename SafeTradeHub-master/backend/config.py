import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-sfth')
    FIREBASE_CREDENTIALS = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'service-account.json')
