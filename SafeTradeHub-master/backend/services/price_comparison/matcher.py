import re

class SmartMatcher:
    def __init__(self, threshold=0):
        # Threshold is no longer strictly used as we use deterministic rules
        self.threshold = threshold

    def filter_matches(self, user_title, scraped_results):
        matched_results = []
        user_title_lower = user_title.lower()
        user_clean = re.sub(r'[^a-z0-9\s]', '', user_title_lower)
        user_tokens = set(user_clean.split())
        
        # 1. Extract Numbers (e.g. '13', '256', 's22', 'm1')
        user_numbers = set([t for t in user_tokens if re.search(r'\d', t)])
        
        # 2. Extract Strict Modifiers (Must match exactly between user and item)
        strict_mods = {'pro', 'max', 'ultra', 'plus', 'fe', 'lite', 'mini', 'air'}
        user_strict = set([t for t in user_tokens if t in strict_mods])
        
        # 3. Extract Required Modifiers (If user specifies, item MUST have)
        req_mods = {'pta', 'non', 'x', 'xr', 'xs', 'iv', 'iii', 'ii'}
        user_req = set([t for t in user_tokens if t in req_mods])

        base_words = user_tokens - user_numbers - user_strict - user_req

        for item in scraped_results:
            item_title_lower = item.get('title', '').lower()
            item_clean = re.sub(r'[^a-z0-9\s]', '', item_title_lower)
            item_tokens = set(item_clean.split())
            
            item_numbers = set([t for t in item_tokens if re.search(r'\d', t)])
            item_strict = set([t for t in item_tokens if t in strict_mods])
            item_req = set([t for t in item_tokens if t in req_mods])
            item_base_words = item_tokens - item_numbers - item_strict - item_req
            
            # Rule 1: All user numbers must be present in the item
            if not user_numbers.issubset(item_numbers):
                continue
                
            # Rule 2: Strict modifiers must EXACTLY match
            if user_strict != item_strict:
                continue
                
            # Rule 3: Required modifiers specified by user MUST be in item
            if not user_req.issubset(item_req):
                continue

            # Rule 4 & 5: Base word validation
            if not user_numbers and not user_strict and not user_req:
                # If no specific identifiers, require all base words to be present
                if not base_words.issubset(item_base_words):
                    continue
            else:
                # Otherwise just require at least one base word intersection to confirm brand/category
                if base_words and not base_words.intersection(item_base_words):
                    continue
                
            # If it passes all rules, it's a 100% correct match!
            overlap = len(user_tokens.intersection(item_tokens)) / max(1, len(user_tokens))
            item['match_score'] = overlap
            matched_results.append(item)
            
        # Sort by match score descending
        matched_results.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        return matched_results
