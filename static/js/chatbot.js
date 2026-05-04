// ========================================
// CHATBOT.JS - Restored & Expanded
// ========================================

class Chatbot {
  constructor() {
    this.container = document.getElementById('chatbot-container');
    this.init();
  }

  init() {
    if (!this.container) return;

    // Inject Styles
    this.addStyles();

    // Inject HTML
    this.renderUI();

    // Setup Logic
    this.setupLogic();
  }

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --brand1: #06b6d4;   /* cyan */
        --brand2: #22c55e;   /* emerald */
        --accent: #7c3aed;   /* violet */
        --chip: #e6f9f4;
      }

      .chatbot-ui {
        width: 100%; 
        height: 100%;
        background: #ffffff;
        display: flex; 
        flex-direction: column; 
        overflow: hidden; 
        position: relative;
        font-family: "Inter", system-ui, -apple-system, sans-serif;
      }

      /* Header */
      .chat-header {
        padding: 16px 18px;
        color: #fff;
        font-weight: 700;
        letter-spacing: .3px;
        display: flex; 
        align-items: center; 
        justify-content: space-between;
        background: linear-gradient(135deg, var(--brand1), var(--brand2));
        border-bottom: 1px solid rgba(255,255,255,.15);
      }
      .header-left { display: flex; align-items: center; gap: 10px; }
      .online-dot {
        width: 10px; height: 10px; border-radius: 999px; background: #fff; opacity: .95;
        box-shadow: 0 0 0 4px rgba(255,255,255,.22);
      }
      .header-btn {
        background: rgba(255,255,255,.18);
        border: 0; color: #fff; width: 34px; height: 34px; border-radius: 12px;
        display: grid; place-items: center; cursor: pointer;
      }

      /* Messages area */
      .messages {
        flex: 1; 
        overflow-y: auto; 
        padding: 16px 14px 12px;
        background: linear-gradient(180deg, rgba(2,6,23,.03), transparent 18%) no-repeat #f6f9fe;
      }
      .msg {
        max-width: 76%; margin: 10px 0; padding: 10px 12px; border-radius: 16px;
        line-height: 1.35; font-size: 14px; position: relative;
        box-shadow: 0 2px 8px rgba(2,6,23,.06);
        word-wrap: break-word;
      }
      .msg.bot {
        background: #ffffff; border: 1px solid rgba(15,23,42,.08);
        border-top-right-radius: 6px;
        margin-right: auto;
        color: #0f172a;
      }
      .msg.user {
        background: linear-gradient(135deg, var(--brand1), var(--accent));
        color: #fff; border-top-left-radius: 6px;
        margin-left: auto;
      }
      .meta {
        margin-top: 6px; font-size: 11px; color: #6b7280;
        opacity: .9; display: block;
      }
      .msg.user .meta { color: rgba(255,255,255,0.8); }

      /* Quick reply chips */
      .chips {
        display: flex; flex-wrap: wrap; gap: 10px; padding: 10px 14px 2px;
        background: #f6f9fe;
      }
      .chip {
        padding: 8px 12px; border-radius: 999px; font-size: 13px; cursor: pointer;
        background: var(--chip); color: #047857; border: 1px solid #a7f3d0;
        transition: transform .06s ease, filter .2s ease;
        user-select: none;
      }
      .chip:hover { filter: brightness(1.03); }
      .chip:active { transform: translateY(1px); }

      /* Input dock */
      .dock {
        background: #fff; border-top: 1px solid rgba(15,23,42,.06);
        padding: 10px 12px; display: flex; align-items: center; gap: 10px;
        position: relative;
      }
      #user-input {
        flex: 1; height: 46px; border-radius: 999px; border: 1px solid rgba(2,6,23,.12);
        padding: 0 14px; font-size: 14px; outline: none;
        background: #eef5ff;
        color: #0f172a;
      }
      #user-input:focus {
        box-shadow: 0 0 0 3px rgba(34,197,94,.18);
        border-color: transparent; background: #fff;
      }
      #sendBtn {
        height: 46px; padding: 0 22px; border: 0; border-radius: 16px;
        color: #fff; font-weight: 700; cursor: pointer;
        background: linear-gradient(135deg, var(--accent), var(--brand1));
        box-shadow: 0 10px 22px rgba(6,182,212,.38);
        transition: transform .06s ease, filter .25s ease;
      }
      #sendBtn:hover { filter: brightness(1.05); }
      #sendBtn:active { transform: translateY(1px) scale(.99); }
      #sendBtn:disabled {
        cursor: not-allowed; opacity: .55; box-shadow: none;
        background: linear-gradient(135deg, #d8d8e7, #d9eef6);
      }
    `;
    document.head.appendChild(style);
  }

  renderUI() {
    this.container.innerHTML = `
      <div class="chatbot-ui">
        <header class="chat-header">
          <div class="header-left">
            <span class="online-dot" aria-hidden="true"></span>
            <div>Safe Trade Hub — Chat</div>
          </div>
          <button class="header-btn" onclick="toggleChat()" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <section class="messages" id="chatlogs" aria-live="polite">
          <div class="msg bot">
            Hello! I’m your assistant. How can I help you today?
            <span class="meta">Just now</span>
          </div>
        </section>

        <div class="chips" id="chips">
          <div class="chip">How do I create an account?</div>
          <div class="chip">Fees & payments</div>
          <div class="chip">Safe Ship & Escrow</div>
          <div class="chip">Delivery time</div>
          <div class="chip">Report a seller</div>
          <div class="chip">Contact support</div>
        </div>

        <div class="dock">
          <input id="user-input" placeholder="Type your message…" autocomplete="off" />
          <button id="sendBtn" type="button">Send</button>
        </div>
      </div>
    `;
  }

  setupLogic() {
    const logs = document.getElementById('chatlogs');
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('sendBtn');
    const chipsWrap = document.getElementById('chips');

    const fmtTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const addMsg = (text, who = 'bot') => {
      const div = document.createElement('div');
      div.className = `msg ${who}`;
      div.innerHTML = text + `<span class="meta">${fmtTime()}</span>`;
      logs.appendChild(div);
      logs.scrollTop = logs.scrollHeight;
    };

    const toggle = () => {
      if (sendBtn && input) sendBtn.disabled = input.value.trim() === '';
    }

    // Local Response Logic
    const getBotResponse = (text) => {
      const lower = text.toLowerCase();

      // --- PRIORITY 1: DISPUTES & REPORTING (Highest priority to avoid 'seller' keyword overlap) ---
      if (lower.includes('report') || lower.includes('dispute') || lower.includes('problem') || lower.includes('issue') || lower.includes('scam') || lower.includes('complaint')) {
        return `<b>Dispute Resolution Process:</b>
        <br>1. Go to <b>Order Details</b> and click <b>'Open Dispute'</b>.
        <br>2. Our Staff reviews the logs and photos from the <b>'Verification Hub'</b>.
        <br>3. <b>Transparency Policy:</b> If the buyer is at fault (remorse/error), a <b>10% Holding Fee</b> is deducted from the refund to cover logistics.
        <br>4. If the seller is at fault, a <b>100% Full Refund</b> is issued to your wallet.`;
      }

      // --- PRIORITY 2: LOGISTICS & TIMELINE ---
      if (lower.includes('how long') || lower.includes('days') || lower.includes('arrive') || lower.includes('arrival') || (lower.includes('delivery') && lower.includes('time'))) {
        return "<b>Delivery Timeline:</b> Typical delivery takes <b>4-7 business days</b>. This window includes secure transit to our hubs and expert manual verification to ensure you get exactly what you paid for.";
      }
      if (lower.includes('track') || lower.includes('status') || lower.includes('where is my') || lower.includes('hub')) {
        return `<b>Safe Ship Tracking Stages:</b>
        <br>1. <b>Origin Hub:</b> Seller drops off the item.
        <br>2. <b>Verification Hub:</b> SafeTradeHub staff inspects and confirms the product.
        <br>3. <b>Destination Hub:</b> Final leg delivery to your doorstep.
        <br>Check your 'Track Shipment' page for real-time updates.`;
      }
      if (lower.includes('calculate') || (lower.includes('shipping') && (lower.includes('fee') || lower.includes('cost') || lower.includes('much')))) {
        return `<b>Shipping Fee Calculation:</b>
        <br>Our AI engine calculates costs based on:
        <br>• <b>Weight:</b> RS 250 (Light) to RS 1,000 (Heavy).
        <br>• <b>Volume:</b> Size (LxWxH).
        <br>• <b>Fragility:</b> Solid, Standard, or Fragile (Impacts insurance).`;
      }

      // --- PRIORITY 3: FINANCIALS & FEES ---
      if (lower.includes('fee') || lower.includes('cost') || lower.includes('charge') || lower.includes('commission') || lower.includes('percent') || lower.includes('%')) {
        return `<b>Tiered Escrow Fees:</b>
        <br>• <b>2% Fee:</b> Products up to RS 10,000.
        <br>• <b>3.5% Fee:</b> Products between RS 10,001 and RS 50,000.
        <br>• <b>5% Fee:</b> Products above RS 50,000.
        <br><i>Fees are strictly calculated on the product subtotal (Price × Quantity), excluding shipping costs. Listing is free!</i>`;
      }
      if (lower.includes('escrow') || lower.includes('hold') || lower.includes('safe') || lower.includes('money')) {
        return "<b>Escrow Protection:</b> Your money is held securely by SafeTradeHub. We only release it to the seller <b>ONLY</b> after the product is <b>Successfully Verified</b> at our hub <b>AND</b> confirmed as <b>Delivered</b> to you.";
      }
      if (lower.includes('wallet') || lower.includes('balance') || lower.includes('withdraw') || lower.includes('payout')) {
        return "<b>Wallet & Payouts:</b> Earnings/Refunds are credited to your Wallet. Sellers can withdraw funds once the Escrow is released (after delivery). Buyers get instant refunds for cancellations or won disputes.";
      }

      // --- PRIORITY 4: BUYING & SELLING ---
      if (lower.includes('auction') || lower.includes('bid') || lower.includes('gavel')) {
        return "<b>Auction Rules:</b> Highest bidder wins. Funds are locked in Escrow automatically when the auction ends. Note: Sellers are strictly prohibited from bidding on their own products.";
      }
      if (lower.includes('how to sell') || lower.includes('post') || lower.includes('list') || lower.includes('add product')) {
        return "<b>Selling Guide:</b> Sign in as a Seller > Click <b>'Add Product'</b>. Choose Fixed Price or Auction. Be sure to provide clear photos for our Hub Verification team.";
      }
      if (lower.includes('buy') || lower.includes('purchase') || lower.includes('cart') || lower.includes('checkout')) {
        return "<b>Buying Guide:</b> Browse items > <b>'Add to Cart'</b> > Checkout. You will see a clear breakdown of Price, Shipping, and Escrow Fees before you pay.";
      }

      // --- PRIORITY 5: ACCOUNT & TRUST ---
      if (lower.includes('verify') || lower.includes('verification') || lower.includes('badge') || lower.includes('id') || lower.includes('identity')) {
        return "<b>Verification Hub:</b> Go to your <b>Profile > Verify Identity</b> to upload your ID. Once manually approved, you get the <b>'Verified'</b> badge, increasing buyer trust and auction limits.";
      }
      if (lower.includes('account') || lower.includes('register') || lower.includes('sign up') || lower.includes('join') || lower.includes('role')) {
        return "<b>Registration:</b> Click <b>'Join'</b> at top right. Choose Buyer or Seller. Note: Sellers cannot purchase items to ensure marketplace integrity.";
      }
      if (lower.includes('password') || lower.includes('login') || lower.includes('reset')) {
        return "<b>Login Help:</b> Use the <b>'Sign In'</b> button. If you've forgotten your password, use the 'Forgot Password' link for a secure email reset.";
      }

      // --- PRIORITY 6: SUPPORT & GREETINGS ---
      if (lower.includes('support') || lower.includes('contact') || lower.includes('email') || lower.includes('help') || lower.includes('admin')) {
        return "<b>Contact Support:</b> Email us at <b>safetradehubteam@gmail.com</b>. Our expert team usually responds within <b>2-4 hours</b> during business days.";
      }
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        return "Hello! 👋 I'm the SafeTradeHub Assistant. I can help with <b>Fees, Escrow, Shipping, Disputes,</b> or <b>Account</b> questions. What's on your mind?";
      }
      if (lower.includes('thank') || lower.includes('thanks')) {
        return "You're very welcome! Safe and happy trading! 🚀";
      }

      // Fallback Suggestion
      return "I'm not 100% sure about that. Try asking about:<br>• <b>Fees:</b> 'What are the escrow fee percentages?'<br>• <b>Logistics:</b> 'How long does delivery take?'<br>• <b>Security:</b> 'When is escrow payment released?'<br>• <b>Disputes:</b> 'What is the 10% holding fee?'";
    };

    const sendMessage = () => {
      const text = input.value.trim();
      if (!text) return;

      addMsg(text, 'user');
      input.value = '';
      toggle();

      // Simulate typing delay
      setTimeout(() => {
        const response = getBotResponse(text);
        addMsg(response, 'bot');
      }, 600);
    };

    // Event Listeners
    if (input) {
      input.addEventListener('input', toggle);
      toggle();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !sendBtn.disabled) sendMessage();
      });
    }

    if (chipsWrap) {
      chipsWrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const text = chip.textContent.trim();
        input.value = text;
        toggle();
        sendMessage();
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', sendMessage);
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.ChatbotApp = new Chatbot();
});
