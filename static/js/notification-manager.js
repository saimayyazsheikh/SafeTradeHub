// ========================================
// NOTIFICATION-MANAGER.JS - Real-time Notification System
// ========================================

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isInitialized = false;
    this.user = null;
    this.init();
  }

  async init() {
    // Wait for DOM
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    // Wait for Auth
    if (window.AuthManager) {
      await window.AuthManager.waitForInit();
      this.user = window.AuthManager.getCurrentUser();

      // Listen for auth changes
      window.AuthManager.onAuthStateChange((user) => {
        this.user = user;
        if (user) {
          this.userRole = user.role || (user.uid ? 'Buyer' : null);
          this.listenForNotifications();
        } else {
          this.userRole = null;
          this.clearNotifications();
        }
      });

      if (this.user) {
        this.userRole = this.user.role || 'Buyer';
        this.listenForNotifications();
      }
    } else if (window.firebase) {
      // Fallback if AuthManager isn't directly available (some dashboards)
      firebase.auth().onAuthStateChanged(async (user) => {
        this.user = user;
        if (user) {
          // Robust Role Resolution for Static Pages
          if (firebase.database) {
            const snap = await firebase.database().ref(`users/${user.uid}/role`).once('value');
            this.userRole = snap.val() || 'Buyer';
          } else {
            this.userRole = 'Buyer';
          }
          this.listenForNotifications();
        } else {
          this.userRole = null;
          this.clearNotifications();
        }
      });
    }

    this.setupUI();
    this.isInitialized = true;

  }

  setupUI() {
    // Inject Highly Polished Glassmorphism/Axiom CSS
    const style = document.createElement('style');
    style.textContent = `
      .notification-dropdown {
        position: absolute;
        top: 60px;
        right: 15px; /* Adjust based on layout */
        width: 380px;
        background: rgba(255, 255, 255, 0.98);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05);
        border: 1px solid rgba(229, 231, 235, 0.8);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 9999;
        display: none;
        overflow: hidden; /* Prevent horizontal scroll on container */
        box-sizing: border-box;
        transform-origin: top right;
        animation: dropScale 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        text-align: left !important;
      }
      .notification-dropdown.show {
        display: block;
      }
      .notification-header {
        padding: 18px 20px;
        border-bottom: 1px solid #f1f5f9;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #ffffff;
        text-align: left !important;
      }
      .notification-header h3 {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.01em;
        text-align: left !important;
      }
      .mark-read-btn {
        font-size: 0.8rem;
        font-weight: 600;
        color: #3b82f6;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 6px;
        transition: all 0.2s ease;
      }
      .mark-read-btn:hover {
        background: #eff6ff;
        color: #2563eb;
      }
      .notification-list {
        max-height: 420px;
        overflow-y: auto;
        overflow-x: hidden; /* CRITICAL: Prevent horizontal scrolling */
        overscroll-behavior: contain;
        text-align: left !important;
        box-sizing: border-box;
      }
      /* Custom Scrollbar */
      .notification-list::-webkit-scrollbar {
        width: 6px;
      }
      .notification-list::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 10px;
      }
      .notification-item {
        padding: 16px 20px;
        border-bottom: 1px solid #f8fafc;
        display: flex;
        align-items: flex-start !important;
        gap: 14px;
        transition: all 0.15s ease;
        cursor: pointer;
        background: #ffffff;
        text-align: left !important;
        width: 100% !important;
        box-sizing: border-box; /* Include padding in width */
      }
      .notification-item:last-child {
        border-bottom: none;
      }
      .notification-item:hover {
        background: #f8fafc;
      }
      .notification-item.unread {
        background: #f0fdf4;
      }
      .notification-item.unread:hover {
        background: #dcfce7;
      }
      .notification-icon-wrapper {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 2px 5px rgba(0,0,0,0.02);
      }
      .type-order { background: #eff6ff; color: #3b82f6; }
      .type-payment { background: #f0fdf4; color: #10b981; }
      .type-alert { background: #fef2f2; color: #ef4444; }
      .type-dispute { background: #fffbeb; color: #f59e0b; }
      .type-verification { background: #ecfdf5; color: #059669; }
      .type-shop { background: #f5f3ff; color: #8b5cf6; }
      .type-default { background: #f1f5f9; color: #64748b; }

      .notification-content {
        flex: 1;
        padding-top: 2px;
        text-align: left !important;
        display: flex;
        flex-direction: column;
        align-items: flex-start !important;
      }
      .notification-title {
        font-weight: 700;
        font-size: 0.9rem;
        margin-bottom: 4px;
        color: #1e293b;
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left !important;
      }
      .unread-dot {
        width: 6px;
        height: 6px;
        background: #10b981;
        border-radius: 50%;
        display: inline-block;
      }
      .notification-message {
        font-size: 0.85rem;
        color: #64748b;
        margin-bottom: 6px;
        line-height: 1.5;
        text-align: left !important;
        word-break: break-word; /* Ensure text wraps */
        white-space: normal;
      }
      .notification-time {
        font-size: 0.75rem;
        color: #94a3b8;
        font-weight: 500;
        text-align: left !important;
      }
      .notification-empty {
        padding: 40px;
        text-align: center;
        color: #94a3b8;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .notification-badge-el {
        position: absolute;
        top: -6px;
        right: -6px;
        background: #ef4444;
        color: white;
        font-size: 0.7rem;
        font-weight: 800;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        display: none;
        box-shadow: 0 2px 5px rgba(239, 68, 68, 0.4);
        padding: 0 4px;
      }
      @keyframes dropScale {
        0% { opacity: 0; transform: scale(0.95) translateY(-5px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* TOAST SYSTEM */
      .axiom-toast-container {
        position: fixed;
        bottom: 30px;
        right: 30px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }
      .axiom-toast {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(229, 231, 235, 0.5);
        border-radius: 12px;
        padding: 16px 20px;
        min-width: 300px;
        max-width: 450px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 15px;
        pointer-events: auto;
        transform: translateX(120%);
        transition: transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      }
      .axiom-toast.show {
        transform: translateX(0);
      }
      .toast-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .toast-success .toast-icon { background: #dcfce7; color: #16a34a; }
      .toast-error .toast-icon { background: #fee2e2; color: #dc2626; }
      .toast-info .toast-icon { background: #eff6ff; color: #2563eb; }

      .toast-content {
        flex: 1;
      }
      .toast-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: #1e293b;
        margin-bottom: 2px;
      }
      .toast-msg {
        font-size: 0.85rem;
        color: #64748b;
        line-height: 1.4;
      }
      .toast-close {
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
      }
      .toast-close:hover { color: #475569; }

      /* MODAL SYSTEM (Axiom Confirm) */
      .axiom-confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.4);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 11000;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .axiom-confirm-overlay.show {
        display: flex;
        opacity: 1;
      }
      .axiom-confirm-card {
        background: white;
        border-radius: 20px;
        padding: 30px;
        width: 100%;
        max-width: 420px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        transform: scale(0.9);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        text-align: center;
      }
      .axiom-confirm-overlay.show .axiom-confirm-card {
        transform: scale(1);
      }
      .axiom-confirm-icon {
        width: 60px;
        height: 60px;
        border-radius: 18px;
        background: #fee2e2;
        color: #ef4444;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
      }
      .axiom-confirm-title {
        font-size: 1.25rem;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 10px;
      }
      .axiom-confirm-text {
        font-size: 0.95rem;
        color: #64748b;
        line-height: 1.6;
        margin-bottom: 25px;
      }
      .axiom-confirm-actions {
        display: flex;
        gap: 12px;
      }
      .axiom-btn {
        flex: 1;
        padding: 12px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }
      .btn-ghost {
        background: #f8fafc;
        color: #64748b;
      }
      .btn-ghost:hover {
        background: #f1f5f9;
        color: #1e293b;
      }
      .btn-danger-action {
        background: #ef4444;
        color: white;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
      }
      .btn-danger-action:hover {
        background: #dc2626;
        transform: translateY(-1px);
        box-shadow: 0 6px 15px rgba(239, 68, 68, 0.3);
      }
      .btn-primary-action {
        background: #4f46e5;
        color: white;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
      }
      .btn-primary-action:hover {
        background: #4338ca;
        transform: translateY(-1px);
        box-shadow: 0 6px 15px rgba(79, 70, 229, 0.3);
      }
      .axiom-confirm-icon.type-primary {
        background: #eef2ff;
        color: #4f46e5;
      }
      .axiom-confirm-icon.type-danger {
        background: #fee2e2;
        color: #ef4444;
      }
    `;
    document.head.appendChild(style);

    // Create Dropdown HTML
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationDropdown';
    dropdown.className = 'notification-dropdown';
    dropdown.innerHTML = `
      <div class="notification-header">
        <h3>Notifications</h3>
        <button class="mark-read-btn" onclick="window.NotificationManager.markAllAsRead()">Mark all as read</button>
      </div>
      <div class="notification-list" id="notificationList">
        <div class="notification-empty">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <div>All caught up!</div>
        </div>
      </div>
    `;
    document.body.appendChild(dropdown);

    // Create Toast Container
    const toastContainer = document.createElement('div');
    toastContainer.id = 'axiomToastContainer';
    toastContainer.className = 'axiom-toast-container';
    document.body.appendChild(toastContainer);

    // Create Confirm Modal Skeleton
    const confirmOverlay = document.createElement('div');
    confirmOverlay.id = 'axiomConfirmOverlay';
    confirmOverlay.className = 'axiom-confirm-overlay';
    confirmOverlay.innerHTML = `
        <div class="axiom-confirm-card">
            <div class="axiom-confirm-icon" id="confirmIcon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            </div>
            <div class="axiom-confirm-title" id="confirmTitle">Confirm Action</div>
            <div class="axiom-confirm-text" id="confirmText">Are you sure you want to proceed?</div>
            <div class="axiom-confirm-actions">
                <button class="axiom-btn btn-ghost" id="confirmCancel">Cancel</button>
                <button class="axiom-btn btn-primary-action" id="confirmProceed">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmOverlay);

    // Attach to Bell Button
    this.attachToBell();

    // Observer for dynamically added bell buttons
    const observer = new MutationObserver(() => {
      if (!document.getElementById('notificationBadgeEl')) {
        this.attachToBell();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  attachToBell() {
    // Find the bell button dynamically across dashboards
    const bellBtn = document.querySelector('button[aria-label="Notifications"]') || document.getElementById('notificationBtn');
    if (bellBtn && !document.getElementById('notificationBadgeEl')) {
      bellBtn.id = 'integratedNotificationBtn';
      bellBtn.style.position = 'relative';
      bellBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      };

      // Add badge element securely
      const badge = document.createElement('span');
      badge.id = 'notificationBadgeEl';
      badge.className = 'notification-badge-el';
      bellBtn.appendChild(badge);

      this.updateUnreadCount();
    }
  }

  listenForNotifications() {
    if (!this.user || !firebase.database) return;

    // Strict Enforcement of Unified Schema Path
    const ref = firebase.database().ref(`users/${this.user.uid}/notifications`);
    ref.limitToLast(20).on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array and sort by timestamp desc
        this.notifications = Object.entries(data).map(([id, n]) => ({
          id,
          ...n
        })).sort((a, b) => (b.timestamp || Date.now() + 1000) - (a.timestamp || Date.now() + 1000));
      } else {
        this.notifications = [];
      }

      this.updateUnreadCount();
      this.renderDropdown();
    });

    // Administrative Alerts Listener (Global Node)
    const adminRef = firebase.database().ref('global_notifications/admin_alerts');
    adminRef.limitToLast(10).on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Only process alerts intended for the current user's role
      Object.entries(data).forEach(([id, alert]) => {
        // If the alert is new (within last 30s) and we haven't seen it, show a toast
        const now = Date.now();
        if (alert.timestamp > now - 15000 && !this.seenGlobalAlerts?.has(id)) {
          if (!this.seenGlobalAlerts) this.seenGlobalAlerts = new Set();
          this.seenGlobalAlerts.add(id);

          // Only admins/staff/support should see these alerts
          const role = (this.userRole || '').toLowerCase();
          const isAdminStaff = role === 'admin' || role === 'staff' || role === 'system management';

          if (isAdminStaff) {
            this.showToast(alert.title, alert.message, 'info');
          }
        }
      });
    });
  }

  updateUnreadCount() {
    this.unreadCount = this.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notificationBadgeEl');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  renderDropdown() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <div>All caught up! No recent activity.</div>
        </div>`;
      return;
    }

    list.innerHTML = this.notifications.map(n => {
      // Legacy Support: map 'payment' to 'shop' if title contains 'Shop'
      let effectiveType = n.type;
      if (effectiveType === 'payment' && (n.title?.includes('Shop') || n.message?.includes('shop'))) {
        effectiveType = 'shop';
      } else if (effectiveType === 'payment' && (n.title?.includes('Identity') || n.title?.includes('Verification'))) {
        effectiveType = 'verification';
      }

      const typeClass = this.getTypeClass(effectiveType);
      return `
      <div class="notification-item ${n.read ? '' : 'unread'}" onclick="window.NotificationManager.handleNotificationClick('${n.id}', '${n.link || ''}')">
        <div class="notification-icon-wrapper ${typeClass}">
          ${this.getIconForType(effectiveType)}
        </div>
        <div class="notification-content">
          <div class="notification-title">
            ${n.title}
            ${!n.read ? '<span class="unread-dot"></span>' : ''}
          </div>
          <div class="notification-message">${n.message}</div>
          <div class="notification-time">${this.formatTime(n.timestamp)}</div>
        </div>
      </div>
    `}).join('');
  }

  getTypeClass(type) {
    const typeMap = {
      'order': 'type-order',
      'payment': 'type-payment',
      'alert': 'type-alert',
      'dispute': 'type-dispute',
      'verification': 'type-verification',
      'shop': 'type-shop'
    };
    return typeMap[type] || 'type-default';
  }

  getIconForType(type) {
    const icons = {
      order: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
      message: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      payment: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      dispute: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="16"/><line x1="12" y1="12" x2="8" y2="16"/></svg>',
      verification: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      shop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
      default: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
    };
    return icons[type] || icons.default;
  }

  formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Relative Time Logic
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';

    // Standard Time
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toggleDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('integratedNotificationBtn');

    if (dropdown && btn) {
      const rect = btn.getBoundingClientRect();
      // Dropdown anchoring calculated universally safely
      dropdown.style.top = (rect.bottom + 12) + 'px';

      const spaceRight = window.innerWidth - rect.right;
      // Keep it inside viewport
      if (spaceRight < 380) {
        dropdown.style.right = '10px';
      } else {
        dropdown.style.right = spaceRight + 'px';
      }

      dropdown.classList.toggle('show');
    }
  }

  async handleNotificationClick(id, link) {
    // Mark as read
    if (this.user) {
      try {
        await firebase.database().ref(`users/${this.user.uid}/notifications/${id}`).update({ read: true });
      } catch (err) {
        console.warn("Could not mark as read", err);
      }
    }

    // Toggle dropdown
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.classList.remove('show');

    // Navigate securely if link exists
    if (link && link !== window.location.pathname) {
      window.location.href = link;
    }
  }

  async markAllAsRead() {
    if (!this.user || this.notifications.length === 0) return;

    const updates = {};
    this.notifications.forEach(n => {
      if (!n.read) {
        updates[`users/${this.user.uid}/notifications/${n.id}/read`] = true;
      }
    });

    if (Object.keys(updates).length > 0) {
      try {
        await firebase.database().ref().update(updates);
      } catch (e) {
        console.error("Batch update failed:", e);
      }
    }
  }

  showToast(title, message, type = 'success') {
    const container = document.getElementById('axiomToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `axiom-toast toast-${type}`;

    const icons = {
      success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `
        <div class="toast-icon">
            ${icons[type] || icons.info}
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
        <div class="toast-close" onclick="this.parentElement.remove()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
      `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove after 5s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  }

  showConfirm(title, message, type = 'primary') {
    return new Promise((resolve) => {
      const overlay = document.getElementById('axiomConfirmOverlay');
      const titleEl = document.getElementById('confirmTitle');
      const textEl = document.getElementById('confirmText');
      const proceedBtn = document.getElementById('confirmProceed');
      const cancelBtn = document.getElementById('confirmCancel');
      const iconContainer = document.getElementById('confirmIcon');

      if (!overlay || !titleEl || !textEl || !proceedBtn || !cancelBtn) {
        resolve(window.confirm(message));
        return;
      }

      // Update UI based on type
      titleEl.textContent = title;
      textEl.textContent = message;

      // Update Icon and Colors
      if (type === 'danger' || title.toLowerCase().includes('delete') || title.toLowerCase().includes('remove')) {
        iconContainer.className = 'axiom-confirm-icon type-danger';
        iconContainer.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';
        proceedBtn.className = 'axiom-btn btn-danger-action';
      } else {
        iconContainer.className = 'axiom-confirm-icon type-primary';
        iconContainer.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        proceedBtn.className = 'axiom-btn btn-primary-action';
      }

      overlay.classList.add('show');

      const cleanup = (result) => {
        overlay.classList.remove('show');
        proceedBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);

      proceedBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  clearNotifications() {
    this.notifications = [];
    this.updateUnreadCount();
    this.renderDropdown();
  }
}

// Global notification helpers
async function requestNotificationPermission() {
  try {
    const messaging = firebase.messaging();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken({
        vapidKey: 'BJ13KKFRdr9XHWWFTGBZc1wSE5gRJaBLtUDH9QJxeCKDG2YolMlbnSrBIkEc_Aein7dq6M1-t9GQtJmUDQVice0'
      });
      sendTokenToServer(token);
      if (window.NotificationManager) {
        window.NotificationManager.showToast('Success', 'Notifications enabled! You\'ll receive updates about your orders.', 'success');
      } else {
        alert('Notifications enabled!');
      }
    } else {
      alert('Notifications are disabled. You can enable them later by clicking the bell icon.');
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
  }
}

function sendTokenToServer(token) {
  fetch('/save-fcm-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcmToken: token })
  }).catch(error => console.error('Error saving token:', error));
}

window.requestNotificationPermission = requestNotificationPermission;
window.sendTokenToServer = sendTokenToServer;

// Global Instance
window.NotificationManager = new NotificationManager();

// Global click outside to close listener
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notificationDropdown');
  const btn = document.getElementById('integratedNotificationBtn');

  if (dropdown && dropdown.classList.contains('show')) {
    if (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
      dropdown.classList.remove('show');
    }
  }
});
