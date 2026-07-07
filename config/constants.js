// config/constants.js
module.exports = {
  SPIN_SLOTS: [50, 100, 500, 1000, 10000],
  SPIN_WEIGHTS: [85, 15, 0, 0, 0], // must sum to 100; edit anytime, no code change
  SPIN_COST: 0, // set >0 if a spin should cost money to play
  SPIN_LIFETIME_LIMIT: 1, // one spin per user, ever
  MIN_TOPUP: 100,
  MIN_WITHDRAW: 100,
  REFERRAL_COUNT_FOR_BONUS: 50,
  REFERRAL_BONUS_AMOUNT: 1000,
};
