/**
 * FeeEngine - Microservice Utility for Logistics and Escrow Calculation
 * Stateless, decoupled from DOM, purely input-output logic.
 */

const FeeEngine = {
    /**
     * Calculates shipping tier and base cost based on physical attributes.
     * @param {number} weight - Weight in kg
     * @param {number} length - Length in cm
     * @param {number} width - Width in cm
     * @param {number} height - Height in cm
     * @param {string} fragility - 'Solid', 'Standard', 'Fragile'
     * @returns {Object} Structured calculation result
     */
    calculateShipping: function(weight, length, width, height, fragility) {
        try {
            const w = parseFloat(weight) || 0;
            const l = parseFloat(length) || 0;
            const wi = parseFloat(width) || 0;
            const h = parseFloat(height) || 0;
            const f = (fragility || 'Standard').toLowerCase();

            if (w < 0 || l < 0 || wi < 0 || h < 0) {
                return { success: false, error: 'INVALID_DIMENSIONS' };
            }

            // 1. Weight Score
            let weightScore = 20;
            if (w > 2 && w <= 10) weightScore = 50;
            else if (w > 10) weightScore = 100;

            // 2. Volume Score
            const volume = l * wi * h; // cm^3
            let volumeScore = 20; // Small (< 10,000 cm3)
            if (volume > 10000 && volume <= 50000) volumeScore = 50; // Medium
            else if (volume > 50000) volumeScore = 100; // Large

            // 3. Fragility Score
            let fragilityScore = 50; // Standard
            if (f === 'solid') fragilityScore = 20;
            else if (f === 'fragile') fragilityScore = 100;

            // 4. Tier Mapping
            const averageScore = (weightScore + volumeScore + fragilityScore) / 3;
            
            let tierName = 'Below Avg';
            let calculatedFee = 250; // Base rate for Below Avg

            if (averageScore >= 40 && averageScore <= 70) {
                tierName = 'Avg';
                calculatedFee = 500;
            } else if (averageScore > 70) {
                tierName = 'Above Avg';
                calculatedFee = 1000;
            }

            return {
                success: true,
                data: {
                    tier: tierName,
                    score: averageScore,
                    fee: calculatedFee
                }
            };

        } catch (error) {
            return { success: false, error: 'CALCULATION_ERROR' };
        }
    },

    /**
     * Calculates escrow fee based on automatic value tiers.
     * @param {number} price - Product listing price
     * @returns {Object} Structured calculation result
     */
    calculateEscrow: function(price) {
        try {
            const p = parseFloat(price) || 0;
            if (p < 0) return { success: false, error: 'INVALID_PRICE' };

            let feePercentage = 0;
            let minFee = 0;
            let tier = 1;

            if (p <= 10000) {
                tier = 1;
                feePercentage = 0.02; // 2%
                minFee = 0;
            } else if (p > 10000 && p <= 50000) {
                tier = 2;
                feePercentage = 0.035; // 3.5%
                minFee = 0;
            } else if (p > 50000) {
                tier = 3;
                feePercentage = 0.05; // 5%
                minFee = 0;
            }

            let calculatedFee = p * feePercentage;
            if (calculatedFee < minFee && calculatedFee > 0) calculatedFee = minFee;

            return {
                success: true,
                data: {
                    tier: tier,
                    percentage: parseFloat((feePercentage * 100).toFixed(2)),
                    fee: calculatedFee
                }
            };
        } catch (error) {
            return { success: false, error: 'CALCULATION_ERROR' };
        }
    },

    /**
     * Calculates total shipping cost based on origin and destination cities.
     * @param {number} baseFee - Calculated base shipping fee
     * @param {string} originCity - Seller's city
     * @param {string} destinationCity - Buyer's delivery city
     * @returns {Object} Structured calculation result
     */
    calculateTotalShipping: function(baseFee, originCity, destCity) {
        try {
            const base = parseFloat(baseFee) || 0;
            const locationMap = {
                "islamabad": "Federal", "federal": "Federal",
                "karachi": "Sindh", "sindh": "Sindh",
                "lahore": "Punjab", "punjab": "Punjab",
                "multan": "Punjab",
                "faisalabad": "Punjab"
            };

            const origin = (originCity || "").trim().toLowerCase();
            const dest = (destCity || "").trim().toLowerCase();

            if (!origin || !dest) {
                return { success: true, data: { baseFee: base, surcharge: 0, total: base, reason: "Missing location data" } };
            }

            const findProv = (name) => {
                for (const [city, prov] of Object.entries(locationMap)) {
                    if (name.includes(city)) return prov;
                }
                return null;
            };

            const oProv = findProv(origin);
            const dProv = findProv(dest);

            if (!oProv || !dProv) {
                return { success: true, data: { baseFee: base, surcharge: 0, total: base, reason: `Province not identified for ${origin} or ${dest}` } };
            }

            let surcharge = 0;
            // Special check: Same City (if names match exactly after trim)
            if (origin === dest) {
                surcharge = 0;
            } else if (oProv === dProv) {
                surcharge = 150; // Same Province
            } else {
                surcharge = 350; // Cross Province
            }

            return {
                success: true,
                data: {
                    baseFee: base,
                    surcharge: surcharge,
                    total: base + surcharge,
                    originProvince: oProv,
                    destProvince: dProv
                }
            };
        } catch (error) {
            console.error('Shipping surcharge calculation error:', error);
            return { success: false, error: error.message };
        }
    }
};

window.FeeEngine = FeeEngine;
