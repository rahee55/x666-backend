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
        } else if (rand <= 98) {
            return this.getRandom(20.00, 50.00);      // 3% chance (95.01 to 98.00)
        } else if (rand <= 99) {
            return this.getRandom(50.00, 100.00);     // 1% chance (98.01 to 99.00)
        } else if (rand <= 99.7) {
            return this.getRandom(100.00, 150.00);    // 0.7% chance (99.01 to 99.70)
        } else if (rand <= 99.9) {
            return this.getRandom(200.00, 300.00);    // 0.2% chance (99.71 to 99.90)
        } else {
            return this.getRandom(300.00, 666.00);    // 0.1% chance (99.91 to 100.00)
        }
    }

    getRandom(min, max) {
        return parseFloat((Math.random() * (max - min) + min).toFixed(2));
    }

    shouldForceCrash(totalBetAmount, totalCashedOutAmount) {
        if (totalBetAmount === 0) return false;
        
        const cashoutRatio = totalCashedOutAmount / totalBetAmount;
        return cashoutRatio >= 0.70;
    }
}

module.exports = new AviatorService();