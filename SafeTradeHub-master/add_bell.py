import os

workspace = r"c:\Users\Saim\Desktop\SafeTradeHub\SafeTradeHub\SafeTradeHub\SafeTradeHub-master\templates"
files_to_patch = [
    "dashboard.html",
    "orders.html",
    "seller-profile.html",
    "wallet.html",
    "settings.html",
    "profile.html",
    "product-management.html",
    "messages.html"
]

bell_html = '''
            <div class="topbar-actions" style="display:flex; align-items:center; gap:15px;">
                <button class="icon-btn" id="notificationBtn" aria-label="Notifications" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem; color:#64748b; padding:8px; border-radius:50%; transition:all 0.2s;">
                    <i class="fas fa-bell"></i>
                </button>
            </div>'''

script_html = '<script src="/static/js/notification-manager.js"></script>'

for filename in files_to_patch:
    filepath = os.path.join(workspace, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        changed = False

        # 1. Add Bell Button to dashboard-topbar
        if 'id="notificationBtn"' not in content and 'aria-label="Notifications"' not in content:
            if '<div class="dashboard-topbar">' in content:
                # Find the closing tag of the page-title div inside dashboard-topbar
                # An easier way is to just replace the `<div class="dashboard-topbar">` opening and what's inside it, but it's simpler to inject before the closing `</div>` of `.dashboard-topbar`.
                # We can split by class="dashboard-topbar" and then find the first </div> that belongs to it. Or just use simple string replace.
                pass # Let's do a reliable replace
            
            # Simple approach: insert right after page-title closes.
            # Usually it looks like:
            # <div class="dashboard-topbar">
            #    <div class="page-title">
            #       <h1>...</h1>
            #       <p>...</p>
            #    </div>
            
            p_title_endCode1 = '</div>\n        </div>\n\n        <div id="'
            p_title_endCode2 = '</div>\n        </div>\n\n        <div class="dashboard-content">'
            p_title_endCode3 = '</div>\n    </div>\n\n    <div id="'
            
            if '</div>\n        </div>' in content:
               pass

            # Let's just find <div class="dashboard-topbar"> block and replace its ending '</div>' with 'bell_html \n        </div>'
            # Or regex:
            import re
            pattern = re.compile(r'(<div class="dashboard-topbar">[\s\S]*?<div class="page-title">[\s\S]*?</div>)(\s*</div>)', re.IGNORECASE)
            # If there's an existing comment <!-- Add Notification Bell Here... -->, replace it
            if '<!-- Add Notification Bell Here if needed -->' in content:
                content = content.replace('<!-- Add Notification Bell Here if needed -->', bell_html)
                changed = True
            elif pattern.search(content):
                content = pattern.sub(r'\1' + bell_html + r'\2', content)
                changed = True

        # 2. Ensure notification-manager.js is included
        if 'notification-manager.js' not in content:
            # For files that didn't have header-manager.js (orders.html, messages.html)
            # We append right before </body> or inside <head>
            if '</body>' in content:
                content = content.replace('</body>', f'    {script_html}\n</body>')
                changed = True
            elif '</head>' in content:
                content = content.replace('</head>', f'    {script_html}\n</head>')
                changed = True

        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Added Bell/Script to {filename}")
        else:
            print(f"No changes needed or could not find injection point for {filename}")
    else:
        print(f"File not found: {filename}")
