const User = require('../../models/Users');
const TopupRequest = require('../../models/TopupRequest');
const Transaction = require('../../models/Transaction');
const { asyncHandler, sendSuccess } = require('../../services/helper');

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

exports.getStats = asyncHandler(async (_req, res) => {
  const todayStart = startOfToday();
  const monthStart = startOfMonth();

  const [topupStats, withdrawalStats, totalUsers] = await Promise.all([
    TopupRequest.aggregate([
      {
        $facet: {
          pendingReview: [
            { $match: { status: 'under_review' } },
            { $count: 'count' },
          ],
          allTimeApproved: [
            { $match: { status: 'approved' } },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                revenue: { $sum: '$expectedAmount' },
              },
            },
          ],
          todayApproved: [
            {
              $match: {
                status: 'approved',
                reviewedAt: { $gte: todayStart },
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: '$expectedAmount' },
              },
            },
          ],
          monthApproved: [
            {
              $match: {
                status: 'approved',
                reviewedAt: { $gte: monthStart },
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: '$expectedAmount' },
              },
            },
          ],
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { type: 'withdraw', status: 'success' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
        },
      },
    ]),
    User.countDocuments({ deletedAt: null }),
  ]);

  const topup = topupStats[0] || {};
  const withdrawals = withdrawalStats[0] || {};

  const totalRevenue = topup.allTimeApproved?.[0]?.revenue || 0;

  // TODO: subtract platform costs/fees when a cost-tracking schema is added
  const profit = totalRevenue;

  sendSuccess(res, {
    data: {
      totalRevenue,
      profit,
      profitNote:
        'No platform cost/fees schema yet — profit equals totalRevenue until cost tracking is added.',
      totalUsers,
      totalPayments: topup.allTimeApproved?.[0]?.count || 0,
      totalWithdrawals: {
        count: withdrawals.count || 0,
        amount: withdrawals.amount || 0,
      },
      totalGames: null,
      totalGamesNote:
        'No Game model in codebase. Aviator rounds are in-memory only; SpinHistory (wheel) and Transaction game_debit/game_credit are separate metrics.',
      pendingReviewCount: topup.pendingReview?.[0]?.count || 0,
      todayRevenue: topup.todayApproved?.[0]?.revenue || 0,
      thisMonthRevenue: topup.monthApproved?.[0]?.revenue || 0,
    },
  });
});
