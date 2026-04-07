/**
 * Safe Trade Hub - Admin Gmail Integration Module (Simulation Engine)
 * This module handles the rendering and state management of the dashboard email preview.
 */

const AdminInbox = {
    emailListId: 'adminEmailList',
    accountEmail: 'safetradehubteam@gmail.com',

    // Actual data extracted from your provided Gmail screenshot
    mockEmails: [
        {
            id: 'm1',
            sender: 'Roo Code Cloud',
            initial: 'R',
            subject: 'New device signed in to your Roo Code Cloud account',
            snippet: 'New sign in to your account. View details to ensure this was you...',
            time: 'Apr 1',
            unread: true,
            color: '#3b82f6'
        },
        {
            id: 'm2',
            sender: 'Vercel',
            initial: 'V',
            subject: "We're updating our Terms of Service",
            snippet: "Hi safetradehubteam-1235, We're updating our Terms of Service and Privacy Policy...",
            time: 'Mar 20',
            unread: false,
            color: '#000000'
        },
        {
            id: 'm3',
            sender: 'Google Cloud',
            initial: 'G',
            subject: '[Action Advised] Review Google Cloud credential security best practices',
            snippet: 'Secure service account and API keys to prevent unauthorized access...',
            time: 'Mar 10',
            unread: true,
            color: '#ea4335'
        },
        {
            id: 'm4',
            sender: 'firebase-noreply',
            initial: 'F',
            subject: "[Firebase] Your project 'SAFETRADEHUB' was upgraded",
            snippet: 'Your project was upgraded to the pay-as-you-go Blaze pricing plan...',
            time: 'Mar 2',
            unread: false,
            color: '#ffca28'
        },
        {
            id: 'm5',
            sender: 'firebase-noreply',
            initial: 'F',
            subject: "[Firebase] Your project 'SAFETRADEHUB' was downgraded",
            snippet: 'Your project was downgraded to the no-cost Spark pricing plan...',
            time: 'Feb 25',
            unread: false,
            color: '#ffca28'
        }
    ],

    init: function() {
        console.log('📬 Admin Inbox Module Initializing Live Feed...');
        this.fetchLiveEmails();
        
        // Auto-refresh every 5 minutes
        setInterval(() => this.fetchLiveEmails(), 5 * 60 * 1000);
    },

    fetchLiveEmails: async function() {
        const container = document.getElementById(this.emailListId);
        if (!container) return;

        try {
            // Get ID Token for Admin Auth
            if (!window.auth || !window.auth.currentUser) {
                console.warn('Auth not ready for email fetch');
                return;
            }
            
            const idToken = await window.auth.currentUser.getIdToken();
            
            const response = await fetch('/api/v1/admin/emails', {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.render(data.emails);
            } else {
                console.error('Failed to fetch emails:', data.error);
                container.innerHTML = `<div class="text-center py-4 text-danger small"><i class="fas fa-exclamation-circle"></i> ${data.error}</div>`;
            }
        } catch (error) {
            console.error('Email fetch error:', error);
            container.innerHTML = '<div class="text-center py-4 text-muted small">Unable to connect to Gmail service.</div>';
        }
    },

    render: function(emails) {
        const container = document.getElementById(this.emailListId);
        if (!container) return;

        if (!emails || emails.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-muted">No recent emails found.</div>';
            return;
        }

        container.innerHTML = '';

        emails.forEach(email => {
            const item = document.createElement('div');
            item.className = `email-item ${email.unread ? 'unread' : ''}`;
            item.onclick = () => window.showEmailDetails(email.id);
            
            item.innerHTML = `
                <div class="email-avatar" style="background-color: ${email.color}">
                    ${email.initial}
                </div>
                <div class="email-body">
                    <div class="email-meta">
                        <span class="email-sender">${email.sender}</span>
                        <span class="email-time">${email.time}</span>
                    </div>
                    <div class="email-subject">${email.subject}</div>
                    <div class="email-preview">${email.snippet}</div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
};

// --- Email Reader Logic ---
window.showEmailDetails = async function(id) {
    const modal = document.getElementById('emailReaderModal');
    const body = document.getElementById('readerBody');
    const subject = document.getElementById('readerSubject');
    const sender = document.getElementById('readerSender');
    const date = document.getElementById('readerDate');

    if (!modal) return;
    
    modal.classList.add('active');
    
    // Reset state
    body.innerHTML = `
        <div class="email-reader-loading">
            <i class="fas fa-circle-notch fa-spin"></i>
            <p>Retrieving full message content...</p>
        </div>
    `;

    try {
        if (!window.auth || !window.auth.currentUser) return;
        
        const idToken = await window.auth.currentUser.getIdToken();
        const response = await fetch(`/api/v1/admin/emails/${id}`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await response.json();

        if (data.success) {
            subject.innerText = data.subject || '(No Subject)';
            sender.innerText = data.sender || 'Unknown Sender';
            date.innerText = data.date || '';
            
            if (data.content_type === 'text/html') {
                body.innerHTML = '<div class="email-content-wrapper"><iframe id="emailFrame" style="width:100%; border:none;"></iframe></div>';
                const iframe = document.getElementById('emailFrame');
                const doc = iframe.contentWindow.document;
                doc.open();
                doc.write(data.body);
                doc.close();
                
                // Adjust height after content loads
                setTimeout(() => {
                    iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 50) + 'px';
                }, 100);
            } else {
                body.innerHTML = `<div class="email-content-wrapper" style="white-space: pre-wrap;">${data.body}</div>`;
            }
        } else {
             body.innerHTML = `<div class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle mb-2"></i><br>Error: ${data.error}</div>`;
        }
    } catch (err) {
        console.error('Reader Error:', err);
        body.innerHTML = `<div class="text-center py-5 text-danger">Failed to load email content.</div>`;
    }
};

window.closeEmailReader = function() {
    const modal = document.getElementById('emailReaderModal');
    if (modal) modal.classList.remove('active');
};

// Auto-initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initial delay to simulate "fetching" connection
    setTimeout(() => {
        AdminInbox.init();
    }, 1500);
});
