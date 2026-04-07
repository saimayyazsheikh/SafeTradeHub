import os
import json
import time
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

app = Flask(__name__, 
            static_folder='../static',
            template_folder='../templates')
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

# Initialize Services
ai_cred_source = json.loads(firebase_json) if firebase_json else cred_path
ai_service = AIService(ai_cred_source)
daraz_scraper = DarazScraper()
olx_scraper = OLXScraper()
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
                  buyer_wallet_ref = db.reference(f'users/{buyer_id}/wallet/balance')
                  current_bal = buyer_wallet_ref.get() or 0
                  buyer_wallet_ref.set(float(current_bal) + price)
                  update_payload['resolutionSummary'] = f"Refunded {price} tokens to buyer {buyer_id}."
                  db.reference(f'orders/{order_id}/status').set('refunded')
                  send_system_notification(buyer_id, 'Dispute Resolved & Refunded', f'A refund of {price} tokens has been credited to your wallet for order #{order_id}.', 'payment', f'/orders.html#{order_id}')

             elif resolution_type == 'Release To Seller' and seller_id:
                  seller_wallet_ref = db.reference(f'users/{seller_id}/wallet/balance')
                  current_bal = seller_wallet_ref.get() or 0
                  seller_wallet_ref.set(float(current_bal) + price)
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

        # REAL-TIME ROLE & INTEGRITY CHECKS
        reviewer_data = db.reference(f'users/{uid}').get()
        reviewer_role = (reviewer_data.get('role') or 'Buyer').lower()
        target_data = db.reference(f'users/{target_id}').get()
        target_role = (target_data.get('role') or 'Buyer').lower()

        if uid == target_id:
            return jsonify({'success': False, 'error': 'You cannot review yourself.'}), 403

        if reviewer_role == 'seller' and target_role == 'seller':
            return jsonify({'success': False, 'error': 'Peer-to-Peer seller reviews are restricted.'}), 403

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
        if status not in ['delivered', 'completed']:
            return jsonify({'success': False, 'error': f'Order must be delivered or completed to review (Current status: {status})'}), 400

        # 2. Check for duplicate review
        review_ref = db.reference(f'reviews/{order_id}')
        if review_ref.get():
             return jsonify({'success': False, 'error': 'Review already exists for this order'}), 400

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
        
        notif_message = f"Order #{order_id} is now: {STATUS_DISPLAY_NAMES.get(new_status, new_status)}"
        
        if buyer_id:
            send_system_notification(buyer_id, 'Shipment Update', notif_message, 'order', f'/orders.html#{order_id}')
        if seller_id:
            send_system_notification(seller_id, 'Shipment Update', notif_message, 'order', f'/seller-dashboard.html')

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
        wallet_ref = db.reference(f'wallets/{uid}')
        
        def lock_funds_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'available_balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
            balance = float(current_wallet.get('available_balance', 0))
            if balance < amount:
                raise ValueError(f"Insufficient funds. Available: RS {balance}")
            
            # Lock funds: Move from available_balance to in_escrow
            current_wallet['available_balance'] = balance - amount
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
        wallet_ref = db.reference(f'wallets/{uid}')
        
        def deduct_balance_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'available_balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
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
        wallet_ref = db.reference(f'wallets/{uid}')
        
        def deduct_balance_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'available_balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
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
        wallet_ref = db.reference(f'wallets/{user_id}')
        
        def return_funds_transaction(current_wallet):
            if current_wallet is None:
                current_wallet = {'available_balance': 0, 'in_escrow': 0, 'total_withdrawn': 0}
            
            escrow = float(current_wallet.get('in_escrow', 0))
            balance = float(current_wallet.get('available_balance', 0))
            
            # Move back from in_escrow to available_balance
            current_wallet['in_escrow'] = max(0, escrow - amount)
            current_wallet['available_balance'] = balance + amount
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
        wallet_ref = db.reference(f'wallets/{uid}')
        wallet = wallet_ref.get() or {'available_balance': 0, 'locked_balance': 0}
        available_balance = float(wallet.get('available_balance', 0))
        
        if available_balance < bid_amount:
            return jsonify({
                'success': False, 
                'error': f'Insufficient Balance: Please add tokens to your wallet to place this bid. (Required: RS {bid_amount}, Available: RS {available_balance})'
            }), 400

        # ATOMIC BID TRANSACTION
        def bid_transaction(current_product):
            if current_product is None: return None
            
            # 1. Basic Validation
            curr_auction = current_product.get('auction', {})
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
                # Increment the bid by the min increment over the user's max
                new_total_bid = min(highest_other_proxy_val, max_bid + inc)
                curr_auction['currentHighestBid'] = new_total_bid
                curr_auction['highestBidderId'] = highest_other_bidder
                curr_auction['bidCount'] = (curr_auction.get('bidCount', 0)) + 1
                current_product['auction'] = curr_auction
                return current_product 
            else:
                # User wins or is highest for now
                # The bid becomes max(highest_other_proxy_val + inc, starting, bid_amount)
                new_total_bid = max(highest_other_proxy_val + inc, starting, bid_amount)
                curr_auction['currentHighestBid'] = new_total_bid
                curr_auction['highestBidderId'] = uid
                curr_auction['bidCount'] = (curr_auction.get('bidCount', 0)) + 1
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
                    prev_wallet_ref = db.reference(f'wallets/{old_highest_bidder}')
                    def release_funds(w):
                        if not w: return w
                        w['available_balance'] = float(w.get('available_balance', 0)) + old_highest_bid
                        w['locked_balance'] = max(0, float(w.get('locked_balance', 0)) - old_highest_bid)
                        return w
                    prev_wallet_ref.transaction(release_funds)
                    
                    db.reference(f'transactions/{old_highest_bidder}').push({
                        'type': 'bid_refunded', 'amount': old_highest_bid, 'productId': product_id,
                        'description': 'Outbid: Funds unlocked.', 'timestamp': {".sv": "timestamp"}
                    })
                    send_system_notification(old_highest_bidder, 'Outbid!', f'Your RS {old_highest_bid} has been returned to your available balance.', 'warning')

                # Lock New Bidder's Funds
                # If user was already high bidder, we release their OLD bid before locking the NEW one
                def lock_new_funds(w):
                    if not w: return w
                    avail = float(w.get('available_balance', 0))
                    locked = float(w.get('locked_balance', 0))
                    
                    # If updating own bid, refund old first
                    adjustment_refund = old_highest_bid if old_highest_bidder == uid else 0
                    
                    if (avail + adjustment_refund) < new_highest_bid:
                        raise ValueError("Insufficient funds at lock time")
                        
                    w['available_balance'] = avail + adjustment_refund - new_highest_bid
                    w['locked_balance'] = locked - adjustment_refund + new_highest_bid
                    return w
                
                try:
                    wallet_ref.transaction(lock_new_funds)
                except ValueError:
                    # Critical: This shouldn't happen if pre-check passed, but we must handle it
                    return jsonify({'success': False, 'error': 'Insufficient balance to secure this bid.'}), 400

                db.reference(f'transactions/{uid}').push({
                    'type': 'bid_locked', 'amount': new_highest_bid, 'productId': product_id,
                    'description': f'Funds locked for bid on {product_id}', 'timestamp': {".sv": "timestamp"}
                })

            # Path B: User was outbid by a proxy instantly
            elif new_highest_bidder != uid and new_highest_bidder == old_highest_bidder:
                # Previous bidder's lock needs update to the new proxy-triggered price
                def update_proxy_lock(w):
                    if not w: return w
                    avail = float(w.get('available_balance', 0))
                    locked = float(w.get('locked_balance', 0))
                    diff = new_highest_bid - old_highest_bid
                    w['available_balance'] = avail - diff
                    w['locked_balance'] = locked + diff
                    return w
                db.reference(f'wallets/{new_highest_bidder}').transaction(update_proxy_lock)

            # 4. Final Logs & Response
            # Fetch bidder name for denormalization
            bidder_data = db.reference(f'users/{uid}').get() or {}
            bidder_name = bidder_data.get('displayName') or bidder_data.get('fullName') or 'Anonymous'

            db.reference(f'proxy_bids/{product_id}/{uid}').set({'maxBid': max_bid, 'updatedAt': {".sv": "timestamp"}})
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
                'name': winner_name,
                'email': winner_profile.get('email', ''),
                'phone': winner_profile.get('phone', 'N/A'),
                'address': winner_profile.get('address', 'N/A')
            },
            'subtotal': winning_bid_amt,
            'shippingTotal': 0, 
            'escrowFee': winning_bid_amt * 0.02,
            'total': winning_bid_amt + (winning_bid_amt * 0.02),
            'totalAmount': winning_bid_amt + (winning_bid_amt * 0.02),
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
            'amount': winning_bid_amt,
            'status': 'holding',
            'createdAt': {".sv": "timestamp"}
        })
        
        # Link Order to Product
        product_ref.update({'orderId': order_id, 'escrowId': escrow_id})

        # 4. Wallet Transition: locked_balance -> in_escrow
        winner_wallet_ref = db.reference(f'wallets/{winner_uid}')
        def transition_to_escrow(w):
            if not w: return w
            locked = float(w.get('locked_balance', 0))
            escrow = float(w.get('in_escrow', 0))
            w['locked_balance'] = max(0, locked - winning_bid_amt)
            w['in_escrow'] = escrow + winning_bid_amt
            return w
        
        winner_wallet_ref.transaction(transition_to_escrow)

        # 5. Logging & Notifications
        db.reference(f'transactions/{winner_uid}').push({
            'type': 'auction_win', 'amount': winning_bid_amt, 'productId': product_id, 'orderId': order_id,
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
if __name__ == '__main__':
    app.run(debug=True, port=5000)
