import requests
from bs4 import BeautifulSoup
import urllib.parse
import random
import time
import json

class BaseScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/'
        }

    def get_soup(self, url, is_json=False):
        try:
            time.sleep(random.uniform(0.5, 1.5))
            headers = self.headers.copy()
            if is_json:
                headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
                headers['X-Requested-With'] = 'XMLHttpRequest'
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            if is_json:
                return response.json()
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

class DarazScraper(BaseScraper):
    def search(self, query):
        encoded_query = urllib.parse.quote(query)
        # Use AJAX endpoint
        url = f"https://www.daraz.pk/catalog/?q={encoded_query}&ajax=true"
        print(f"Fetching Daraz: {url}")
        data = self.get_soup(url, is_json=True)
        results = []

        if not data:
            return results

        try:
            mods = data.get('mods', {})
            list_items = mods.get('listItems', [])
            
            for item in list_items[:10]:
                title = item.get('name')
                price = item.get('price')
                location = item.get('location', 'Pakistan')
                # Fix: Use 'itemUrl' or 'pUrl' instead of 'productUrl'
                product_url = item.get('itemUrl') or item.get('pUrl') or item.get('productUrl')
                
                if product_url and not product_url.startswith('http'):
                    product_url = "https:" + product_url
                    
                if title and price:
                        results.append({
                        'source': 'Daraz',
                        'title': title,
                        'price': price,
                        'location': location,
                        'link': product_url
                    })
        except Exception as e:
            print(f"Error parsing Daraz JSON: {e}")
        
        return results

class OLXScraper(BaseScraper):
    def search(self, query):
        encoded_query = urllib.parse.quote(query)
        # Try generic search URL
        url = f"https://www.olx.com.pk/items/q-{encoded_query}"
        print(f"Fetching OLX: {url}")
        soup = self.get_soup(url)
        results = []

        if not soup:
            return results

        # Update selectors based on inspection (if possible)
        # Current best guess for OLX
        items = soup.find_all('li', {'aria-label': 'Listing'})
        
        if not items:
             items = soup.select('li article') # Fallback

        for item in items[:10]:
            try:
                title_tag = item.find('h2') or item.find('div', {'aria-label': 'Title'})
                price_tag = item.find('span', {'aria-label': 'Price'}) or item.select_one('div[aria-label="Price"]')
                location_tag = item.find('span', {'aria-label': 'Location'})
                link_tag = item.find('a')

                if title_tag and price_tag:
                    title = title_tag.get_text(strip=True)
                    price = price_tag.get_text(strip=True)
                    location = location_tag.get_text(strip=True) if location_tag else "Pakistan"
                    link = link_tag['href'] if link_tag else "#"
                    
                    if link and not link.startswith('http'):
                        link = "https://www.olx.com.pk" + link

                    results.append({
                        'source': 'OLX',
                        'title': title,
                        'price': price,
                        'location': location,
                        'link': link
                    })
            except Exception as e:
                print(f"Error parsing OLX item: {e}")
                continue

        return results
