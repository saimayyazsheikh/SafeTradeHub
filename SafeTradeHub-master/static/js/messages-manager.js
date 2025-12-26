// ========================================
// MESSAGES-MANAGER.JS - Messages Page Logic
// ========================================

class MessagesManager {
    constructor() {
        this.currentUser = null;
        this.conversations = [];
        this.activeChat = null;
        this.messagesListener = null;
    }

    async init() {
        const auth = firebase.auth();
        const db = firebase.database();

        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'auth.html?mode=signin';
                return;
            }

            // Load User Data
            try {
                const snapshot = await db.ref('users/' + user.uid).once('value');
                const userData = snapshot.val();

                if (!userData) {
                    console.error('User data not found');
                    return;
                }

                this.currentUser = { uid: user.uid, ...userData };
                console.log('Messages Manager initialized for user:', this.currentUser.uid);

                // Load conversations
                this.loadConversations();

                // Setup event listeners
                this.setupEventListeners();

            } catch (error) {
                console.error('Error loading user data:', error);
            }
        });
    }

    setupEventListeners() {
        // Search conversations
        const searchInput = document.getElementById('searchConversations');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterConversations(e.target.value);
            });
        }

        // Message input enter key
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }

        // Image upload
        const imageInput = document.getElementById('imageInput');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                this.handleImageUpload(e);
            });
        }
    }

    async loadConversations() {
        const listDiv = document.getElementById('conversationsList');
        listDiv.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const db = firebase.database();
            const chatsRef = db.ref('chats');

            chatsRef.on('value', async (snapshot) => {
                console.log('Chats snapshot received:', snapshot.exists());
                this.conversations = [];

                if (!snapshot.exists()) {
                    console.log('No chats found in database');
                    listDiv.innerHTML = '<div class="empty-conversations"><i class="fas fa-inbox"></i><p>No conversations yet</p><p style="font-size: 0.85rem; margin-top: 8px;">Start chatting with sellers from product pages!</p></div>';
                    return;
                }

                const chatsData = snapshot.val();
                console.log('Total chats in database:', Object.keys(chatsData).length);

                // Filter chats where current user is a participant
                const chatPromises = [];
                for (const [chatId, chatData] of Object.entries(chatsData)) {
                    if (chatData.participants && chatData.participants.includes(this.currentUser.uid)) {
                        chatPromises.push(this.processChat(chatId, chatData, db));
                    }
                }

                // Wait for all chats to be processed
                const processedChats = await Promise.all(chatPromises);
                this.conversations = processedChats.filter(chat => chat !== null);

                console.log('User conversations:', this.conversations.length);

                if (this.conversations.length === 0) {
                    listDiv.innerHTML = '<div class="empty-conversations"><i class="fas fa-inbox"></i><p>No conversations yet</p><p style="font-size: 0.85rem; margin-top: 8px;">Start chatting with sellers from product pages!</p></div>';
                    return;
                }

                // Sort by most recent
                this.conversations.sort((a, b) => b.updatedAt - a.updatedAt);

                this.renderConversations();
            }, (error) => {
                console.error('Firebase error:', error);
                listDiv.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error loading conversations</p><p style="font-size: 0.85rem; margin-top: 8px;">' + error.message + '</p></div>';
            });

        } catch (error) {
            console.error('Error loading conversations:', error);
            listDiv.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-circle"></i><p>Error loading conversations</p></div>';
        }
    }

    async processChat(chatId, chatData, db) {
        try {
            // Get the other participant
            const otherUserId = chatData.participants.find(id => id !== this.currentUser.uid);

            // Fetch other user data
            const userSnapshot = await db.ref('users/' + otherUserId).once('value');
            const userData = userSnapshot.val() || {};

            // Fetch product data
            let productData = null;
            if (chatData.productId) {
                const productSnapshot = await db.ref('products/' + chatData.productId).once('value');
                productData = productSnapshot.val();
            }

            return {
                chatId,
                otherUser: {
                    uid: otherUserId,
                    name: userData.name || userData.displayName || 'User',
                    avatar: userData.profile?.avatar || userData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=random`
                },
                product: productData ? {
                    id: chatData.productId,
                    name: productData.name
                } : null,
                lastMessage: chatData.lastMessage || 'No messages yet',
                updatedAt: chatData.updatedAt || 0,
                unreadCount: (chatData.unreadCounts && chatData.unreadCounts[this.currentUser.uid]) || 0
            };
        } catch (error) {
            console.error('Error processing chat:', chatId, error);
            return null;
        }
    }

    renderConversations(filter = '') {
        const listDiv = document.getElementById('conversationsList');

        let filtered = this.conversations;
        if (filter) {
            const term = filter.toLowerCase();
            filtered = this.conversations.filter(conv =>
                conv.otherUser.name.toLowerCase().includes(term) ||
                (conv.product && conv.product.name.toLowerCase().includes(term))
            );
        }

        if (filtered.length === 0) {
            listDiv.innerHTML = '<div class="empty-conversations"><i class="fas fa-inbox"></i><p>No conversations found</p></div>';
            return;
        }

        listDiv.innerHTML = filtered.map(conv => `
      <div class="conversation-item ${this.activeChat?.chatId === conv.chatId ? 'active' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" 
           onclick="window.messagesManager.openChat('${conv.chatId}')">
        <img src="${conv.otherUser.avatar}" alt="${conv.otherUser.name}" class="conv-avatar">
        <div class="conv-info">
          <div class="conv-header">
            <h4>${conv.otherUser.name}</h4>
            <span class="conv-time">${this.formatTime(conv.updatedAt)}</span>
          </div>
          ${conv.product ? `<p class="conv-product"><i class="fas fa-box"></i> ${conv.product.name}</p>` : ''}
          <div class="conv-footer">
            <p class="conv-last-message">${conv.lastMessage}</p>
            ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
    }

    filterConversations(term) {
        this.renderConversations(term);
    }

    async openChat(chatId) {
        const conv = this.conversations.find(c => c.chatId === chatId);
        if (!conv) return;

        this.activeChat = conv;

        // Update UI
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('activeChat').style.display = 'flex';

        document.getElementById('chatUserAvatar').src = conv.otherUser.avatar;
        document.getElementById('chatUserName').textContent = conv.otherUser.name;
        document.getElementById('chatProductName').textContent = conv.product ? conv.product.name : '';

        // Update active state in list
        this.renderConversations();

        // Load messages
        this.loadMessages(chatId);

        // Reset unread count
        const db = firebase.database();
        db.ref(`chats/${chatId}/unreadCounts/${this.currentUser.uid}`).set(0);
    }

    loadMessages(chatId) {
        const messagesArea = document.getElementById('chatMessagesArea');
        messagesArea.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';

        // Remove previous listener
        if (this.messagesListener) {
            this.messagesListener.off();
        }

        const db = firebase.database();
        this.messagesListener = db.ref('chats/' + chatId + '/messages').orderByChild('createdAt');

        this.messagesListener.on('value', (snapshot) => {
            messagesArea.innerHTML = '';

            if (!snapshot.exists()) {
                messagesArea.innerHTML = '<div class="empty-messages">No messages yet. Start the conversation!</div>';
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
            messagesArea.scrollTop = messagesArea.scrollHeight;
        });
    }

    appendMessage(msg) {
        const messagesArea = document.getElementById('chatMessagesArea');
        const isMe = msg.senderId === this.currentUser.uid;

        const msgDiv = document.createElement('div');
        msgDiv.className = `message-bubble ${isMe ? 'me' : 'them'}`;

        const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        let content = '';
        if (msg.imageUrl) {
            content = `<img src="${msg.imageUrl}" alt="Image" class="message-image" onclick="window.open('${msg.imageUrl}', '_blank')">`;
        }
        if (msg.text) {
            content += `<div class="message-text">${this.escapeHtml(msg.text)}</div>`;
        }

        msgDiv.innerHTML = `
      ${content}
      <div class="message-timestamp">${timeStr}</div>
    `;

        messagesArea.appendChild(msgDiv);
    }

    async handleImageUpload(event) {
        if (!this.activeChat) return;

        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image size should be less than 5MB');
            return;
        }

        try {
            // Show loading state
            const messagesArea = document.getElementById('chatMessagesArea');
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message-bubble me';
            loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading image...';
            messagesArea.appendChild(loadingDiv);
            messagesArea.scrollTop = messagesArea.scrollHeight;

            // Upload to Firebase Storage
            const storage = firebase.storage();
            const timestamp = Date.now();
            const fileName = `chat-images/${this.activeChat.chatId}/${timestamp}_${file.name}`;
            const storageRef = storage.ref(fileName);

            // Upload file
            const uploadTask = storageRef.put(file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    // Progress
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    loadingDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading ${Math.round(progress)}%...`;
                },
                (error) => {
                    // Error
                    console.error('Upload error:', error);
                    messagesArea.removeChild(loadingDiv);
                    alert('Failed to upload image: ' + error.message);
                },
                async () => {
                    // Success - get download URL
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

                    // Remove loading message
                    messagesArea.removeChild(loadingDiv);

                    // Send message with image URL
                    const db = firebase.database();
                    const chatRef = db.ref('chats/' + this.activeChat.chatId);

                    await chatRef.child('messages').push({
                        imageUrl: downloadURL,
                        senderId: this.currentUser.uid,
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    });

                    await chatRef.update({
                        lastMessage: '📷 Image',
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    });

                    // Clear file input
                    event.target.value = '';
                }
            );

        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Failed to upload image');
        }
    }

    async sendMessage() {
        if (!this.activeChat) return;

        const input = document.getElementById('messageInput');
        const text = input.value.trim();

        if (!text) return;

        input.value = '';

        try {
            const db = firebase.database();
            const chatRef = db.ref('chats/' + this.activeChat.chatId);

            await chatRef.child('messages').push({
                text: text,
                senderId: this.currentUser.uid,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

            await chatRef.update({
                lastMessage: text,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });

            // Increment unread count for the other user
            const otherUserId = this.activeChat.otherUser.uid;
            await chatRef.child(`unreadCounts/${otherUserId}`).transaction((current) => {
                return (current || 0) + 1;
            });

        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message: ' + error.message);
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

        return date.toLocaleDateString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions
window.closeChatView = function () {
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('activeChat').style.display = 'none';
    if (window.messagesManager.messagesListener) {
        window.messagesManager.messagesListener.off();
    }
    window.messagesManager.activeChat = null;
    window.messagesManager.renderConversations();
};

window.sendMessageFromPage = function () {
    window.messagesManager.sendMessage();
};

// Initialize
window.messagesManager = new MessagesManager();
document.addEventListener('DOMContentLoaded', () => {
    window.messagesManager.init();
});
