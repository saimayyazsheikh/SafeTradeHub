from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import random

# If app.py is under safetradehub/, this points to safetradehub/static
app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(__file__), "static"),
    static_url_path="/static",
)
# Allow your web page (same-origin or external) to call /chat
CORS(app, resources={r"/chat": {"origins": "*"}})

# -----------------------------
# FAQ KNOWLEDGE
# -----------------------------
GREETINGS = [
    "Hi there! How can I assist you today?",
    "Hello! How can I help you with your trade?",
    "Hey! Need help with Safe Trade Hub?",
]

FAREWELLS = [
    "Goodbye! Feel free to reach out if you need help again.",
    "See you later! Have a safe trade!",
    "Take care! I'm here if you have more questions.",
]

DEFAULTS = [
    "I'm not sure about that. Could you rephrase or ask something else?",
    "Sorry, I didn’t quite catch that. Try asking about account, fees, delivery, refunds, or support.",
    "I’m still learning. Ask me about creating an account, payments, delivery, or reporting a seller.",
]

# Each rule: (trigger phrases..., response)
FAQ_RULES = [
    ((
        "how do i create an account",
        "how do i create account",
        "how to create an account",
        "how to create account",
        "create an account",
        "create account",
        "sign up",
        "signup",
        "register",
        "register account",
        "open account",
        "make account",
      ),
      "To create an account, click **Join** on the homepage, enter your email and a strong password, then verify your email. You’ll get full access after verification."
    ),

    ((
        "what do i need to register",
        "what do i need",
        "requirements",
        "register requirements",
        "needed to register",
        "documents to register",
      ),
      "You’ll need: a valid email, a strong password, your basic details (name & contact), and optionally a phone number for 2-step verification (recommended)."
    ),

    (("fees", "commission", "charges", "costs", "pricing"),
     "Safe Trade Hub doesn’t charge buyers a service fee. Sellers may pay a small commission on completed sales and optional **Trade Pro** subscription fees for extra features."),

    (("payment", "escrow", "pay", "methods", "cards", "wallet"),
     "Payments are handled via our **Escrow** system to keep funds safe until delivery is confirmed. Supported methods include major cards and bank transfers (availability varies by region)."),

    (("delivery", "shipping", "how long", "arrival", "ship time", "dispatch"),
     "Delivery times depend on the seller and your location. Typical domestic orders arrive in **2–6 business days**; international shipping varies. Track updates from your Orders page."),

    (("refund", "return", "cancel", "cancellation"),
     "If your item isn’t as described or doesn’t arrive, open a dispute from the order page within the protection window. Our Escrow will refund you once the issue is verified."),

    (("report seller", "report a seller", "scam", "fraud", "abuse"),
     "Go to the seller’s profile → **Report**. Provide order ID, screenshots, and a short description. Our Trust & Safety team will review and may hold funds in Escrow during investigation."),

    (("verify seller", "trusted seller", "badge", "verification"),
     "Sellers can earn a **Trusted Seller** badge by completing KYC, maintaining high ratings, and low dispute rates. Buyers can filter listings by Trusted Sellers for extra confidence."),

    (("support", "contact", "help center", "email support", "customer care"),
     "Reach support via **Help Center → Contact Support** or email **support@safetradehub.com**. Response time is usually under 24 hours."),

    (("trade pro", "subscribe", "pro plan", "membership"),
     "**Trade Pro** includes verified badge boost, priority listing, bulk tools, and analytics. Subscribe from your Account → **Trade Pro**. You can cancel anytime in billing settings."),

    (("reset password", "forgot password", "change password"),
     "Click **Sign In → Forgot password?** Enter your email and follow the link we send to set a new password."),

    (("track order", "order status", "where is my order"),
     "Open **My Orders** to see live status and tracking (when provided by the seller)."),

    (("privacy", "security", "data protection", "safe"),
     "We use encrypted connections and store payments in **Escrow** until you confirm delivery. See **Privacy & Security** in the footer for full details."),
]

def best_match(text: str) -> str:
    """Pick the response whose trigger phrases match the input best."""
    s = (text or "").lower().strip()
    if not s:
        return random.choice(DEFAULTS)

    if any(g in s for g in ("hello", " hi", "hi ", "hey")):
        return random.choice(GREETINGS)
    if any(b in s for b in ("bye", "goodbye", "see you", "later")):
        return random.choice(FAREWELLS)

    top_score, top_resp = 0, None
    for triggers, resp in FAQ_RULES:
        score = sum(1 for phrase in triggers if phrase in s)
        if score > top_score:
            top_score, top_resp = score, resp

    return top_resp if top_score > 0 else random.choice(DEFAULTS)

# -----------------------------
# ROUTES
# -----------------------------
@app.route("/chatbot")
def chatbot_page():
    # Serves safetradehub/static/chatbot.html
    return send_from_directory(app.static_folder, "chatbot.html")

@app.route("/")
def home():
    return "Welcome to Safe Trade Hub Chatbot! How can I assist you today?"

@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    user_input = data.get("message", "")
    return jsonify({"response": best_match(user_input)})

@app.route("/favicon.ico")
def favicon():
    try:
        return send_from_directory(app.static_folder, "favicon.ico")
    except Exception:
        return ("", 204)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
