import random

class MockScraper:
    def search(self, query):
        print(f" returning mock results for {query}")
        # Generate varied realistic results based on query
        base_price = 100000 if 'iphone' in query.lower() else 5000
        
        results = [
            {
                'source': 'Daraz',
                'title': f"{query} - Genuine (Mock Result)",
                'price': f"Rs. {base_price + random.randint(-5000, 5000):,}",
                'location': 'Karachi',
                'link': 'https://www.daraz.pk'
            },
            {
                'source': 'OLX',
                'title': f"Used {query} Good Condition",
                'price': f"Rs. {int(base_price * 0.8) + random.randint(-2000, 2000):,}",
                'location': 'Lahore',
                'link': 'https://www.olx.com.pk'
            },
            {
                'source': 'Daraz',
                'title': f"New {query} with Warranty",
                'price': f"Rs. {int(base_price * 1.1):,}",
                'location': 'Islamabad',
                'link': 'https://www.daraz.pk'
            }
        ]
        return results
