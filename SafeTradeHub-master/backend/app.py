import os
import json
import time
import imaplib
import email
import re
from email.header import decode_header
from datetime import datetime, timedelta
import collections
from dotenv import load_dotenv

# --- Configuration ---
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env'))

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, auth, db
from services.ai_service import AIService
from services.price_comparison.scraper import DarazScraper, OLXScraper
from services.price_comparison.matcher import SmartMatcher
from services.price_comparison.analytics import PriceAnalytics
from logistics_constants import PAKISTAN_HUBS, LOGISTICS_STATES, STATUS_DISPLAY_NAMES, STATUS_DESCRIPTIONS
from werkzeug.utils import secure_filename
from services.nlp_engine import NLPEngine

app = Flask(__name__, 
            static_folder='../static',
            template_folder='../HTML')
CORS(app)

# Initialize Firebase
cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'service-account.json')
firebase_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

if firebase_json:
    try:
        cred_dict = json.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
        
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
        })
    except Exception as e:
        print(f"Error loading Firebase from env: {e}")
elif os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://safetradehub-def1d-default-rtdb.firebaseio.com'
    })
else:
    print("Warning: No credentials found (Env or File). Firebase features will fail.")

from firebase_admin import db

# --- Financial Engine ---
class FeeEngine:
    @staticmethod
    def calculate_escrow(price):
        try:
            p = float(price)
            if p <= 10000:
                fee_pct = 0.02
                min_fee = 50
            elif p <= 50000:
                fee_pct = 0.035
                min_fee = 0
            else:
                fee_pct = 0.05
                min_fee = 0
            
            calculated_fee = p * fee_pct
            return max(calculated_fee, min_fee)
        except Exception as e:
            print(f"Escrow calc error: {e}")
            return price * 0.035

    @staticmethod
    def calculate_base_shipping(product):
        try:
            def to_float(val, default=0):
                try:
                    if val is None or str(val).strip() == "": return default
                    return float(val)
                except: return default

            dims = product.get('dimensions') or {}
            w = to_float(product.get('weight'), 1)
            l = to_float(dims.get('length'), 10)
            wi = to_float(dims.get('width'), 10)
            h = to_float(dims.get('height'), 10)
            f = str(product.get('fragility', 'Standard')).lower()

            weight_score = 20
            if w > 2 and w <= 10: weight_score = 50
            elif w > 10: weight_score = 100

            volume = l * wi * h
            volume_score = 20
            if volume > 10000 and volume <= 50000: volume_score = 50
            elif volume > 50000: volume_score = 100

            fragility_score = 50
            if f == 'solid': fragility_score = 20
            elif f == 'fragile': fragility_score = 100

            avg_score = (weight_score + volume_score + fragility_score) / 3
            if avg_score >= 40 and avg_score <= 70:
                return 500
            elif avg_score > 70:
                return 1000
            else:
                return 250
        except Exception as e:
            print(f"Base ship calc error: {e}")
            return 250

    @staticmethod
    def calculate_total_shipping(base_fee, origin, dest):
        try:
            location_map = {
                "islamabad": "Federal", "karachi": "Sindh", "lahore": "Punjab",
                "multan": "Punjab", "faisalabad": "Punjab", "peshawar": "KPK",
                "quetta": "Balochistan", "rawalpindi": "Punjab", "sialkot": "Punjab",
                "gujranwala": "Punjab", "hyderabad": "Sindh"
            }
            
            origin = str(origin or "").lower().strip()
            dest = str(dest or "").lower().strip()
            
            if not origin or not dest:
                return base_fee
            
            o_prov = next((v for k, v in location_map.items() if k in origin), None)
            d_prov = next((v for k, v in location_map.items() if k in dest), None)
            
            if not o_prov or not d_prov:
                return base_fee
            
            if origin == dest:
                return base_fee
            elif o_prov == d_prov:
                return base_fee + 150
            else:
                return base_fee + 350
        except Exception as e:
            print(f"Total ship calc error: {e}")
            return base_fee

# Initialize Services
ai_cred_source = json.loads(firebase_json) if firebase_json else cred_path
ai_service = AIService(ai_cred_source)
daraz_scraper = DarazScraper()
olx_scraper = OLXScraper()
matcher = SmartMatcher()
analytics = PriceAnalytics()
nlp_engine = NLPEngine()

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

from functools import wraps

# --- Auth Decorators ---
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token or not id_token.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Unauthorized: Bearer token required'}), 401
        
        token = id_token.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token['uid']
            
            # Check role in RTDB
            user_ref = db.reference(f'users/{uid}')
            user_data = user_ref.get()
            
            if user_data and user_data.get('role') == 'Admin':
                return f(*args, **kwargs)
            else:
                return jsonify({'success': False, 'error': 'Forbidden: Admin access only'}), 403
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 401
    return decorated_function

def staff_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token or not id_token.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Unauthorized: Bearer token required'}), 401
        
        token = id_token.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token['uid']
            
            # Check staff registry
            staff_ref = db.reference(f'staff_registry/{uid}')
            staff_data = staff_ref.get()
            
            if staff_data:
                return f(*args, **kwargs)
            else:
                return jsonify({'success': False, 'error': 'Forbidden: Staff access only'}), 403
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 401
    return decorated_function

# --- Helpers ---
def log_audit(action, admin_id, target_id, old_val, new_val, is_logistics=False):
    """Log an administrative action to the audit trail"""
    try:
        audit_ref = db.reference('audit_logs')
        audit_ref.push({
            'action': action,
            'adminId': admin_id,
            'targetId': target_id,
            'oldValue': old_val,
            'newValue': new_val,
            'isLogistics': is_logistics,
            'timestamp': {".sv": "timestamp"}
        })
    except Exception as e:
        print(f"❌ Failed to log audit: {e}")

# --- API: Auth ---
# --- API: Auth Management ---
@app.route('/api/auth/verify', methods=['POST'])
def verify_token():
    """Verify Firebase ID Token"""
    token = request.json.get('token')
    try:
        decoded_token = auth.verify_id_token(token)
        return jsonify({'success': True, 'uid': decoded_token['uid']})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 401

@app.route('/api/auth/delete-user', methods=['POST'])
@admin_required
def delete_user():
    """Permanently delete user from Auth and Database (Admin Utility)"""
    data = request.json
    uid = data.get('uid')
    if not uid:
        return jsonify({'success': False, 'error': 'UID is required'}), 400
    try:
        auth.delete_user(uid)
        db.reference(f'users/{uid}').delete()
        db.reference(f'staff_registry/{uid}').delete()
        return jsonify({'success': True, 'message': 'User permanently deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/auth/nuke-account', methods=['POST'])
def nuke_account():
    """
    Elite User-facing Account Deletion (The "Nuke" Button)
    Deletes user from Firebase Auth and wipes all related data in RTDB.
    """
    token = request.headers.get('Authorization')
    if not token or not token.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized: Bearer token required'}), 401
    
    token = token.split('Bearer ')[1]
    try:
        # 1. Verify Token & Get UID
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        
        

        # 2. Delete user from Firebase Auth
        try:
            auth.delete_user(uid)
            print(f"Auth record wiped for {uid}.")
        except Exception as auth_err:
            print(f"Warning: Auth deletion failed (user might be gone or API error): {auth_err}")

        # 3. Wipe User Node (Contains Profile, Messages, Notifications, Wallet)
        db.reference(f'users/{uid}').delete()
        print(f"User RTDB node wiped for {uid}.")

        # 4. Wipe Staff Registry if applicable
        db.reference(f'staff_registry/{uid}').delete()
        
        # 5. Wipe Products listed by this user (Atomic cleanup)
        products_ref = db.reference('products')
        products_snapshot = products_ref.order_by_child('sellerId').equal_to(uid).get()
        if products_snapshot:
            for pid in products_snapshot.keys():
                db.reference(f'products/{pid}').delete()
            print(f"{len(products_snapshot)} listings deleted for {uid}.")

        return jsonify({
            'success': True, 
            'message': 'Account and all associate data have been permanently removed. Farewell.'
        })

    except Exception as e:
        print(f"Critical error during nuke operation: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/staff/get-email', methods=['POST'])
def get_staff_email():
    """Retrieve staff email by username (Server-side to bypass RTDB rules)"""
    username = request.json.get('username', '').lower()
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
    
    try:
        # Query RTDB using admin privileges
        ref = db.reference('staff_registry')
        snapshot = ref.order_by_child('username').equal_to(username).get()
        
        if snapshot:
            # Snapshot is a dict of {uid: data}
            for uid, data in snapshot.items():
                return jsonify({'success': True, 'email': data.get('email')})
        
        return jsonify({'success': False, 'error': 'Username not found'}), 404
    except Exception as e:
        print(f"Error fetching staff email: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/restore-metadata', methods=['GET', 'POST'])
def restore_metadata():
    """Emergency route to restore deleted category metadata using Admin SDK"""
    try:
        categories = {
            "mobile": {
                "title": "Mobiles & Tablets",
                "fields": [
                    { "id": "brand", "label": "Brand", "type": "text", "placeholder": "e.g. Apple, Samsung", "required": True },
                    { "id": "model", "label": "Model Name", "type": "text", "placeholder": "e.g. iPhone 15 Pro", "required": True },
                    { "id": "storage", "label": "Storage Capacity", "type": "dropdown", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": True },
                    { "id": "ram", "label": "RAM", "type": "dropdown", "options": ["4GB", "6GB", "8GB", "12GB", "16GB"], "required": True },
                    { "id": "condition_score", "label": "Physical Condition (1-10)", "type": "number", "min": 1, "max": 10, "required": True }
                ],
                "hasVariantInventory": True,
                "variantType": "Storage",
                "variants": ["64GB", "128GB", "256GB", "512GB", "1TB"]
            },
            "camera": {
                "title": "Cameras & Photography",
                "fields": [
                    { "id": "brand", "label": "Brand", "type": "text", "placeholder": "e.g. Canon, Sony, Nikon", "required": True },
                    { "id": "type", "label": "Camera Type", "type": "dropdown", "options": ["DSLR", "Mirrorless", "Point & Shoot", "Action Camera"], "required": True },
                    { "id": "resolution", "label": "Resolution (MP)", "type": "number", "required": True },
                    { "id": "shutter_count", "label": "Shutter Count (approx)", "type": "number", "required": False }
                ]
            },
            "computers": {
                "title": "Laptops & Computers",
                "fields": [
                    { "id": "brand", "label": "Brand", "type": "text", "required": True },
                    { "id": "processor", "label": "Processor", "type": "text", "placeholder": "e.g. Intel i7, M2", "required": True },
                    { "id": "ram", "label": "RAM", "type": "dropdown", "options": ["8GB", "16GB", "32GB", "64GB"], "required": True },
                    { "id": "gpu", "label": "Graphics Card", "type": "text", "required": False }
                ],
                "hasVariantInventory": True,
                "variantType": "Configuration",
                "variants": ["Standard", "High-End", "Custom"]
            },
            "electronics": {
                "title": "Other Electronics",
                "fields": [
                    { "id": "brand", "label": "Brand", "type": "text", "required": True },
                    { "id": "type", "label": "Device Type", "type": "text", "placeholder": "e.g. Headphones, Smartwatch", "required": True },
                    { "id": "power_source", "label": "Power Source", "type": "dropdown", "options": ["Battery", "Wired", "Solar"], "required": False }
                ]
            },
            "fashion": {
                "title": "Fashion & Apparel",
                "fields": [
                    { "id": "size", "label": "Size", "type": "dropdown", "options": ["XS", "S", "M", "L", "XL", "XXL"], "required": True },
                    { "id": "material", "label": "Material", "type": "text", "required": True },
                    { "id": "gender", "label": "Gender", "type": "dropdown", "options": ["Men", "Women", "Unisex", "Kids"], "required": True }
                ],
                "hasVariantInventory": True,
                "variantType": "Size",
                "variants": ["S", "M", "L", "XL"]
            },
            "beauty": {
                "title": "Beauty & Personal Care",
                "fields": [
                    { "id": "brand", "label": "Brand", "type": "text", "required": True },
                    { "id": "volume", "label": "Volume/Weight", "type": "text", "placeholder": "e.g. 50ml, 100g", "required": True },
                    { "id": "expiry", "label": "Expiry Date", "type": "text", "placeholder": "MM/YYYY", "required": True }
                ]
            },
            "books": {
                "title": "Books & Media",
                "fields": [
                    { "id": "author", "label": "Author Name", "type": "text", "required": True },
                    { "id": "isbn", "label": "ISBN Number", "type": "text", "required": False },
                    { "id": "format", "label": "Format", "type": "dropdown", "options": ["Hardcover", "Paperback", "E-book", "Audiobook"], "required": True }
                ]
            },
            "furniture": {
                "title": "Furniture & Decor",
                "fields": [
                    { "id": "material", "label": "Primary Material", "type": "text", "placeholder": "e.g. Wood, Metal", "required": True },
                    { "id": "dimensions", "label": "Dimensions (LxWxH)", "type": "text", "required": True },
                    { "id": "color", "label": "Color", "type": "text", "required": True }
                ]
            },
            "home": {
                "title": "Home & Garden",
                "fields": [
                    { "id": "brand", "label": "Brand", "type": "text", "required": True },
                    { "id": "warranty", "label": "Warranty Period", "type": "text", "required": False },
                    { "id": "power", "label": "Power Consumption", "type": "text", "required": False }
                ]
            },
            "automotive": {
                "title": "Automotive & Parts",
                "fields": [
                    { "id": "brand", "label": "Brand/Manufacturer", "type": "text", "required": True },
                    { "id": "compatibility", "label": "Vehicle Compatibility", "type": "text", "placeholder": "e.g. Toyota Corolla 2018", "required": True },
                    { "id": "part_type", "label": "Part Category", "type": "dropdown", "options": ["Engine", "Brakes", "Exterior", "Interior", "Tyres"], "required": True }
                ]
            },
            "gym": {
                "title": "Gym & Fitness Equipment",
                "fields": [
                    { "id": "type", "label": "Equipment Type", "type": "text", "required": True },
                    { "id": "weight_range", "label": "Weight Range (kg)", "type": "text", "required": False },
                    { "id": "brand", "label": "Brand", "type": "text", "required": False }
                ]
            },
            "sports": {
                "title": "Sports & Outdoor Equipment",
                "fields": [
                    { "id": "sport", "label": "Sport Type", "type": "text", "required": True },
                    { "id": "age_group", "label": "Age Group", "type": "dropdown", "options": ["Adult", "Youth", "Child"], "required": True }
                ]
            },
            "toys": {
                "title": "Toys & Games",
                "fields": [
                    { "id": "age_recommendation", "label": "Age Range", "type": "dropdown", "options": ["0-3 years", "3-6 years", "6-12 years", "12+ years"], "required": True },
                    { "id": "brand", "label": "Brand", "type": "text", "required": False }
                ]
            },
            "pets": {
                "title": "Pet Care Products",
                "fields": [
                    { "id": "pet_type", "label": "Target Pet Type", "type": "dropdown", "options": ["Dog", "Cat", "Bird", "Fish", "Other"], "required": True },
                    { "id": "brand", "label": "Brand Name", "type": "text", "required": False }
                ]
            },
            "services": {
                "title": "Professional Services",
                "fields": [
                    { "id": "experience", "label": "Years of Experience (Years)", "type": "number", "required": True },
                    { "id": "delivery_time", "label": "Estimated Delivery Time", "type": "text", "required": True },
                    { "id": "portfolio", "label": "Portfolio Link", "type": "text", "required": False }
                ],
                "isService": True
            }
        }
        
        db.reference('category_metadata').set(categories)
        return "<h1>✅ ALL 15 CATEGORIES Restored Professionally!</h1><p>Mobiles, Automotive, Toys, Electronics, and all others are now configured. Refresh your product upload page.</p>"
    except Exception as e:
        return f"<h1>❌ Restoration Failed</h1><p>{str(e)}</p>", 500

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

# --- API: Staff Profile Persistence Proxy ---
@app.route('/api/v1/staff/profile/update', methods=['POST'])
def update_staff_profile_proxy():
    try:
        data = request.json
        uid = data.get('uid')
        updates = data.get('updates')
        if not uid or not updates:
            return jsonify({'success': False, 'error': 'Missing Fields'}), 400
        # Bypass RTDB rules using Admin SDK
        db.reference(f'staff_registry/{uid}').update(updates)
        return jsonify({'success': True, 'message': 'Profile updated via Admin Proxy'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# --- API: Dispute Resolution ---
@app.route('/api/v1/disputes/update-status', methods=['POST'])
def update_dispute_status():
    """Secure atomic update for disputes, handles transactions for refund/release."""
    data = request.json
    dispute_id = data.get('disputeId')
    new_status = data.get('newStatus')
    resolution_type = data.get('resolutionType')
    staff_id = data.get('staffId')
    justification = data.get('justification')
    token = request.headers.get('Authorization')

    if not all([dispute_id, new_status, staff_id]):
        return jsonify({'success': False, 'error': 'Missing requisite fields.'}), 400

    try:
        if token and token.startswith('Bearer '):
            token = token.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        
        user_ref = db.reference(f'users/{uid}').get()
        staff_ref = db.reference(f'staff_registry/{uid}').get()

        if not staff_ref and (not user_ref or user_ref.get('role') != 'Admin'):
            return jsonify({'success': False, 'error': 'Unauthorized access.'}), 403

        dispute_ref = db.reference(f'disputes/{dispute_id}')
        dispute_data = dispute_ref.get()

        if not dispute_data:
             return jsonify({'success': False, 'error': 'Dispute not found.'}), 404

        old_status = dispute_data.get('status')
        order_id = dispute_data.get('orderId')
        
        update_payload = {
            'status': new_status,
            'updatedAt': {".sv": "timestamp"},
            'lastUpdatedBy': staff_id
        }

        # Pre-fetch order data for notifications and processing
        order_ref = db.reference(f'orders/{order_id}')
        order_data = order_ref.get()
        buyer_id = order_data.get('buyerId') if order_data else None
        seller_id = order_data.get('sellerId') if order_data else None

        # Handle atomic escrow/wallet resolution
        if resolution_type in ['Refund Buyer', 'Release To Seller']:
             if not order_data:
                 return jsonify({'success': False, 'error': 'Associated order not found for transactional resolution.'}), 404
             
             price = float(order_data.get('price', order_data.get('totalAmount', 0)))
             
             if resolution_type == 'Refund Buyer' and buyer_id:
                  # Atomic Update for Buyer Wallet
                  buyer_wallet_ref = db.reference(f'users/{buyer_id}/wallet')
                  def refund_txn(current):
                      if not current: return {'balance': price, 'in_escrow': 0}
                      current['balance'] = (current.get('balance') or 0) + price
                      current['in_escrow'] = max(0, (current.get('in_escrow') or 0) - price)
                      return current
                  buyer_wallet_ref.transaction(refund_txn)

                  update_payload['resolutionSummary'] = f"Refunded {price} tokens to buyer {buyer_id}."
                  db.reference(f'orders/{order_id}/status').set('refunded')
                  send_system_notification(buyer_id, 'Dispute Resolved & Refunded', f'A refund of {price} tokens has been credited to your wallet for order #{order_id}.', 'payment', f'/orders.html#{order_id}')

             elif resolution_type == 'Release To Seller' and seller_id:
                  # Credit Seller
                  seller_wallet_ref = db.reference(f'users/{seller_id}/wallet')
                  def release_txn(current):
                      if not current: return {'balance': price, 'totalEarned': price}
                      current['balance'] = (current.get('balance') or 0) + price
                      current['totalEarned'] = (current.get('totalEarned') or 0) + price
                      return current
                  seller_wallet_ref.transaction(release_txn)

                  # Deduct from Buyer in_escrow
                  if buyer_id:
                      buyer_escrow_ref = db.reference(f'users/{buyer_id}/wallet/in_escrow')
                      def clear_escrow_txn(current):
                          if current is None: return 0
                          return max(0, current - price)
                      buyer_escrow_ref.transaction(clear_escrow_txn)

                  update_payload['resolutionSummary'] = f"Released {price} tokens to seller {seller_id}."
                  db.reference(f'orders/{order_id}/status').set('completed')
                  send_system_notification(seller_id, 'Dispute Resolved & Payment Released', f'Payment of {price} tokens has been released to your wallet for order #{order_id}.', 'payment', '/seller-profile.html')
             
             update_payload['resolutionJustification'] = justification

        dispute_ref.update(update_payload)

        # Notify parties of status change
        if new_status != old_status:
            notif_msg = f"Dispute #{dispute_id} status updated to: {new_status}"
            if buyer_id:
                send_system_notification(buyer_id, 'Dispute Update', notif_msg, 'dispute', f'/disputes.html#{dispute_id}')
            if seller_id:
                send_system_notification(seller_id, 'Dispute Update', notif_msg, 'dispute', f'/disputes.html#{dispute_id}')

        log_audit("update_status", staff_id, dispute_id, {'status': old_status}, {'status': new_status, 'justification': justification, 'resolution': resolution_type})


        return jsonify({'success': True, 'message': 'Dispute updated successfully.'})

    except Exception as e:
        print(f"Error resolving dispute: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/v1/disputes/assign', methods=['POST'])
def assign_dispute():
    data = request.json
    dispute_id = data.get('disputeId')
    assignee_id = data.get('assigneeId')
    staff_id = data.get('staffId')
    token = request.headers.get('Authorization')

    try:
        if token and token.startswith('Bearer '):
            token = token.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']

        dispute_ref = db.reference(f'disputes/{dispute_id}')
        old_data = dispute_ref.get()
        old_assignee = old_data.get('assignedToStaffId') if old_data else None

        dispute_ref.update({
             'assignedToStaffId': assignee_id,
             'assignedAt': {".sv": "timestamp"}
        })

        if assignee_id and assignee_id != old_assignee:
            send_system_notification(assignee_id, 'Dispute Assigned', f"You have been assigned to investigate dispute #{dispute_id}.", 'alert', '/staff-dashboard.html')

        log_audit("assign_dispute", staff_id, dispute_id, {'assignee': old_assignee}, {'assignee': assignee_id})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/v1/disputes/add-investigation-note', methods=['POST'])
def add_note():
    data = request.json
    dispute_id = data.get('disputeId')
    note_text = data.get('noteText')
    staff_id = data.get('staffId')
    token = request.headers.get('Authorization')

    try:
        if token and token.startswith('Bearer '):
            token = token.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)

        notes_ref = db.reference(f'disputes/{dispute_id}/investigationNotes')
        notes_ref.push({
            'text': note_text,
            'staffId': staff_id,
            'timestamp': {".sv": "timestamp"}
        })

        log_audit("add_note", staff_id, dispute_id, None, {'note': note_text})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/reviews/submit', methods=['POST'])
def submit_review():
    """
    Handles peer-to-peer reviews between buyers and sellers.
    Ensures order completion and triggers atomic reputation recalculation.
    """
    data = request.json
    order_id = data.get('orderId')
    rating = data.get('rating')
    comment = data.get('comment')
    reviewer_id = data.get('reviewerId')
    target_id = data.get('targetId')
    product_id = data.get('productId')
    review_type = data.get('type') # Buyer-to-Seller | Seller-to-Buyer

    token = request.headers.get('Authorization')
    if not token or not token.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        token = token.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']
        
        if uid != reviewer_id:
            return jsonify({'success': False, 'error': 'Reviewer mismatch'}), 403

        if not target_id:
            return jsonify({'success': False, 'error': 'Target user ID is missing. This order may have invalid merchant data.'}), 400

        # REAL-TIME ROLE & INTEGRITY CHECKS
        reviewer_data = db.reference(f'users/{uid}').get()
        reviewer_role = (reviewer_data.get('role') if reviewer_data else 'Buyer') or 'Buyer'
        reviewer_role = reviewer_role.lower()

        target_data = db.reference(f'users/{target_id}').get()
        target_role = (target_data.get('role') if target_data else 'Buyer') or 'Buyer'
        target_role = target_role.lower()

        if uid == target_id:
            return jsonify({'success': False, 'error': 'You cannot review yourself.'}), 403

        if reviewer_role == 'seller':
            return jsonify({'success': False, 'error': 'Seller-to-Buyer reviews have been disabled to streamline the marketplace experience.'}), 403

        # 1. Verify Order Status & Ownership
        order_ref = db.reference(f'orders/{order_id}')
        order = order_ref.get()
        if not order:
             return jsonify({'success': False, 'error': 'Order not found'}), 404
             
        # Seller-Specific transactional check
        if reviewer_role == 'seller':
            if order.get('sellerId') != uid:
                return jsonify({'success': False, 'error': 'You can only review buyers who purchased from you.'}), 403
            if order.get('buyerId') != target_id:
                return jsonify({'success': False, 'error': 'Target user mismatch for this order.'}), 403

        status = str(order.get('status', '')).lower()
        if status not in ['delivered', 'completed', 'refunded']:
            return jsonify({'success': False, 'error': f'Order must be delivered, completed, or refunded to review (Current status: {status})'}), 400

        # 2. Check for duplicate review (by this specific reviewer for this order)
        review_ref = db.reference(f'reviews/{order_id}_{reviewer_id}')
        if review_ref.get():
             return jsonify({'success': False, 'error': 'You have already submitted a review for this order'}), 400

        # 3. Write Review
        review_data = {
            'rating': int(rating),
            'comment': comment,
            'reviewerId': reviewer_id,
            'targetId': target_id,
            'productId': product_id,
            'type': review_type,
            'timestamp': {".sv": "timestamp"}
        }
        review_ref.set(review_data)

        # 4. Atomic Reputation Update
        reputation_ref = db.reference(f'users/{target_id}/reputation')
        
        def update_reputation(current_stats):
            if current_stats is None:
                current_stats = {'averageRating': 0.0, 'totalReviews': 0, 'trustScore': 100}
            
            total = current_stats.get('totalReviews', 0)
            avg = current_stats.get('averageRating', 0.0)
            
            new_total = total + 1
            new_avg = ((avg * total) + int(rating)) / new_total
            
            return {
                'averageRating': round(float(new_avg), 2),
                'totalReviews': new_total,
                'trustScore': current_stats.get('trustScore', 100)
            }

        reputation_ref.transaction(update_reputation)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/reports/submit', methods=['POST'])
def submit_report():
    """Flagging fraudulent listings or users for Admin review."""
    data = request.json
    reported_by_id = data.get('reportedById')
    target_id = data.get('targetId')
    target_type = data.get('targetType') # "User" | "Product"
    reason = data.get('reason')
    description = data.get('description')
    
    token = request.headers.get('Authorization')
    try:
        if token and token.startswith('Bearer '):
            token = token.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token['uid']

        if uid == target_id:
            return jsonify({'success': False, 'error': 'You cannot report yourself.'}), 403

        report_ref = db.reference('reports').push()
        report_data = {
            'reportedById': reported_by_id,
            'targetId': target_id,
            'targetType': target_type,
            'reason': reason,
            'description': description,
            'status': 'Pending',
            'timestamp': {".sv": "timestamp"}
        }
        report_ref.set(report_data)
        
        return jsonify({'success': True, 'reportId': report_ref.key})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/v1/orders/update-tracking', methods=['POST'])
@staff_required
def update_tracking():
    """
    Principal Logistics API:
    Updates order status, appends to high-fidelity history, and triggers notifications.
    """
    data = request.json
    order_id = data.get('orderId')
    new_status = data.get('status')
    location = data.get('location')
    note = data.get('note', '')
    staff_id = data.get('staffId', 'Hub-Operator')
    token = request.headers.get('Authorization')

    if not all([order_id, new_status, location]):
        return jsonify({'success': False, 'error': 'Missing requisite fields (orderId, status, location).'}), 400

    if new_status not in LOGISTICS_STATES:
        return jsonify({'success': False, 'error': f'Invalid status: {new_status}'}), 400

    try:
        # 1. Verification of Order
        order_ref = db.reference(f'orders/{order_id}')
        order_snapshot = order_ref.get()
        if not order_snapshot:
            return jsonify({'success': False, 'error': 'Order not found'}), 404
        
        old_status = order_snapshot.get('status', 'pending')
        
        # --- Strict State Machine Check ---
        try:
            current_rank = LOGISTICS_STATES.index(old_status)
            new_rank = LOGISTICS_STATES.index(new_status)
            
            if new_rank <= current_rank:
                return jsonify({
                    'success': False, 
                    'error': f'Invalid State Transition: Order is already at "{STATUS_DISPLAY_NAMES.get(old_status)}". Cannot move back to "{STATUS_DISPLAY_NAMES.get(new_status)}".'
                }), 400
        except ValueError:
            return jsonify({'success': False, 'error': f'Invalid status: {new_status}'}), 400

        # 2. Update Order Status
        order_ref.update({
            'status': new_status,
            'lastLocation': location,
            'updatedAt': {".sv": "timestamp"}
        })

        # 3. Push Tracking History (The "Atma")
        tracking_ref = db.reference(f'tracking_history/{order_id}')
        tracking_ref.push({
            'status': new_status,
            'displayStatus': STATUS_DISPLAY_NAMES.get(new_status, new_status),
            'desc': STATUS_DESCRIPTIONS.get(new_status, ''),
            'location': location,
            'staffId': staff_id,
            'note': note,
            'timestamp': {".sv": "timestamp"}
        })

        # 4. Trigger Notification for Buyer/Seller
        buyer_id = order_snapshot.get('buyerId')
        seller_id = order_snapshot.get('sellerId')
        
        short_id = str(order_id)[-6:]
        friendly_status = STATUS_DISPLAY_NAMES.get(new_status, new_status)
        notif_message = f"Order #{short_id} is now: {friendly_status}"
        
        if buyer_id:
            send_system_notification(buyer_id, 'Shipment Update', notif_message, 'order', f'/orders.html#{order_id}')
        if seller_id:
            send_system_notification(seller_id, 'Shipment Update', notif_message, 'order', f'/orders.html#{order_id}')

        # 5. Log Audit Trail
        log_audit("logistics_update", staff_id, order_id, 
                  {'status': old_status}, 
                  {'status': new_status, 'location': location}, 
                  is_logistics=True)

        return jsonify({
            'success': True, 
            'message': f'Order {order_id} updated to {new_status}',
            'newStatus': new_status
        })

    except Exception as e:
        print(f"❌ Elite Tracking Update failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def send_system_notification(target_uid, title, message, notif_type, link=""):
    """Unified Notification Integration with Setting-Aware Filtering"""
    try:
        if not target_uid: return
        
        # 1. Fetch User Settings
        user_data = db.reference(f'users/{target_uid}').get()
        if not user_data: return
        
        settings = user_data.get('settings', {}).get('notifications', {})
        
        # 2. Add to RTDB In-App Notifications (Always pushed by default, or check 'push'?)
        # For professional experience, Push toggle usually refers to App notifications too.
        if settings.get('push', True) is not False:
            payload = {
                'title': title,
                'message': message,
                'type': notif_type,
                'timestamp': {".sv": "timestamp"},
                'read': False,
                'link': link
            }
            db.reference(f'users/{target_uid}/notifications').push(payload)
            print(f"[PUSH GATEWAY] Dispatched Notification to {target_uid}: {title}")

        # 3. Handle Email Gateway (Strict Filtering)
        if settings.get('email', True) is not False:
            email = user_data.get('email', 'Unknown')
            # Trigger APIs here
            print(f"[EMAIL GATEWAY] Dispatched Email to {email}: {title} | {message}")
            
    except Exception as e:
        print(f"Failed to dispatch system notification constraint: {e}")


def send_admin_notification(title, message, notif_type="system", link="", metadata=None):
    """Send notification to admin/staff global alerts (no user-facing crossover)"""
    try:
        payload = {
            'title': title,
            'message': message,
            'type': notif_type,
            'timestamp': {".sv": "timestamp"},
            'read': False,
            'link': link
        }
        
        if metadata:
            payload['metadata'] = metadata
            
        db.reference('global_notifications/admin_alerts').push(payload)
        print(f"[ADMIN ALERT] Dispatched to global_notifications/admin_alerts: {title}")
        
    except Exception as e:
        print(f"Failed to dispatch admin notification: {e}")


# --- API: Wallet & Financial Engine ---

@app.route('/api/v1/wallet/withdraw', methods=['POST'])
def request_withdrawal():
    """
    Seller-initiated withdrawal request.
    Atomically validates balance and records the request.
    """
    token = request.headers.get('Authorization')
    data = request.json
    amount = float(data.get('amount', 0))
    bank_details = data.get('bankDetails', {})
    
    if not token or not token.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    if amount <= 0:
        return jsonify({'success': False, 'error': 'Invalid amount'}), 400

    if not all([bank_details.get('title'), bank_details.get('accountNumber'), bank_details.get('bankName')]):
        return jsonify({'success': False, 'error': 'Incomplete bank details'}), 400

    try:
        decoded_token = auth.verify_id_token(token.split('Bearer ')[1])
        uid = decoded_token['uid']
        
        # Atomic Balance Check & Status Flagging
        wallet_ref = db.reference(f'users/{uid}/wallet')
        
        def lock_funds_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
            balance = float(current_wallet.get('balance', 0))
            if balance < amount:
                raise ValueError(f"Insufficient funds. Available: RS {balance}")
            
            # Lock funds: Move from balance to in_escrow
            current_wallet['balance'] = balance - amount
            current_wallet['in_escrow'] = float(current_wallet.get('in_escrow', 0)) + amount
            return current_wallet

        try:
            wallet_ref.transaction(lock_funds_transaction)
        except ValueError as ve:
            return jsonify({'success': False, 'error': str(ve)}), 400

        # Create Withdrawal Request
        request_ref = db.reference('withdrawal_requests').push()
        user_name = data.get('userName', 'Seller')
        user_email = data.get('userEmail', '')
        withdraw_method = data.get('method', 'Bank Transfer')
        
        # Details: Bank Name + Account Title + Account Number
        bank_info = data.get('bankDetails', {})
        details_str = f"{bank_info.get('bankName')} | {bank_info.get('title')} | {bank_info.get('accountNumber')}"

        request_data = {
            'userId': uid,
            'userName': user_name,
            'userEmail': user_email,
            'amount': amount,
            'method': withdraw_method,
            'details': details_str,
            'bankDetails': bank_info,
            'status': 'pending',
            'createdAt': {".sv": "timestamp"}
        }
        request_ref.set(request_data)

        # --- DUAL NOTIFICATION ROUTING ---
        
        # Payload A: For the USER (Seller) - user-facing
        send_system_notification(uid,
                                'Withdrawal Requested',
                                f'Your request for RS {amount} is being processed.',
                                'payment', '/wallet.html')
        
        # Payload B: For the ADMIN/STAFF - system-facing (no crossover)
        admin_payload_msg = f"User {user_name} ({user_email}) has requested a withdrawal of RS {amount} via {withdraw_method}."
        send_admin_notification('New Withdrawal Request',
                               admin_payload_msg,
                               'warning', '/admin-dashboard.html#wallet',
                               {'user_id': uid, 'user_name': user_name, 'user_email': user_email,
                                'amount': amount, 'method': withdraw_method, 'request_id': request_ref.key})

        # Log Audit
        log_audit("withdrawal_requested", uid, request_ref.key, None, {'amount': amount})

        # Write to global transactions flat list
        db.reference(f'transactions/{uid}').push({
            'type': 'withdrawal_request',
            'amount': amount,
            'status': 'pending',
            'method': withdraw_method,
            'requestId': request_ref.key,
            'timestamp': {".sv": "timestamp"}
        })

        return jsonify({'success': True, 'requestId': request_ref.key})

    except Exception as e:
        print(f"Withdrawal Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/wallet/complete-withdrawal', methods=['POST'])
@staff_required
def complete_withdrawal():
    """
    Staff-initiated withdrawal completion.
    Atomically deducts balance and closes the request with a slip.
    """
    data = request.json
    request_id = data.get('requestId')
    slip_url = data.get('slipUrl')
    admin_note = data.get('adminNote', '')
    staff_id = data.get('staffId', 'Hub-Operator')

    if not request_id or not slip_url:
        return jsonify({'success': False, 'error': 'Missing requestId or slipUrl'}), 400

    try:
        req_ref = db.reference(f'withdrawal_requests/{request_id}')
        req_data = req_ref.get()
        
        if not req_data:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        
        if req_data.get('status') != 'pending':
            return jsonify({'success': False, 'error': 'Request already processed'}), 400

        uid = req_data.get('userId')
        amount = float(req_data.get('amount', 0))

        # Atomic Balance Deduction
        wallet_ref = db.reference(f'users/{uid}/wallet')
        
        def deduct_balance_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
            escrow = float(current_wallet.get('in_escrow', 0))
            if escrow < amount:
                raise ValueError("Insufficient pending funds")
            
            current_wallet['in_escrow'] = escrow - amount
            current_wallet['total_withdrawn'] = float(current_wallet.get('total_withdrawn', 0)) + amount
            return current_wallet

        try:
            wallet_ref.transaction(deduct_balance_transaction)
        except ValueError as ve:
            return jsonify({'success': False, 'error': str(ve)}), 400

        # Update Request Status
        req_ref.update({
            'status': 'completed',
            'slipUrl': slip_url,
            'proof_url': slip_url,
            'admin_note': admin_note,
            'completedAt': {".sv": "timestamp"},
            'completion_timestamp': {".sv": "timestamp"},
            'completedBy': staff_id
        })

        # Record Transaction for History
        db.reference(f'transactions/{uid}').push({
            'type': 'withdrawal',
            'amount': amount,
            'status': 'completed',
            'proofUrl': slip_url,
            'adminNote': admin_note,
            'requestId': request_id,
            'timestamp': {".sv": "timestamp"}
        })

        # Notify Seller (user-facing)
        send_system_notification(uid, 'Withdrawal Completed',
                                f'Your RS {amount} withdrawal is successful. View slip in your history.',
                                'payment', '/wallet.html')

        # Notify Admin/Staff (system-facing - no crossover)
        send_admin_notification('Withdrawal Completed',
                               f'Staff {staff_id} completed withdrawal request #{request_id} for RS {amount}. Slip uploaded.',
                               'system', '/admin-dashboard.html#wallet',
                               {'request_id': request_id, 'user_id': uid, 'amount': amount, 'staff_id': staff_id})

        log_audit("withdrawal_completed", staff_id, request_id, {'status': 'pending'}, {'status': 'completed', 'slip': slip_url})

        return jsonify({'success': True})

    except Exception as e:
        print(f"Completion Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/wallet/approve-payout', methods=['POST'])
@staff_required
def approve_payout():
    """
    Admin/Staff approves a withdrawal request with mandatory payment proof.
    Atomically deducts pending balance, updates request with proof_url,
    admin_note, completion_timestamp, and creates transaction history.
    """
    data = request.json
    request_id = data.get('requestId')
    proof_url = data.get('proofUrl')
    admin_note = data.get('adminNote', '')
    staff_id = data.get('staffId', 'Hub-Operator')

    if not request_id or not proof_url:
        return jsonify({'success': False, 'error': 'Missing requestId or proofUrl'}), 400

    try:
        req_ref = db.reference(f'withdrawal_requests/{request_id}')
        req_data = req_ref.get()
        
        if not req_data:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        
        if req_data.get('status') != 'pending':
            return jsonify({'success': False, 'error': 'Request already processed'}), 400

        uid = req_data.get('userId')
        amount = float(req_data.get('amount', 0))

        # Atomic Balance Deduction from in_escrow
        wallet_ref = db.reference(f'users/{uid}/wallet')
        
        def deduct_balance_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
            escrow = float(current_wallet.get('in_escrow', 0))
            if escrow < amount:
                raise ValueError("Insufficient pending funds")
            
            current_wallet['in_escrow'] = escrow - amount
            current_wallet['total_withdrawn'] = float(current_wallet.get('total_withdrawn', 0)) + amount
            return current_wallet

        try:
            wallet_ref.transaction(deduct_balance_transaction)
        except ValueError as ve:
            return jsonify({'success': False, 'error': str(ve)}), 400

        # Update Request with proof_url, admin_note, completion_timestamp
        updates = {
            'status': 'completed',
            'proof_url': proof_url,
            'admin_note': admin_note,
            'completion_timestamp': {".sv": "timestamp"},
            'completedBy': staff_id,
            'slipUrl': proof_url  # keep backward compatibility
        }
        req_ref.update(updates)

        # Record Transaction for History
        db.reference(f'transactions/{uid}').push({
            'type': 'withdrawal',
            'amount': amount,
            'status': 'completed',
            'proofUrl': proof_url,
            'adminNote': admin_note,
            'requestId': request_id,
            'timestamp': {".sv": "timestamp"}
        })

        # Notify Seller (user-facing)
        send_system_notification(uid, 'Withdrawal Approved',
                                f'Your withdrawal of RS {amount} has been approved. Check history for the payment slip.',
                                'payment', '/wallet.html')

        # Notify Admin/Staff (system-facing - no crossover)
        send_admin_notification('Withdrawal Approved',
                               f'Staff {staff_id} approved withdrawal request #{request_id} for RS {amount}. Proof uploaded.',
                               'system', '/admin-dashboard.html#wallet',
                               {'request_id': request_id, 'user_id': uid, 'amount': amount, 'staff_id': staff_id})

        log_audit("withdrawal_approved", staff_id, request_id,
                  {'status': 'pending'},
                  {'status': 'completed', 'proof_url': proof_url, 'admin_note': admin_note})

        return jsonify({'success': True})

    except Exception as e:
        print(f"Approve Payout Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/wallet/reject-withdrawal', methods=['POST'])
@staff_required
def reject_withdrawal():
    """
    Staff rejects a withdrawal request.
    Atomically returns locked funds to the user's balance.
    """
    data = request.json
    request_id = data.get('requestId')
    reason = data.get('reason', 'Rejected by staff')
    staff_id = data.get('staffId', 'Hub-Operator')

    if not request_id:
        return jsonify({'success': False, 'error': 'Missing requestId'}), 400

    try:
        # Fetch request details
        request_ref = db.reference(f'withdrawal_requests/{request_id}')
        request_snap = request_ref.get()
        if not request_snap or request_snap.get('status') != 'pending':
            return jsonify({'success': False, 'error': 'Invalid or non-pending request'}), 404

        user_id = request_snap.get('userId')
        amount = float(request_snap.get('amount', 0))

        # Atomic Fund Return
        wallet_ref = db.reference(f'users/{user_id}/wallet')
        
        def return_funds_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
            escrow = float(current_wallet.get('in_escrow', 0))
            balance = float(current_wallet.get('balance', 0))
            
            # Move back from in_escrow to balance
            current_wallet['in_escrow'] = max(0, escrow - amount)
            current_wallet['balance'] = balance + amount
            return current_wallet

        try:
            wallet_ref.transaction(return_funds_transaction)
        except Exception as ve:
            return jsonify({'success': False, 'error': str(ve)}), 400

        # Update Request Status
        request_ref.update({
            'status': 'rejected',
            'rejectionReason': reason,
            'rejectedAt': {".sv": "timestamp"},
            'rejectedBy': staff_id
        })

        # Write to global transactions flat list
        db.reference(f'transactions/{user_id}').push({
            'type': 'withdrawal_rejected',
            'amount': amount,
            'status': 'rejected',
            'reason': reason,
            'requestId': request_id,
            'timestamp': {".sv": "timestamp"}
        })

        # Notify User (user-facing)
        send_system_notification(user_id, 'Withdrawal Rejected',
                                f'Your request for RS {amount} was rejected: {reason}. Funds have been returned to your wallet.',
                                'danger', '/wallet.html')

        # Notify Admin/Staff (system-facing - no crossover)
        send_admin_notification('Withdrawal Rejected',
                               f'Staff {staff_id} rejected withdrawal request #{request_id} for RS {amount}. Reason: {reason}',
                               'system', '/admin-dashboard.html#wallet',
                               {'request_id': request_id, 'user_id': user_id, 'amount': amount, 'staff_id': staff_id, 'reason': reason})

        return jsonify({'success': True})

    except Exception as e:
        print(f"Rejection Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# --- API: Bidding & Auction Engine ---

@app.route('/api/v1/bids/place', methods=['POST'])
def place_bid():
    """
    ELITE BIDDING ENGINE:
    Handles atomic transactions for bid placement, proxy-bidding logic,
    and real-time notifications for outbid events.
    """
    token = request.headers.get('Authorization')
    data = request.json
    product_id = data.get('productId')
    bid_amount = float(data.get('bidAmount', 0))
    max_bid = float(data.get('maxBid', bid_amount)) # Proxy bidding support
    
    if not token or not token.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        decoded_token = auth.verify_id_token(token.split('Bearer ')[1])
        uid = decoded_token['uid']
        
        product_ref = db.reference(f'products/{product_id}')
        product = product_ref.get()
        
        if not product:
            return jsonify({'success': False, 'error': 'Product not found'}), 404
        
        auction = product.get('auction', {})
        if not auction.get('enabled'):
            return jsonify({'success': False, 'error': 'This product is not listed for auction.'}), 400
            
        if product.get('sellerId') == uid:
            return jsonify({'success': False, 'error': 'Sellers cannot bid on their own items.'}), 403

        # ROLE PROTECTION LAYER
        user_role = db.reference(f'users/{uid}/role').get()
        if (user_role or 'Buyer').lower() == 'seller':
            return jsonify({'success': False, 'error': 'Forbidden: Sellers are restricted from bidding on any marketplace items.'}), 403

        # WALLET BALANCE GUARD
        wallet_ref = db.reference(f'users/{uid}/wallet')
        wallet = wallet_ref.get() or {'balance': 0, 'locked_balance': 0}
        available_balance = float(wallet.get('balance', 0))
        
        # DYNAMIC CALCULATION LAYER (Replacing 7% flat)
        shipping_details = data.get('shippingDetails', {})
        dest_city = shipping_details.get('city')
        origin_city = product.get('location') or product.get('sellerOriginCity') or 'Karachi'
        
        escrow_fee = FeeEngine.calculate_escrow(bid_amount)
        base_ship = FeeEngine.calculate_base_shipping(product)
        total_shipping = FeeEngine.calculate_total_shipping(base_ship, origin_city, dest_city)
        
        total_required = bid_amount + escrow_fee + total_shipping
        
        if available_balance < total_required:
            return jsonify({
                'success': False, 
                'error': f'Insufficient Balance: Please add tokens to your wallet to secure this bid. (Required Total with Fees: RS {total_required:,.2f}, Available: RS {available_balance:,.2f})'
            }), 400

        # Save Proxy Shipping Details for future auto-adjustments
        db.reference(f'proxy_bids/{product_id}/{uid}/shippingDetails').set(shipping_details)
        db.reference(f'proxy_bids/{product_id}/{uid}/baseShipping').set(total_shipping)

        # ATOMIC BID TRANSACTION
        def bid_transaction(current_product):
            if current_product is None: return None
            
            # 1. Basic Validation
            curr_auction = current_product.get('auction', {})
            if curr_auction.get('highestBidderId') == uid:
                raise ValueError("You are already the leading bidder.")
            inc = float(curr_auction.get('minIncrement', 100))
            starting = float(curr_auction.get('startingPrice', 0))
            current_highest = float(curr_auction.get('currentHighestBid', 0))
            
            min_required = max(starting, current_highest + inc)
            
            if bid_amount < min_required:
                raise ValueError(f"Bid too low. Minimum required: RS {min_required}")
            
            # 2. Proxy Bidding Logic (Competitive Check)
            # Fetch highest proxy bid from other users
            proxy_ref = db.reference(f'proxy_bids/{product_id}')
            proxies = proxy_ref.get() or {}
            
            highest_other_proxy_val = 0
            highest_other_bidder = None
            
            for other_uid, p_data in proxies.items():
                if other_uid != uid:
                    p_max = float(p_data.get('maxBid', 0))
                    if p_max > highest_other_proxy_val:
                        highest_other_proxy_val = p_max
                        highest_other_bidder = other_uid
            
            # Battle: User Max Bid vs Other Proxy Max Bid
            if max_bid <= highest_other_proxy_val:
                # User loses to an existing proxy
                new_total_bid = min(highest_other_proxy_val, max_bid + inc)
                curr_auction['currentHighestBid'] = new_total_bid
                curr_auction['highestBidderId'] = highest_other_bidder
                curr_auction['bidCount'] = (curr_auction.get('bidCount', 0)) + 1
                
                # Re-calculate Proxy Winner's New Lock
                # Fetch their shipping from proxy node
                proxy_data = proxies.get(highest_other_bidder, {})
                p_ship = float(proxy_data.get('baseShipping', 500))
                p_escrow = FeeEngine.calculate_escrow(new_total_bid)
                
                curr_auction['highestBidderLocked'] = new_total_bid + p_escrow + p_ship
                curr_auction['highestBidderEscrow'] = p_escrow
                curr_auction['highestBidderShipping'] = p_ship
                curr_auction['shippingDetails'] = proxy_data.get('shippingDetails', {})
                
                current_product['auction'] = curr_auction
                return current_product 
            else:
                # User wins or is highest for now
                new_total_bid = max(highest_other_proxy_val + inc, starting, bid_amount)
                curr_auction['currentHighestBid'] = new_total_bid
                curr_auction['highestBidderId'] = uid
                curr_auction['bidCount'] = (curr_auction.get('bidCount', 0)) + 1
                
                # CAPTURE NEW WINNER BREAKDOWN
                new_escrow = FeeEngine.calculate_escrow(new_total_bid)
                curr_auction['highestBidderLocked'] = new_total_bid + new_escrow + total_shipping
                curr_auction['highestBidderEscrow'] = new_escrow
                curr_auction['highestBidderShipping'] = total_shipping
                curr_auction['shippingDetails'] = shipping_details

                current_product['auction'] = curr_auction
                return current_product

        try:
            # 1. Capture Previous State for Atomic Wallet Moves
            old_auction = auction
            old_highest_bidder = old_auction.get('highestBidderId')
            old_highest_bid = float(old_auction.get('currentHighestBid', 0))

            # 2. Execute Product Transaction
            result = product_ref.transaction(bid_transaction)
            if not result:
                return jsonify({'success': False, 'error': 'Bid transaction failed. Possible race condition.'}), 400

            new_highest_bidder = result.get('auction', {}).get('highestBidderId')
            new_highest_bid = float(result.get('auction', {}).get('currentHighestBid', 0))

            # 3. WALLET ENGINE: Lock & Release
            # Path A: User became the new high bidder
            if new_highest_bidder == uid:
                # Release Previous Bidder (if exists and different)
                if old_highest_bidder and old_highest_bidder != uid:
                    prev_wallet_ref = db.reference(f'users/{old_highest_bidder}/wallet')
                    total_to_refund = old_auction.get('highestBidderLocked', old_highest_bid * 1.07)
                    
                    def release_funds(w):
                        if not w: return w
                        w['balance'] = float(w.get('balance', 0)) + total_to_refund
                        w['locked_balance'] = max(0, float(w.get('locked_balance', 0)) - total_to_refund)
                        return w
                    prev_wallet_ref.transaction(release_funds)
                    
                    db.reference(f'transactions/{old_highest_bidder}').push({
                        'type': 'bid_refunded', 'amount': total_to_refund, 'productId': product_id,
                        'description': f'Outbid on {product_id}: Bid + Fees unlocked.', 'timestamp': {".sv": "timestamp"}
                    })
                    send_system_notification(old_highest_bidder, 'Outbid!', f'Your RS {total_to_refund:,.2f} (Bid + Fees) has been returned to your available balance.', 'warning')

                # Lock New Bidder's Funds
                total_to_lock = result.get('auction', {}).get('highestBidderLocked', new_highest_bid * 1.07)
                def lock_new_funds(w):
                    if not w: return w
                    avail = float(w.get('balance', 0))
                    locked = float(w.get('locked_balance', 0))
                    
                    # If updating own bid, refund old first
                    adjustment_refund = old_auction.get('highestBidderLocked', old_highest_bid * 1.07) if old_highest_bidder == uid else 0
                    
                    if (avail + adjustment_refund) < total_to_lock:
                        raise ValueError("Insufficient funds at lock time")
                        
                    w['balance'] = avail + adjustment_refund - total_to_lock
                    w['locked_balance'] = locked - adjustment_refund + total_to_lock
                    return w
                
                try:
                    wallet_ref.transaction(lock_new_funds)
                except ValueError:
                    return jsonify({'success': False, 'error': 'Insufficient balance to secure this bid (including fees).'}), 400

                db.reference(f'transactions/{uid}').push({
                    'type': 'bid_locked', 'amount': total_to_lock, 'productId': product_id,
                    'description': f'Funds locked (Bid + Fees) for auction on {product_id}', 'timestamp': {".sv": "timestamp"}
                })

                # 4. Bid Success Notifications
                send_system_notification(uid, 'Bid Placed Successfully', f'Your bid of RS {new_highest_bid:,.2f} is now active on {product.get("name")}.', 'order', f'/product-detail.html?id={product_id}')
                
                seller_id = product.get('sellerId')
                if seller_id:
                    send_system_notification(seller_id, 'New Bid Received', f'A new bid of RS {new_highest_bid:,.2f} has been placed on your listing: {product.get("name")}.', 'order', f'/product-detail.html?id={product_id}')

            # Path B: User was outbid by a proxy instantly
            elif new_highest_bidder != uid and new_highest_bidder == old_highest_bidder:
                # Previous bidder's lock needs update to the new proxy-triggered price
                total_new_lock = result.get('auction', {}).get('highestBidderLocked', new_highest_bid * 1.07)
                total_old_lock = old_auction.get('highestBidderLocked', old_highest_bid * 1.07)
                
                def update_proxy_lock(w):
                    if not w: return w
                    avail = float(w.get('balance', 0))
                    locked = float(w.get('locked_balance', 0))
                    diff = total_new_lock - total_old_lock
                    w['balance'] = avail - diff
                    w['locked_balance'] = locked + diff
                    return w
                db.reference(f'users/{new_highest_bidder}/wallet').transaction(update_proxy_lock)

            # 4. Final Logs & Response
            # Fetch bidder name for denormalization
            bidder_data = db.reference(f'users/{uid}').get() or {}
            bidder_name = bidder_data.get('displayName') or bidder_data.get('fullName') or 'Anonymous'

            db.reference(f'proxy_bids/{product_id}/{uid}').update({'maxBid': max_bid, 'updatedAt': {".sv": "timestamp"}})
            db.reference(f'bids/{product_id}').push({
                'bidderId': uid, 
                'bidderName': bidder_name, 
                'amount': bid_amount, 
                'maxBidAuto': max_bid, 
                'timestamp': {".sv": "timestamp"}
            })

            if new_highest_bidder == uid:
                send_system_notification(product.get('sellerId'), 'New High Bid!', f'Listing "{product.get("name")}" has a new lead: RS {new_highest_bid}', 'success')
                return jsonify({'success': True, 'message': 'Bid placed and funds secured.', 'currentBid': new_highest_bid})
            else:
                return jsonify({'success': True, 'message': 'Bid placed, but outbid by proxy.', 'currentBid': new_highest_bid, 'outbid': True})

        except ValueError as ve:
            return jsonify({'success': False, 'error': str(ve)}), 400
            
    except Exception as e:
        print(f"Bidding Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/auctions/sell-now', methods=['POST'])
def finalize_auction():
    """
    Seller Decision Hub:
    Finalizes an auction by selecting a specific bidder.
    Moves winner's locked funds to in_escrow and marks product sold.
    """
    token = request.headers.get('Authorization')
    data = request.json
    product_id = data.get('productId')
    winner_uid = data.get('winnerUid')
    winning_bid_amt = float(data.get('amount', 0))

    if not token or not token.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    
    try:
        decoded_token = auth.verify_id_token(token.split('Bearer ')[1])
        seller_uid = decoded_token['uid']
        
        product_ref = db.reference(f'products/{product_id}')
        product = product_ref.get()
        
        if not product or product.get('sellerId') != seller_uid:
            return jsonify({'success': False, 'error': 'Unauthorized or product not found.'}), 403
        
        if product.get('status') == 'Sold':
             return jsonify({'success': False, 'error': 'Product is already sold.'}), 400

        # Security: Check against starting price
        starting_price = float(product.get('auction', {}).get('startingPrice', 0))
        if winning_bid_amt < starting_price:
            return jsonify({'success': False, 'error': f'Security: Cannot finalize for a bid (RS {winning_bid_amt}) lower than the starting price (RS {starting_price}).'}), 400

        # ATOMIC FINALIZATION
        # 1. Update Product Status
        product_ref.update({
            'status': 'Sold',
            'isActive': False,
            'winnerId': winner_uid,
            'finalPrice': winning_bid_amt,
            'soldAt': {".sv": "timestamp"}
        })

        # 2. Fetch Winner Data for Order Record
        winner_profile = db.reference(f'users/{winner_uid}').get() or {}
        winner_name = winner_profile.get('displayName') or winner_profile.get('fullName') or 'Winning Bidder'
        
        # 3. Create Formal Order and Escrow using Standard Firebase Push IDs
        order_ref = db.reference('orders').push()
        order_id = order_ref.key
        
        escrow_ref = db.reference('escrows').push()
        escrow_id = escrow_ref.key
        
        tracking_number = 'STH-' + str(int(time.time() * 1000))[-8:]
        
        # Retrieve precise financial breakdown from auction record
        auction_data = product.get('auction', {})
        shipping_details = auction_data.get('shippingDetails', {})
        escrow_fee = float(auction_data.get('highestBidderEscrow', winning_bid_amt * 0.035))
        shipping_total = float(auction_data.get('highestBidderShipping', winning_bid_amt * 0.05))
        total_to_lock = float(auction_data.get('highestBidderLocked', winning_bid_amt + escrow_fee + shipping_total))

        # Prepare Order Data (Mirroring checkout.html schema)
        order_data = {
            'id': order_id,
            'buyerId': winner_uid,
            'sellerId': seller_uid,
            'sellerName': product.get('sellerName', 'SafeTradeHub'),
            'items': [{
                'id': product_id,
                'title': product.get('name'),
                'name': product.get('name'),
                'price': winning_bid_amt,
                'img': product.get('img') or (product.get('images', [{}])[0].get('url') if product.get('images') else ''),
                'qty': 1,
                'isAuction': True,
                'sellerId': seller_uid,
                'buyerId': winner_uid
            }],
            'buyer': {
                'id': winner_uid,
                'name': shipping_details.get('fullName', winner_name),
                'email': winner_profile.get('email', ''),
                'phone': shipping_details.get('phone', winner_profile.get('phone', 'N/A')),
                'address': shipping_details.get('address', winner_profile.get('address', 'N/A')),
                'city': shipping_details.get('city', winner_profile.get('city', 'N/A'))
            },
            'subtotal': winning_bid_amt,
            'shippingTotal': shipping_total,
            'escrowFee': escrow_fee,
            'total': total_to_lock,
            'totalAmount': total_to_lock,
            'status': 'pending', 
            'paymentMethod': 'wallet_tokens',
            'trackingNumber': tracking_number,
            'courier': 'STH Logistics',
            'escrowId': escrow_id,
            'createdAt': {".sv": "timestamp"},
            'updatedAt': {".sv": "timestamp"}
        }
        
        # Save Order & Escrow
        order_ref.set(order_data)
        escrow_ref.set({
            'id': escrow_id,
            'orderId': order_id,
            'buyerId': winner_uid,
            'sellerId': seller_uid,
            'amount': total_to_lock,
            'status': 'holding',
            'createdAt': {".sv": "timestamp"}
        })
        
        # Link Order to Product
        product_ref.update({'orderId': order_id, 'escrowId': escrow_id})

        # 4. Wallet Transition: locked_balance -> in_escrow
        winner_wallet_ref = db.reference(f'users/{winner_uid}/wallet')
        def transition_to_escrow(w):
            if not w: return w
            locked = float(w.get('locked_balance', 0))
            escrow = float(w.get('in_escrow', 0))
            total_to_move = total_to_lock
            w['locked_balance'] = max(0, locked - total_to_move)
            w['in_escrow'] = escrow + total_to_move
            return w
        
        winner_wallet_ref.transaction(transition_to_escrow)

        # 5. Logging & Notifications
        db.reference(f'transactions/{winner_uid}').push({
            'type': 'auction_win', 'amount': total_to_lock, 'productId': product_id, 'orderId': order_id,
            'description': f'Auction for {product.get("name")} finalized. Order #{order_id} created.',
            'timestamp': {".sv": "timestamp"}
        })

        send_system_notification(winner_uid, 'Auction Won!', 
                                f'Congratulations! You won the auction for "{product.get("name")}" for RS {winning_bid_amt}. Order #{order_id} has been created.', 
                                'success', f'/orders.html')

        # Notify Seller
        send_system_notification(seller_uid, 'Auction Finalized', 
                                f'You have finalized the auction for "{product.get("name")}". Order #{order_id} is now processing.', 
                                'success', f'/orders.html')

        return jsonify({'success': True, 'message': 'Auction finalized successfully. Order created.'})

    except Exception as e:
        print(f"Finalization Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/v1/admin/emails', methods=['GET'])
@admin_required
def get_admin_emails():
    """Fetch recent emails from Gmail using App Password"""
    user = os.getenv('GMAIL_USER')
    password = os.getenv('GMAIL_APP_PASSWORD')
    
    if not user or not password:
        return jsonify({'success': False, 'error': 'Gmail credentials not configured in .env'}), 500

    try:
        # 1. Connect to Gmail IMAP
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(user, password)
        mail.select("inbox")

        # 2. Search for all emails
        status, messages = mail.search(None, "ALL")
        if status != 'OK':
            return jsonify({'success': False, 'error': 'Failed to search messages'}), 500

        # 3. Get list of IDs (latest first)
        email_ids = messages[0].split()
        email_ids.reverse()

        latest_emails = []
        # Fetch the 8 most recent
        for i in range(min(8, len(email_ids))):
            res, msg_data = mail.fetch(email_ids[i], "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    
                    # Extract Sender
                    sender_header = msg.get("From", "Unknown")
                    decoded_sender = decode_header(sender_header)
                    sender_list = []
                    for s, enc in decoded_sender:
                        if isinstance(s, bytes):
                            sender_list.append(s.decode(enc if enc else 'utf-8', errors='ignore'))
                        else:
                            sender_list.append(str(s))
                    sender = "".join(sender_list)
                    
                    # Extract Subject
                    subject_header = msg.get("Subject", "(No Subject)")
                    decoded_subject = decode_header(subject_header)
                    subject_list = []
                    for s, enc in decoded_subject:
                        if isinstance(s, bytes):
                            subject_list.append(s.decode(enc if enc else 'utf-8', errors='ignore'))
                        else:
                            subject_list.append(str(s))
                    subject = "".join(subject_list)
                    
                    # Extract Snippet (Optimized for speed)
                    snippet = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            if part.get_content_type() == "text/plain":
                                try:
                                    content = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                                    snippet = content[:120].replace('\n', ' ').strip() + "..."
                                    break
                                except: pass
                    else:
                        try:
                            content = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
                            snippet = content[:120].replace('\n', ' ').strip() + "..."
                        except: pass

                    # Determine Visual Styles
                    initial = sender[0].upper() if sender else "G"
                    colors = ['#4f46e5', '#10b981', '#f59e0b', '#dc2626', '#3b82f6', '#8b5cf6']
                    color_index = sum(ord(c) for c in sender) % len(colors)
                    
                    latest_emails.append({
                        'id': email_ids[i].decode(),
                        'sender': sender,
                        'initial': initial,
                        'subject': subject,
                        'snippet': snippet,
                        'time': msg['Date'].split(',')[0] if ',' in msg['Date'] else msg['Date'],
                        'unread': False, # IMAP requires separate flags check, assume read for preview
                        'color': colors[color_index]
                    })

        mail.logout()
        return jsonify({'success': True, 'emails': latest_emails})

    except Exception as e:
        print(f"❌ Gmail Fetch Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/admin/emails/<email_id>', methods=['GET'])
@admin_required
def get_admin_email_details(email_id):
    """Fetch full body of a specific email"""
    user = os.getenv('GMAIL_USER')
    password = os.getenv('GMAIL_APP_PASSWORD')
    
    if not user or not password:
        return jsonify({'success': False, 'error': 'Gmail credentials not configured'}), 500

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(user, password)
        mail.select("inbox")

        res, msg_data = mail.fetch(email_id.encode(), "(RFC822)")
        if res != 'OK':
             return jsonify({'success': False, 'error': 'Email not found'}), 404

        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                
                body = ""
                content_type = "text/plain"
                
                if msg.is_multipart():
                    for part in msg.walk():
                        ctype = part.get_content_type()
                        if ctype == "text/html":
                            try:
                                body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                                content_type = "text/html"
                                break
                            except: pass
                        elif ctype == "text/plain" and not body:
                            try:
                                body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                                content_type = "text/plain"
                            except: pass
                else:
                    try:
                        body = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
                        content_type = msg.get_content_type()
                    except: pass

                # Extract Headers again for confirmation
                subject_header = decode_header(msg.get("Subject", "(No Subject)"))
                subject = "".join([s.decode(enc if enc else 'utf-8', errors='ignore') if isinstance(s, bytes) else str(s) for s, enc in subject_header])
                
                from_header = decode_header(msg.get("From", "Unknown"))
                sender = "".join([s.decode(enc if enc else 'utf-8', errors='ignore') if isinstance(s, bytes) else str(s) for s, enc in from_header])

                mail.logout()
                return jsonify({
                    'success': True,
                    'subject': subject,
                    'sender': sender,
                    'date': msg['Date'],
                    'body': body,
                    'content_type': content_type
                })

        return jsonify({'success': False, 'error': 'Failed to parse email'}), 500

    except Exception as e:
        print(f"❌ Gmail Detail Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# --- AI Recommendation & Behavior Tracking ---

@app.route('/api/v1/analytics/trends', methods=['GET'])
def get_trends():
    """
    Returns platform-wide trending keywords (from reviews) and 
    real-time search terms (from search telemetry).
    """
    try:
        # 1. Get AI Review Trends (NLP Analysis)
        trends = nlp_engine.analyze_trends()
        
        # 2. Get Live Search Telemetry (Most popular queries)
        search_ref = db.reference('global_trends/search_terms')
        search_data = search_ref.get() or {}
        
        # Transform search data: { "keyword": count, ... } -> [ { "keyword": "...", "count": X }, ... ]
        search_list = []
        for term, count in search_data.items():
            # De-sanitize characters that were escaped for Firebase
            display_term = term.replace('_', ' ')
            search_list.append({"keyword": display_term, "count": count})
            
        # Sort by popularity
        search_list.sort(key=lambda x: x['count'], reverse=True)
        top_search = search_list[:15] # Top 15 search terms

        return jsonify({
            'success': True,
            'trends': {
                'keywords': trends.get('keywords', []),
                'categories': trends.get('categories', []),
                'search_terms': top_search
            }
        })
    except Exception as e:
        print(f"Analytics API Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/v1/analytics/track-search', methods=['POST'])
def track_search():
    """
    Logs a user's search query to Firebase for personalization.
    """
    try:
        data = request.get_json()
        query = data.get('query', '').strip().lower()
        uid = data.get('uid')
        category = data.get('category')

        if not query and not category:
            return jsonify({'success': False, 'error': 'No query or category provided'}), 400

        # Log search history (User Specific)
        if uid:
            search_ref = db.reference(f'search_history/{uid}')
            new_search = {
                'query': query,
                'category': category,
                'timestamp': time.time() * 1000
            }
            search_ref.push(new_search)
            
            # Keep only last 20 searches to prevent bloating
            history = search_ref.get()
            if history and len(history) > 20:
                keys = sorted(history.keys(), key=lambda x: history[x].get('timestamp', 0))
                for i in range(len(keys) - 20):
                    search_ref.child(keys[i]).delete()

        # Log global trend (Anonymous)
        global_trends_ref = db.reference('global_trends/search_terms')
        if query:
            # Increment frequency of search term
            term_ref = global_trends_ref.child(re.sub(r'[\.#\$\/\[\]]', '_', query))
            term_ref.transaction(lambda current: (current or 0) + 1)

        return jsonify({'success': True})
    except Exception as e:
        print(f"Error tracking search: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
