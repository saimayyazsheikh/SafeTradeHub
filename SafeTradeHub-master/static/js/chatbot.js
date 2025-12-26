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

      // --- Account & Registration ---
      if (lower.includes('account') || lower.includes('register') || lower.includes('sign up') || lower.includes('join')) {
        return "To create an account, click the 'Join' button in the top right corner. You can sign up as a Buyer or Seller. It's free to join!";
      }
      if (lower.includes('login') || lower.includes('sign in') || lower.includes('log in')) {
        return "Click 'Sign In' at the top right. You can use your email/password or sign in with Google.";
      }
      if (lower.includes('password') || lower.includes('reset') || lower.includes('forgot')) {
        return "If you forgot your password, go to the Sign In page and click 'Forgot Password?' to receive a reset link.";
      }
      if (lower.includes('delete account') || lower.includes('close account')) {
        return "To close your account, please contact our support team directly at safetradehubteam@gmail.com for assistance.";
      }

      // --- Selling & Products ---
      if (lower.includes('sell') || lower.includes('listing') || lower.includes('post product')) {
        return "To sell an item, sign in as a Seller and click 'Add Product'. Fill in the details, upload photos, and set your price.";
      }
      if (lower.includes('fee') || lower.includes('cost') || lower.includes('charge') || lower.includes('commission')) {
        return "We charge a flat 2% service fee on successful sales. There are no listing fees!";
      }
      if (lower.includes('prohibited') || lower.includes('illegal') || lower.includes('allowed')) {
        return "We do not allow illegal items, weapons, drugs, or counterfeit goods. Please review our Terms of Service for the full list.";
      }

      // --- Buying & Orders ---
      if (lower.includes('buy') || lower.includes('purchase') || lower.includes('order')) {
        return "To buy, simply browse or search for an item, click on it, and select 'Add to Cart' or 'Buy Now'. Follow the checkout steps to pay securely.";
      }
      if (lower.includes('track') || lower.includes('status') || lower.includes('where is my')) {
        return "You can track your orders in your Profile under 'My Orders'. You'll see real-time updates there.";
      }
      if (lower.includes('cancel')) {
        return "You can cancel an order before it is shipped. Go to 'My Orders' and select 'Cancel'. If it's already shipped, you may need to request a return.";
      }

      // --- Payments & Escrow ---
      if (lower.includes('payment') || lower.includes('pay') || lower.includes('card') || lower.includes('wallet')) {
        return "We accept credit/debit cards and wallet balances. All payments are held securely in Escrow until you receive your item.";
      }
      if (lower.includes('escrow')) {
        return "Escrow is our safety net. We hold the buyer's money and only release it to the seller once the buyer confirms they received the item as described.";
      }
      if (lower.includes('refund') || lower.includes('return') || lower.includes('money back')) {
        return "If an item is not as described, you can request a return within 3 days of delivery. Once approved, your payment will be refunded from Escrow.";
      }

      // --- Shipping & Delivery ---
      if (lower.includes('delivery') || lower.includes('shipping') || lower.includes('arrive') || lower.includes('how long')) {
        return "Delivery times vary by seller and location, usually 3-5 business days. Check the product page for estimated delivery times.";
      }

      // --- Safety & Trust ---
      if (lower.includes('safe') || lower.includes('scam') || lower.includes('trust') || lower.includes('legit')) {
        return "SafeTradeHub is 100% safe. We verify all sellers and use Escrow protection so you never lose money on a bad deal.";
      }
      if (lower.includes('report') || lower.includes('dispute') || lower.includes('issue') || lower.includes('problem')) {
        return "If you have a problem, go to the order details and click 'Open Dispute'. Our team will investigate and intervene if necessary.";
      }
      if (lower.includes('verify') || lower.includes('verification') || lower.includes('badge')) {
        return "Verification builds trust! Go to your Profile > Verify Identity to upload your ID and get the Verified badge.";
      }

      // --- Support & General ---
      if (lower.includes('support') || lower.includes('contact') || lower.includes('help') || lower.includes('email')) {
        return "You can reach our support team at safetradehubteam@gmail.com. We're here to help!";
      }
      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('greetings')) {
        return "Hello! 👋 I'm here to help. You can ask me about buying, selling, payments, or account safety.";
      }
      if (lower.includes('thank') || lower.includes('thanks')) {
        return "You're welcome! Happy trading on SafeTradeHub! 🚀";
      }
      if (lower.includes('bye') || lower.includes('goodbye')) {
        return "Goodbye! Have a great day! 👋";
      }

      // Fallback
      return "I'm not sure I understand. You can ask me about:\n• Creating an account\n• Selling & Fees\n• Buying & Payments\n• Escrow & Safety\n• Order Tracking";
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
