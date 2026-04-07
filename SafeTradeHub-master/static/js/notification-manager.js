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
          this.listenForNotifications();
        } else {
          this.clearNotifications();
        }
      });

      if (this.user) {
        this.listenForNotifications();
      }
    }

    this.setupUI();
    this.isInitialized = true;
    console.log('🔔 NotificationManager initialized');
  }

  setupUI() {
    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
      .notification-dropdown {
        position: absolute;
        top: 60px;
        right: 100px; /* Adjust based on layout */
        width: 360px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        border: 1px solid #e5e7eb;
        z-index: 1000;
        display: none;
        overflow: hidden;
        animation: slideDown 0.2s ease-out;
      }
      .notification-dropdown.show {
        display: block;
      }
      .notification-header {
        padding: 16px;
        border-bottom: 1px solid #f3f4f6;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .notification-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
      }
      .mark-read-btn {
        font-size: 0.8rem;
        color: #2563eb;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
      }
      .mark-read-btn:hover {
        background: #eff6ff;
      }
      .notification-list {
        max-height: 400px;
        overflow-y: auto;
      }
      .notification-item {
        padding: 16px;
        border-bottom: 1px solid #f3f4f6;
        display: flex;
        gap: 12px;
        transition: background 0.1s;
        cursor: pointer;
      }
      .notification-item:hover {
        background: #f9fafb;
      }
      .notification-item.unread {
        background: #eff6ff;
      }
      .notification-item.unread:hover {
        background: #e0e7ff;
      }
      .notification-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #e0e7ff;
        color: #4338ca;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .notification-content {
        flex: 1;
      }
      .notification-title {
        font-weight: 600;
        font-size: 0.9rem;
        margin-bottom: 4px;
        color: #1f2937;
      }
      .notification-message {
        font-size: 0.85rem;
        color: #6b7280;
        margin-bottom: 6px;
        line-height: 1.4;
      }
      .notification-time {
        font-size: 0.75rem;
        color: #9ca3af;
      }
      .notification-empty {
        padding: 32px;
        text-align: center;
        color: #6b7280;
      }
      .notification-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ef4444;
        color: white;
        font-size: 0.7rem;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        display: none;
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
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
        <div class="notification-empty">No notifications yet</div>
      </div>
    `;
    document.body.appendChild(dropdown);

    // Attach to Bell Button
    this.attachToBell();
  }

  attachToBell() {
    // Find the bell button - it's the second icon-btn in header-actions
    // Or we can find it by aria-label="Notifications"
    const bellBtn = document.querySelector('button[aria-label="Notifications"]');
    if (bellBtn) {
      bellBtn.id = 'notificationBtn';
      bellBtn.style.position = 'relative';
      bellBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      };

      // Add badge element
      const badge = document.createElement('span');
      badge.id = 'notificationBadge';
      badge.className = 'notification-badge';
      bellBtn.appendChild(badge);
    }
  }

  listenForNotifications() {
    if (!this.user || !firebase.database) return;

    const ref = firebase.database().ref(`users/${this.user.uid}/notifications`);
    ref.limitToLast(20).on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array and sort by timestamp desc
        this.notifications = Object.entries(data).map(([id, n]) => ({
          id,
          ...n
        })).sort((a, b) => b.timestamp - a.timestamp);
      } else {
        this.notifications = [];
      }

      this.updateUnreadCount();
      this.renderDropdown();
    });
  }

  updateUnreadCount() {
    this.unreadCount = this.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
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
      list.innerHTML = '<div class="notification-empty">No notifications yet</div>';
      return;
    }

    list.innerHTML = this.notifications.map(n => `
      <div class="notification-item ${n.read ? '' : 'unread'}" onclick="window.NotificationManager.handleNotificationClick('${n.id}', '${n.link || ''}')">
        <div class="notification-icon">
          ${this.getIconForType(n.type)}
        </div>
        <div class="notification-content">
          <div class="notification-title">${n.title}</div>
          <div class="notification-message">${n.message}</div>
          <div class="notification-time">${this.formatTime(n.timestamp)}</div>
        </div>
      </div>
    `).join('');
  }

  getIconForType(type) {
    const icons = {
      order: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
      message: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      default: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>'
    };
    return icons[type] || icons.default;
  }

  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // If less than 24 hours
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
  }

  toggleDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('notificationBtn');

    if (dropdown && btn) {
      const rect = btn.getBoundingClientRect();
      // Position dropdown relative to button
      dropdown.style.top = (rect.bottom + 10) + 'px';
      dropdown.style.right = (window.innerWidth - rect.right) + 'px';

      dropdown.classList.toggle('show');
    }
  }

  async handleNotificationClick(id, link) {
    // Mark as read
    if (this.user) {
      await firebase.database().ref(`users/${this.user.uid}/notifications/${id}`).update({ read: true });
    }

    // Navigate if link exists
    if (link) {
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
      await firebase.database().ref().update(updates);
    }
  }

  clearNotifications() {
    this.notifications = [];
    this.updateUnreadCount();
    this.renderDropdown();
  }
}

// Global Instance
window.NotificationManager = new NotificationManager();

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notificationDropdown');
  const btn = document.getElementById('notificationBtn');

  if (dropdown && dropdown.classList.contains('show')) {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  }
});
