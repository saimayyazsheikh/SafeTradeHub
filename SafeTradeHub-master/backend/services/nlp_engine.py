from textblob import TextBlob
from firebase_admin import db
import collections
import re
import nltk

# Ensure NLTK data is available
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

class NLPEngine:
    def __init__(self):
        # Basic stop words to filter out noise
        self.stop_words = set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'if', 'this', 'that', 'with', 'for', 'it', 'in', 'to', 'of', 'was', 'very', 'good', 'great', 'excellent'])

    def analyze_trends(self):
        """
        Analyzes all reviews to extract trending keywords and categories.
        Returns a dictionary with trending keywords and their frequency.
        """
        try:
            # We use the db reference from firebase_admin which should already be initialized in app.py
            reviews_ref = db.reference('reviews')
            reviews = reviews_ref.get()
            
            if not reviews:
                return {"keywords": [], "categories": []}

            keywords_count = collections.Counter()
            category_count = collections.Counter()
            
            # Fetch products to map reviews to categories (for trend detection)
            products_ref = db.reference('products')
            products = products_ref.get() or {}

            for r_id, review in reviews.items():
                if not isinstance(review, dict): continue
                
                comment = review.get('comment', '')
                rating = int(review.get('rating', 0))
                product_id = review.get('productId')

                # Only analyze positive reviews (rating >= 4) to find positive trends
                if rating >= 4 and comment:
                    blob = TextBlob(comment)
                    
                    # Extract words and filter
                    for word in blob.words:
                        clean_word = word.lower()
                        # Only count meaningful words
                        if len(clean_word) > 2 and clean_word not in self.stop_words:
                            keywords_count[clean_word] += 1
                
                # Track categories of products being reviewed positively
                if rating >= 4 and product_id and product_id in products:
                    cat = products[product_id].get('category')
                    if cat:
                        category_count[cat] += 1

            # Get top 10 keywords and top 5 categories
            top_keywords = [{"keyword": k, "count": v} for k, v in keywords_count.most_common(10)]
            top_categories = [{"category": k, "count": v} for k, v in category_count.most_common(5)]

            return {
                "keywords": top_keywords,
                "categories": top_categories
            }
        except Exception as e:
            print(f"Error in NLP analysis: {e}")
            return {"keywords": [], "categories": []}

    def get_sentiment(self, text):
        """Returns sentiment polarity (-1.0 to 1.0)"""
        if not text: return 0
        return TextBlob(text).sentiment.polarity
