/**
 * FORM-BUILDER.MODULE.JS
 * Dynamic form engine for SafeTradeHub product attributes.
 */

class FormBuilder {
    constructor(containerId, variantContainerId) {
        this.container = document.getElementById(containerId);
        this.variantContainer = document.getElementById(variantContainerId);
        this.metadata = null;
        this.currentCategory = null;
    }

    async init() {
        console.log("FormBuilder initialized");
    }

    /**
     * Fetches metadata for a specific category and renders the dynamic fields.
     */
    async loadCategorySchema(category) {
        console.log(`[FormBuilder] Loading schema for: ${category}`);
        if (!category) {
            this.metadata = null;
            this.render();
            return;
        }

        if (this.currentCategory === category && this.metadata) return;
        this.currentCategory = category;

        try {
            const snapshot = await firebase.database().ref(`category_metadata/${category}`).once('value');
            this.metadata = snapshot.val();
            
            if (!this.metadata) {
                console.warn(`[FormBuilder] No metadata found for category: ${category}`);
            } else {
                console.log(`[FormBuilder] Schema loaded successfully for ${category}`);
            }

            this.render();
        } catch (error) {
            console.error("[FormBuilder] Error loading category schema:", error);
            this.metadata = null;
            this.render();
        }
    }

    render() {
        this.clear();
        if (!this.metadata) {
            // Optional: Show a subtle placeholder if no specific fields
            if (this.container) {
                this.container.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem; font-style: italic;">No specific fields for this category.</p>';
            }
            return;
        }

        console.log("[FormBuilder] Rendering dynamic fields...");
        // 1. Render Dynamic Fields
        if (this.metadata.fields) {
            const fieldsHtml = this.metadata.fields.map(field => this.createFieldHtml(field)).join('');
            this.container.innerHTML = `
                <div class="axiom-card dynamic-fields-card" style="margin-top: 24px;">
                    <h2 class="card-title">Category Specific Details</h2>
                    <p class="card-desc">Required information for ${this.currentCategory.charAt(0).toUpperCase() + this.currentCategory.slice(1)}.</p>
                    <div class="dynamic-fields-grid">
                        ${fieldsHtml}
                    </div>
                </div>
            `;
        }

        // 2. Render Variant Inventory if applicable
        if (this.metadata.hasVariantInventory) {
            this.renderVariantInventory();
        } else {
            // Re-show standard inventory if it was hidden
            const inventoryGroup = document.getElementById('inventoryGroup');
            if (inventoryGroup) inventoryGroup.style.display = 'block';
        }

        // 3. Handle Service-specific UI changes
        this.handleServiceLogic();
    }

    createFieldHtml(field) {
        // We remove browser-native 'required' to prevent "not focusable" errors in hidden tabs.
        // Validation is handled manually in the validate() method.
        const requiredAttr = ''; 
        const hintHtml = field.hint ? `<div class="axiom-hint">${field.hint}</div>` : '';
        
        let inputHtml = '';

        switch (field.type) {
            case 'text':
                inputHtml = `<input type="text" id="dynamic_${field.id}" name="dynamic_${field.id}" class="axiom-input" placeholder="${field.placeholder || field.label}" ${requiredAttr}>`;
                break;
            case 'number':
                inputHtml = `<input type="number" id="dynamic_${field.id}" name="dynamic_${field.id}" class="axiom-input" placeholder="${field.placeholder || field.label}" min="${field.min || 0}" max="${field.max || ''}" ${requiredAttr}>`;
                break;
            case 'textarea':
                inputHtml = `<textarea id="dynamic_${field.id}" name="dynamic_${field.id}" class="axiom-textarea" rows="4" placeholder="${field.placeholder || field.label}" ${requiredAttr}></textarea>`;
                break;
            case 'select':
            case 'dropdown':
                const options = (field.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('');
                inputHtml = `
                    <select id="dynamic_${field.id}" name="dynamic_${field.id}" class="axiom-select" style="display: block !important; visibility: visible !important; opacity: 1 !important; min-height: 45px;" ${requiredAttr}>
                        <option value="">Select ${field.label}</option>
                        ${options}
                    </select>
                `;
                break;
            case 'file':
                inputHtml = `
                    <div class="dynamic-file-upload">
                        <input type="file" id="dynamic_${field.id}" name="dynamic_${field.id}" accept="image/*" class="axiom-input" ${requiredAttr}>
                    </div>
                `;
                break;
        }

        return `
            <div class="axiom-group">
                <label for="dynamic_${field.id}" class="axiom-label">${field.label} ${field.required ? '*' : ''}</label>
                ${inputHtml}
                ${hintHtml}
            </div>
        `;
    }

    renderVariantInventory() {
        if (!this.variantContainer) return;

        // Hide standard inventory field
        const inventoryGroup = document.getElementById('inventoryGroup');
        const productStock = document.getElementById('productStock');
        if (inventoryGroup) inventoryGroup.style.display = 'none';
        if (productStock) productStock.removeAttribute('required');

        const variants = this.metadata.variants || [];
        const variantType = this.metadata.variantType || 'Size';
        const variantHtml = variants.map(v => `
            <div class="variant-stock-item">
                <label>${v}</label>
                <input type="number" class="axiom-input variant-stock-input" data-variant="${v}" placeholder="0" min="0" value="0">
            </div>
        `).join('');

        this.variantContainer.innerHTML = `
            <div class="axiom-card variant-inventory-card" style="margin-top: 24px;">
                <h2 class="card-title">Variant Inventory (${variantType}-wise Stock)</h2>
                <p class="card-desc">Specify available quantities for each ${variantType.toLowerCase()}.</p>
                <div class="variant-stock-grid">
                    ${variantHtml}
                </div>
            </div>
        `;
    }

    handleServiceLogic() {
        const shippingSection = document.getElementById('section-shipping');
        if (!shippingSection) return;

        const isService = this.metadata.isService === true;
        const shippingHeader = shippingSection.querySelector('h2');
        const shippingDesc = shippingSection.querySelector('p.card-desc');

        if (isService) {
            if (shippingHeader) shippingHeader.textContent = "Service Booking & Delivery";
            if (shippingDesc) shippingDesc.textContent = "Digital delivery or appointment-based service info.";
            const shippingCostGroup = shippingSection.querySelector('.input-grid');
            if (shippingCostGroup) shippingCostGroup.style.opacity = '0.5';
        } else {
            if (shippingHeader) shippingHeader.textContent = "Shipping & Policy";
            if (shippingDesc) shippingDesc.textContent = "Define delivery methods and return rules.";
            const shippingCostGroup = shippingSection.querySelector('.input-grid');
            if (shippingCostGroup) shippingCostGroup.style.opacity = '1';
        }
    }

    clear() {
        if (this.container) this.container.innerHTML = '';
        if (this.variantContainer) this.variantContainer.innerHTML = '';
        
        const inventoryGroup = document.getElementById('inventoryGroup');
        const productStock = document.getElementById('productStock');
        if (inventoryGroup) inventoryGroup.style.display = 'block';
        if (productStock) productStock.setAttribute('required', 'required');
    }

    async collectDynamicData() {
        const data = {};
        if (!this.metadata || !this.metadata.fields) return data;

        for (const field of this.metadata.fields) {
            const el = document.getElementById(`dynamic_${field.id}`);
            if (!el) continue;

            if (field.type === 'file') {
                if (el.files && el.files[0]) {
                    const file = el.files[0];
                    const storagePath = `category_assets/${Date.now()}_${file.name}`;
                    const snapshot = await firebase.storage().ref(storagePath).put(file);
                    data[field.id] = await snapshot.ref.getDownloadURL();
                }
            } else {
                data[field.id] = el.value;
            }
        }
        return data;
    }

    collectVariantInventory() {
        if (!this.metadata || !this.metadata.hasVariantInventory) return null;

        const inventory = {};
        let totalStock = 0;
        document.querySelectorAll('.variant-stock-input').forEach(input => {
            const v = input.getAttribute('data-variant');
            const qty = parseInt(input.value) || 0;
            inventory[v] = qty;
            totalStock += qty;
        });

        return {
            type: this.metadata.variantType,
            data: inventory,
            total: totalStock
        };
    }

    validate() {
        if (!this.metadata || !this.metadata.fields) return true;

        for (const field of this.metadata.fields) {
            if (field.required) {
                const el = document.getElementById(`dynamic_${field.id}`);
                if (!el) continue;
                if (field.type === 'file') {
                    if (!el.files || el.files.length === 0) {
                        window.NotificationManager.showToast('Field Required', `${field.label} is required for this category.`, 'warning');
                        return false;
                    }
                } else if (!el.value.trim()) {
                    window.NotificationManager.showToast('Field Required', `${field.label} is required for this category.`, 'warning');
                    return false;
                }
            }
        }
        return true;
    }
}

window.FormBuilder = FormBuilder;
