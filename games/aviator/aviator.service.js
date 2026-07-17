// games/aviator/aviator.service.js

class AviatorService {
    /**
     * Generates a target crash multiplier based on defined probabilities:
     * - 1.00 to 2.00 (40% chance)
     * - 2.00 to 5.00 (40% chance)
     * - 5.00 to 10.00 (10% chance)
     * - 10.00 to 10000.00 (10% chance with exponential rarity scaling)
     */
    generateTargetMultiplier() {
        const rand = Math.random() * 100;

        if (rand <= 40) {
            return this.getRandom(1.00, 2.00);
        } else if (rand <= 80) {
            return this.getRandom(2.00, 5.00);
        } else if (rand <= 90) {
            return this.getRandom(5.00, 10.00);
        } else {
            // High-risk/High-reward bracket (remaining 10%)
            // Scales exponentially so hitting near 10000.00 matches your 0.01% target
            const extremeRand = Math.random();
            if (extremeRand > 0.999) { 
                return this.getRandom(5000.00, 10000.00); 
            } else if (extremeRand > 0.95) {
                return this.getRandom(100.00, 5000.00);
            } else {
                return this.getRandom(10.00, 100.00);
            }
        }
    }

    getRandom(min, max) {
        return parseFloat((Math.random() * (max - min) + min).toFixed(2));
    }


    shouldForceCrash(totalBetAmount, totalCashedOutAmount) {
        if (totalBetAmount === 0) return false;
        
        const cashoutRatio = totalCashedOutAmount / totalBetAmount;
        return cashoutRatio >= 0.60;
    }
}

module.exports = new AviatorService();