import difflib

class SmartMatcher:
    def __init__(self, threshold=0.4):
        self.threshold = threshold

    def filter_matches(self, user_title, scraped_results):
        matched_results = []
        user_title_lower = user_title.lower()
        user_tokens = set(user_title_lower.split())

        for item in scraped_results:
            item_title = item.get('title', '')
            item_title_lower = item_title.lower()
            
            # 1. Token Overlap Check (Basic)
            # Check if at least some significant words match
            item_tokens = set(item_title_lower.split())
            common_tokens = user_tokens.intersection(item_tokens)
            
            # If user title is short, require high overlap. If long, looser.
            if len(user_tokens) > 0:
                overlap_ratio = len(common_tokens) / len(user_tokens)
            else:
                overlap_ratio = 0

            # 2. Sequence Matcher (Fuzzy)
            similarity = difflib.SequenceMatcher(None, user_title_lower, item_title_lower).ratio()
            
            # Combine heuristics:
            # Accept if similarity is high OR if there is significant token overlap
            if similarity >= self.threshold or overlap_ratio > 0.5:
                # Add similarity score for sorting
                item['match_score'] = max(similarity, overlap_ratio)
                matched_results.append(item)

        # Sort by match score descending
        matched_results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        return matched_results
