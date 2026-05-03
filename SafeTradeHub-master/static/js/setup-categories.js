/**
 * SETUP-CATEGORIES.JS
 * Use this script to restore the deleted category_metadata node in Firebase.
 * This version includes all 12 categories with correct fields and variant settings.
 * Copy and paste this into your browser console while on any page of SafeTradeHub (where firebase is initialized).
 */

async function setupCategoryMetadata() {
    const db = firebase.database();
    const categories = {
        "mobile": {
            "title": "Mobiles & Tablets",
            "fields": [
                { "id": "brand", "label": "Brand", "type": "text", "placeholder": "e.g. Apple, Samsung", "required": true },
                { "id": "model", "label": "Model Name", "type": "text", "placeholder": "e.g. iPhone 15 Pro", "required": true },
                { "id": "storage", "label": "Storage Capacity", "type": "select", "options": ["64GB", "128GB", "256GB", "512GB", "1TB"], "required": true },
                { "id": "ram", "label": "RAM", "type": "select", "options": ["4GB", "6GB", "8GB", "12GB", "16GB"], "required": true },
                { "id": "condition_score", "label": "Physical Condition (1-10)", "type": "number", "min": 1, "max": 10, "required": true }
            ],
            "hasVariantInventory": false
        },
        "camera": {
            "title": "Cameras & Photography",
            "fields": [
                { "id": "brand", "label": "Brand", "type": "text", "placeholder": "e.g. Canon, Sony, Nikon", "required": true },
                { "id": "type", "label": "Camera Type", "type": "select", "options": ["DSLR", "Mirrorless", "Point & Shoot", "Action Camera"], "required": true },
                { "id": "resolution", "label": "Resolution (MP)", "type": "number", "required": true },
                { "id": "shutter_count", "label": "Shutter Count (approx)", "type": "number", "required": false }
            ],
            "hasVariantInventory": false
        },
        "computers": {
            "title": "Computers & Laptops",
            "fields": [
                { "id": "brand", "label": "Brand", "type": "text", "required": true },
                { "id": "processor", "label": "Processor", "type": "text", "placeholder": "e.g. Intel i7, M2", "required": true },
                { "id": "ram", "label": "RAM", "type": "select", "options": ["8GB", "16GB", "32GB", "64GB"], "required": true },
                { "id": "storage_type", "label": "Storage Type", "type": "select", "options": ["SSD", "HDD", "NVMe"], "required": true },
                { "id": "gpu", "label": "Graphics Card", "type": "text", "required": false }
            ],
            "hasVariantInventory": false
        },
        "fashion": {
            "title": "Fashion & Apparel",
            "fields": [
                { "id": "brand", "label": "Brand", "type": "text", "required": true },
                { "id": "material", "label": "Material", "type": "text", "required": true },
                { "id": "gender", "label": "Gender", "type": "select", "options": ["Men", "Women", "Unisex", "Kids"], "required": true }
            ],
            "hasVariantInventory": true,
            "variantType": "Size",
            "variants": ["XS", "S", "M", "L", "XL", "XXL"]
        },
        "furniture": {
            "title": "Furniture",
            "fields": [
                { "id": "material", "label": "Material", "type": "text", "placeholder": "e.g. Oak Wood, Metal", "required": true },
                { "id": "room_type", "label": "Room Type", "type": "select", "options": ["Living Room", "Bedroom", "Office", "Dining Room", "Outdoor"], "required": true },
                { "id": "dimensions", "label": "Dimensions (L x W x H)", "type": "text", "placeholder": "e.g. 120x60x75 cm", "required": false }
            ],
            "hasVariantInventory": false
        },
        "beauty": {
            "title": "Beauty & Health",
            "fields": [
                { "id": "brand", "label": "Brand", "type": "text", "required": true },
                { "id": "product_type", "label": "Product Type", "type": "select", "options": ["Skincare", "Makeup", "Fragrance", "Haircare", "Health Supplement"], "required": true },
                { "id": "expiry_date", "label": "Expiry Date", "type": "text", "placeholder": "MM/YYYY", "required": true }
            ],
            "hasVariantInventory": false
        },
        "books": {
            "title": "Books",
            "fields": [
                { "id": "author", "label": "Author", "type": "text", "required": true },
                { "id": "genre", "label": "Genre", "type": "select", "options": ["Fiction", "Non-Fiction", "Textbook", "Self-Help", "Biography", "Comics"], "required": true },
                { "id": "language", "label": "Language", "type": "select", "options": ["English", "Urdu", "Other"], "required": true },
                { "id": "format", "label": "Format", "type": "select", "options": ["Hardcover", "Paperback", "E-book"], "required": true }
            ],
            "hasVariantInventory": false
        },
        "gym": {
            "title": "Gym & Fitness",
            "fields": [
                { "id": "equipment_type", "label": "Equipment Type", "type": "text", "placeholder": "e.g. Dumbbells, Treadmill", "required": true },
                { "id": "brand", "label": "Brand", "type": "text", "required": false },
                { "id": "weight_range", "label": "Weight (kg)", "type": "number", "required": false }
            ],
            "hasVariantInventory": false
        },
        "home": {
            "title": "Home Appliances",
            "fields": [
                { "id": "brand", "label": "Brand", "type": "text", "required": true },
                { "id": "power_rating", "label": "Power Rating (Watts)", "type": "number", "required": false },
                { "id": "warranty", "label": "Warranty Remaining", "type": "text", "placeholder": "e.g. 1 Year", "required": false }
            ],
            "hasVariantInventory": false
        },
        "pets": {
            "title": "Pets & Animals",
            "fields": [
                { "id": "animal_type", "label": "Animal Type", "type": "select", "options": ["Dog", "Cat", "Bird", "Fish", "Other"], "required": true },
                { "id": "breed", "label": "Breed", "type": "text", "required": false },
                { "id": "age", "label": "Age", "type": "text", "placeholder": "e.g. 2 Years", "required": false }
            ],
            "hasVariantInventory": false
        },
        "sports": {
            "title": "Sports & Outdoors",
            "fields": [
                { "id": "sport_type", "label": "Sport Type", "type": "text", "placeholder": "e.g. Cricket, Football", "required": true },
                { "id": "age_group", "label": "Age Group", "type": "select", "options": ["Adult", "Junior", "Professional"], "required": false }
            ],
            "hasVariantInventory": false
        },
        "services": {
            "title": "Professional Services",
            "fields": [
                { "id": "service_type", "label": "Service Type", "type": "select", "options": ["IT & Software", "Design & Creative", "Marketing", "Consulting", "Education/Tutoring", "Home Services"], "required": true },
                { "id": "duration", "label": "Est. Duration", "type": "text", "placeholder": "e.g. 3 Days, 1 Hour", "required": true },
                { "id": "location_type", "label": "Service Location", "type": "select", "options": ["Remote/Online", "In-Person (at client)", "In-Person (at provider)"], "required": true }
            ],
            "hasVariantInventory": false,
            "isService": true
        }
    };

    console.log("🚀 Starting Full Category Metadata Restoration (12 Categories)...");
    
    try {
        await db.ref('category_metadata').set(categories);
        console.log("✅ Successfully restored category_metadata node with 12 categories!");
        alert("Category Metadata (12 Categories) has been restored successfully!");
    } catch (error) {
        console.error("❌ Error restoring metadata:", error);
        alert("Failed to restore metadata: " + error.message);
    }
}

// Call the function
setupCategoryMetadata();
