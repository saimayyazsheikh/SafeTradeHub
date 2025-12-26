import re

class PriceAnalytics:
    def clean_price(self, price_str):
        # Remove non-numeric characters except decimal point
        # Handle "Rs.", "PKR", commas, etc.
        try:
            # Extract number using regex
            # Matches numbers like 1,200 or 1200.00
            match = re.search(r'[\d,]+(\.\d+)?', str(price_str))
            if match:
                clean_str = match.group(0).replace(',', '')
                return float(clean_str)
        except Exception:
            pass
        return None

    def analyze(self, results):
        prices = []
        for item in results:
            raw_price = item.get('price')
            clean_price = self.clean_price(raw_price)
            if clean_price is not None:
                prices.append(clean_price)
                item['clean_price'] = clean_price # Store for reference

        if not prices:
            return {
                'min': 0,
                'max': 0,
                'average': 0,
                'count': 0,
                'suggested_min': 0,
                'suggested_max': 0
            }

        min_price = min(prices)
        max_price = max(prices)
        avg_price = sum(prices) / len(prices)

        # Suggest a range around the average, or between min and avg
        # Strategy: Suggest slightly below average to be competitive, up to average
        suggested_min = avg_price * 0.9
        suggested_max = avg_price * 1.05

        return {
            'min': round(min_price, 2),
            'max': round(max_price, 2),
            'average': round(avg_price, 2),
            'count': len(prices),
            'suggested_min': round(suggested_min, 2),
            'suggested_max': round(suggested_max, 2)
        }
