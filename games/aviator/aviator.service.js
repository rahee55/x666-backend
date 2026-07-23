// games/aviator/aviator.service.js
class AviatorService {
   generateTargetMultiplier() {
        const rand = Math.random() * 100;

        if (rand <= 80) {
            return this.getRandom(1.00, 2.00);        // 80% chance
        } else if (rand <= 85) {
            return this.getRandom(2.00, 5.00);        // 5% chance
        } else if (rand <= 90) {
            return this.getRandom(5.00, 10.00);       // 5% chance
        } else if (rand <= 95) {
            return this.getRandom(10.00, 20.00);      // 5% chance
        } else {
            // This block handles the remaining 5% (when rand is 95.01 to 100)
            const extremeRand = Math.random();
            
            if (extremeRand > 0.999) { 
                // 0.1% of the 5% chance: Massive Jackpot
                return this.getRandom(5000.00, 10000.00); 
            } else if (extremeRand > 0.95) {
                // 4.9% of the 5% chance: Huge Win
                return this.getRandom(100.00, 5000.00);
            } else {
                // 95% of the 5% chance: Big Win (Adjusted to start at 20.00)
                return this.getRandom(20.00, 100.00);
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