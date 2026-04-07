from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import firebase_admin
from firebase_admin import credentials, auth
from services.ai_service import AIService
from services.price_comparison.scraper import DarazScraper, OLXScraper
from services.price_comparison.matcher import SmartMatcher
from services.price_comparison.analytics import PriceAnalytics
from werkzeug.utils import secure_filename

# --- Configuration ---
app = Flask(__name__, 
            static_folder='../static',
            template_folder='../templates')
CORS(app)

# Initialize Firebase
# Initialize Firebase
import json
from dotenv import load_dotenv

load_dotenv() # Load .env file

cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'service-account.json')
firebase_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

if firebase_json:
    try:
        cred_dict = json.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        print("Firebase initialized from environment variable.")
    except Exception as e:
        print(f"Error loading Firebase from env: {e}")
elif os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    print("Firebase initialized from service-account.json file.")
else:
    print("Warning: No credentials found (Env or File). Firebase features will fail.")

from services.price_comparison.mock_scraper import MockScraper

# Initialize Services
# Determine credential source for AI Service
if firebase_json:
    try:
        ai_cred_source = json.loads(firebase_json)
    except:
        ai_cred_source = cred_path
else:
    ai_cred_source = cred_path

ai_service = AIService(ai_cred_source)
daraz_scraper = DarazScraper()
olx_scraper = OLXScraper()
# mock_scraper = MockScraper() # Disabled as per user request
matcher = SmartMatcher()
analytics = PriceAnalytics()

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<path:filename>')
def serve_html(filename):
    if filename.endswith('.html'):
        try:
            return render_template(filename)
        except Exception:
            return "Page not found", 404
    return "Not found", 404

# --- API: Auth ---
@app.route('/api/auth/verify', methods=['POST'])
def verify_token():
    """Verify Firebase ID Token"""
    token = request.json.get('token')
    try:
        decoded_token = auth.verify_id_token(token)
        return jsonify({'success': True, 'uid': decoded_token['uid']})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 401

# --- API: AI Verification ---
@app.route('/api/verify-image', methods=['POST'])
def verify_image_api():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    content = file.read()
    
    result = ai_service.verify_image(content)
    return jsonify(result)

# --- API: Price Comparison ---
@app.route('/api/compare-prices', methods=['POST'])
def compare_prices_api():
    data = request.json
    title = data.get('title')
    
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    print(f"--- Starting Price Comparison for: {title} (Original Logic) ---")
    
    # Simple Sequential Scraping (Native to original module)
    d_results = daraz_scraper.search(title)
    o_results = olx_scraper.search(title)
    all_results = d_results + o_results
    
    # Match & Analyze
    matched = matcher.filter_matches(title, all_results)
    insights = analytics.analyze(matched)
    
    print(f"Returning {len(matched)} matched results.")
    
    return jsonify({
        'results': matched,
        'insights': insights
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
