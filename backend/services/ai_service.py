import os
import io
from google.cloud import vision
from google.oauth2 import service_account

class AIService:
    def __init__(self, credentials_source):
        self.credentials_source = credentials_source
        self.client = None
        self._init_client()

    def _init_client(self):
        try:
            if isinstance(self.credentials_source, dict):
                 credentials = service_account.Credentials.from_service_account_info(self.credentials_source)
                 self.client = vision.ImageAnnotatorClient(credentials=credentials)
            elif isinstance(self.credentials_source, str) and os.path.exists(self.credentials_source):
                credentials = service_account.Credentials.from_service_account_file(self.credentials_source)
                self.client = vision.ImageAnnotatorClient(credentials=credentials)
            else:
                print(f"Warning: Invalid credentials source: {self.credentials_source}")
        except Exception as e:
            print(f"Error initializing Vision Client: {e}")

    def verify_image(self, image_content):
        """
        Verifies an image for safety (SafeSearch, Labels, Objects).
        Returns a dict with isSafe (bool) and reasons (list).
        """
        if not self.client:
            return {"isSafe": False, "reasons": ["AI Service not initialized (Missing Credentials)"]}

        image = vision.Image(content=image_content)
        
        # Features to request
        features = [
            vision.Feature(type_=vision.Feature.Type.SAFE_SEARCH_DETECTION),
            vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION),
            vision.Feature(type_=vision.Feature.Type.OBJECT_LOCALIZATION),
        ]
        
        request = vision.AnnotateImageRequest(image=image, features=features)
        
        try:
            response = self.client.annotate_image(request)
            
            reasons = []
            
            # 1. Safe Search Check
            safe_search = response.safe_search_annotation
            likelihood_name = ('UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY')
            
            # Threshold: LIKELY or VERY_LIKELY is unsafe
            if safe_search.adult >= 4 or safe_search.violence >= 4 or safe_search.racy >= 4:
                reasons.append("Content flagged as inappropriate (Adult/Violence/Racy)")

            # 2. Label Detection (Restricted Items)
            restricted_labels = ['gun', 'weapon', 'firearm', 'knife', 'drug', 'explosive']
            found_labels = [label.description.lower() for label in response.label_annotations]
            
            for restricted in restricted_labels:
                for label in found_labels:
                    if restricted in label:
                        reasons.append(f"Restricted item detected: {label}")
                        break

            # 3. Object Localization (Restricted Objects)
            found_objects = [obj.name.lower() for obj in response.localized_object_annotations]
            for restricted in restricted_labels:
                for obj in found_objects:
                    if restricted in obj:
                        reasons.append(f"Restricted object detected: {obj}")
                        break

            return {
                "isSafe": len(reasons) == 0,
                "reasons": list(set(reasons)) # Unique reasons
            }

        except Exception as e:
            print(f"Vision API Error: {e}")
            return {"isSafe": False, "reasons": [f"API Error: {str(e)}"]}
