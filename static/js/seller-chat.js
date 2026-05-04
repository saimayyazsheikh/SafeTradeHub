// ========================================
// SELLER-CHAT.JS - Real-time Buyer-Seller Chat (Realtime Database)
// ========================================

class SellerChat {
    constructor() {
        this.chatId = null;
        this.sellerId = null;
        this.productId = null;
        this.currentUser = null;
        this.messagesRef = null;
        this.container = null;
    }

    /**
     * Initialize and open the chat window
     * @param {string} sellerId - ID of the seller
     * @param {string} productId - ID of the product
     * @param {string} productName - Name of the product
     */
    async openChat(sellerId, productId, productName) {
        // Check authentication
        if (!window.AuthManager || !window.AuthManager.isAuthenticated()) {
            if (confirm('You need to sign in to chat with the seller. Go to login?')) {
                window.location.href = 'auth.html?mode=signin';
            }
            return;
        }

        this.currentUser = window.AuthManager.getCurrentUser();
        if (!this.currentUser) {
            console.error('User authenticated but no user data found');
            return;
        }

        if (this.currentUser.uid === sellerId) {
            alert('You cannot chat with yourself!');
            return;
        }

        if (!sellerId) {
            console.error('No sellerId provided to openChat');
            if (window.NotificationManager) {
                window.NotificationManager.showToast('Error', 'Could not start chat: Seller information is missing.', 'error');
            }
            return;
        }

        this.sellerId = sellerId;
        this.productId = productId;

        // Fetch seller's name from database (granularly to avoid permission errors)
        let sellerName = 'Seller';
        try {
            const db = firebase.database();
            const fetchField = (path) => db.ref(path).once('value').then(s => s.val()).catch(() => null);
            
            const [displayName, fullName, username] = await Promise.all([
                fetchField(`users/${sellerId}/displayName`),
                fetchField(`users/${sellerId}/fullName`),
                fetchField(`users/${sellerId}/username`)
            ]);
            
            sellerName = displayName || fullName || username || 'Seller';
        } catch (error) {
            console.error('Error fetching seller name:', error);
        }

        // Generate a unique chat ID (sorted UIDs to ensure consistency)
        const participants = [this.currentUser.uid, sellerId].sort();
        const pId = productId || 'general';
        this.chatId = `${participants[0]}_${participants[1]}_${pId}`;

        // Create UI if not exists
        if (!document.getElementById('seller-chat-container')) {
            this.renderUI(productName, sellerName);
        } else {
            // Update the chat title if container exists
            const titleElement = document.querySelector('.chat-title');
            if (titleElement) {
                titleElement.textContent = `Chat with ${sellerName}`;
            }
            const subtitleElement = document.querySelector('.chat-subtitle');
            if (subtitleElement) {
                subtitleElement.textContent = productName;
            }
        }

        this.container = document.getElementById('seller-chat-container');
        this.container.classList.add('show');

        // Load messages
        this.listenForMessages();
    }

    /**
     * Render the chat UI
     */
    renderUI(productName, sellerName = 'Seller') {
        const div = document.createElement('div');
        div.id = 'seller-chat-container';
        div.className = 'seller-chat-container';
        div.innerHTML = `
      <div class="seller-chat-header">
        <div class="chat-header-info">
          <span class="chat-status-dot"></span>
          <div>
            <div class="chat-title">Chat with ${sellerName}</div>
            <div class="chat-subtitle">${productName}</div>
          </div>
        </div>
        <button class="chat-close-btn" onclick="window.SellerChatApp.closeChat()">×</button>
      </div>
      
      <div class="seller-chat-messages" id="seller-chat-messages">
        <div class="chat-loading">Loading conversation...</div>
      </div>
      
      <div class="seller-chat-input-area">
        <input type="text" id="seller-chat-input" placeholder="Type a message..." autocomplete="off">
        <button id="seller-chat-send" onclick="window.SellerChatApp.sendMessage()">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    `;
        document.body.appendChild(div);

        // Enter key to send
        document.getElementById('seller-chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    /**
     * Close the chat window
     */
    closeChat() {
        if (this.container) {
            this.container.classList.remove('show');
        }
        if (this.messagesRef) {
            this.messagesRef.off();
            this.messagesRef = null;
        }
    }

    /**
     * Listen for real-time messages from Realtime Database
     */
    listenForMessages() {
        const messagesDiv = document.getElementById('seller-chat-messages');
        messagesDiv.innerHTML = ''; // Clear loading

        // Ensure Firebase Realtime Database is available
        if (!firebase.database) {
            console.error('Firebase Realtime Database not initialized');
            messagesDiv.innerHTML = '<div class="chat-error">Chat service unavailable</div>';
            return;
        }

        const db = firebase.database();

        // Create chat metadata if not exists
        const chatRef = db.ref('chats/' + this.chatId);
        const participants = [this.currentUser.uid, this.sellerId].sort();
        chatRef.update({
            participants: participants,
            productId: this.productId || 'general',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => console.error("Error updating chat metadata:", err));

        // Listen to messages
        this.messagesRef = chatRef.child('messages').orderByChild('createdAt');

        this.messagesRef.on('value', (snapshot) => {
            messagesDiv.innerHTML = ''; // Clear and rebuild

            if (!snapshot.exists()) {
                messagesDiv.innerHTML = '<div class="chat-empty">Start the conversation!</div>';
                return;
            }

            const messages = [];
            snapshot.forEach(childSnapshot => {
                messages.push({
                    id: childSnapshot.key,
                    ...childSnapshot.val()
                });
            });

            messages.forEach(msg => {
                this.appendMessage(msg);
            });

            // Scroll to bottom
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, (error) => {
            console.error('Error listening to messages:', error);
            messagesDiv.innerHTML = '<div class="chat-error">Error loading messages. Please check Firebase rules.</div>';
        });
    }

    /**
     * Append a single message to the UI
     */
    appendMessage(msg) {
        const messagesDiv = document.getElementById('seller-chat-messages');
        const isMe = msg.senderId === this.currentUser.uid;

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${isMe ? 'me' : 'them'}`;

        // Format time
        let timeStr = '';
        if (msg.createdAt) {
            const date = new Date(msg.createdAt);
            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        msgDiv.innerHTML = `
      <div class="message-content">${this.escapeHtml(msg.text)}</div>
      <div class="message-time">${timeStr}</div>
    `;

        messagesDiv.appendChild(msgDiv);
    }

    /**
     * Send a message
     */
    async sendMessage() {
        const input = document.getElementById('seller-chat-input');
        const text = input.value.trim();

        if (!text) return;

        input.value = ''; // Clear input immediately

        try {
            const db = firebase.database();
            const chatRef = db.ref('chats/' + this.chatId);

            // Add message
            await chatRef.child('messages').push({
                text: text,
                senderId: this.currentUser.uid,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

            // Update last message in chat
            await chatRef.update({
                lastMessage: text,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });

            // Increment unread count for the recipient
            await chatRef.child(`unreadCounts/${this.sellerId}`).transaction((current) => {
                return (current || 0) + 1;
            });

            // Send notification to the recipient
            const senderName = this.currentUser.name || this.currentUser.displayName || this.currentUser.fullName || 'User';
            const notificationRef = db.ref(`users/${this.sellerId}/notifications`);
            await notificationRef.push({
                title: `New Message from ${senderName}`,
                message: text.length > 50 ? text.substring(0, 47) + '...' : text,
                type: 'order',
                read: false,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                link: 'messages.html'
            });

        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please check your Firebase rules and try again.');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize global instance
window.SellerChatApp = new SellerChat();
