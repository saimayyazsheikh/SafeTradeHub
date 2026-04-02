import codecs

with codecs.open('static/js/staff-dashboard.js', 'r', 'utf-8') as f:
    c = f.read()

# Fix the fragile replace chains which throw TypeErrors if databaseURL is missing
c = c.replace("appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '')", "(appOptions.databaseURL ? appOptions.databaseURL.replace('https://', '').replace('.firebaseio.com', '') : projectId)")

with codecs.open('static/js/staff-dashboard.js', 'w', 'utf-8') as f:
    f.write(c)

print('Patched!')
