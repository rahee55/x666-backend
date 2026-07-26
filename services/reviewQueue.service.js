const mongoose = require('mongoose');
const TopupRequest = require('../models/TopupRequest');
const Transaction = require('../models/Transaction');
const { makeDataTable, buildMongoSort } = require('./table.service');
const { formatTopupRequest } = require('./topupService');

const escapeRegExp = (string) => String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isEmptyFilter = (value) =>
  value === undefined || value === null || value === '' || value === 'all';

const formatUser = (userDoc) => {
  if (!userDoc) return null;
  const user = Array.isArray(userDoc) ? userDoc[0] : userDoc;
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
};

const formatTopupReviewRow = (row) => ({
  reviewType: 'topup',
  id: String(row._id),
  ...formatTopupRequest(row),
  amount: row.expectedAmount,
  user: formatUser(row.userId),
});

const formatWithdrawReviewRow = (row) => ({
  reviewType: 'withdraw',
  id: String(row._id),
  transactionId: String(row._id),
  type: row.type,
  amount: row.amount,
  status: row.status,
  gatewayRef: row.gatewayRef,
  destinationAccount: row.destinationAccount,
  accountUsed: row.accountUsed,
  adminNotes: row.adminNotes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  user: formatUser(row.userId),
});

const buildDateMatch = (filters = {}) => {
  const fromDate = filters.fromDate || filters.createdAtFrom;
  const toDate = filters.toDate || filters.createdAtTo;
  if (isEmptyFilter(fromDate) && isEmptyFilter(toDate)) {
    return {};
  }

  const createdAt = {};
  if (!isEmptyFilter(fromDate)) {
    createdAt.$gte = new Date(fromDate);
  }
  if (!isEmptyFilter(toDate)) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    createdAt.$lte = end;
  }
  return { createdAt };
};

const buildUserMatch = (filters = {}) => {
  if (isEmptyFilter(filters.userId)) {
    return {};
  }
  if (!mongoose.Types.ObjectId.isValid(filters.userId)) {
    return { userId: filters.userId };
  }
  return { userId: new mongoose.Types.ObjectId(filters.userId) };
};

const buildSearchMatch = (search = {}) => {
  const searchValue = search?.value?.trim();
  if (!searchValue) return null;

  const regex = { $regex: escapeRegExp(searchValue), $options: 'i' };
  return {
    $or: [
      { referenceCode: regex },
      { gatewayRef: regex },
      { destinationAccount: regex },
      { accountUsed: regex },
      { status: regex },
    ],
  };
};

const buildSortStage = (order = [], columns = []) => {
  const sort = buildMongoSort(order, columns, { createdAt: -1 });
  const sortStage = {};
  Object.entries(sort).forEach(([key, dir]) => {
    if (key === 'amount') {
      sortStage.sortAmount = dir;
      return;
    }
    sortStage[key] = dir;
  });
  if (!sortStage.createdAt && !sortStage.sortAmount) {
    sortStage.createdAt = -1;
  }
  return sortStage;
};

const topupUnionPipeline = (match) => [
  { $match: { status: 'under_review', ...match } },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'userDoc',
    },
  },
  {
    $project: {
      reviewType: { $literal: 'topup' },
      _id: 1,
      referenceCode: 1,
      requestedAmount: 1,
      expectedAmount: 1,
      status: 1,
      receiptImageUrl: 1,
      adminNotes: 1,
      transactionId: 1,
      receiptNumber: 1,
      expiresAt: 1,
      reviewedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      sortAmount: '$expectedAmount',
      userDoc: 1,
    },
  },
];

const withdrawUnionPipeline = (match) => [
  {
    $match: {
      type: 'withdraw',
      status: 'pending_manual_review',
      ...match,
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'userDoc',
    },
  },
  {
    $project: {
      reviewType: { $literal: 'withdraw' },
      _id: 1,
      type: 1,
      amount: 1,
      status: 1,
      gatewayRef: 1,
      destinationAccount: 1,
      accountUsed: 1,
      adminNotes: 1,
      createdAt: 1,
      updatedAt: 1,
      sortAmount: '$amount',
      userDoc: 1,
    },
  },
];

const formatUnionRow = (row) => {
  if (row.reviewType === 'topup') {
    return formatTopupReviewRow({ ...row, userId: row.userDoc });
  }
  return formatWithdrawReviewRow({ ...row, userId: row.userDoc });
};

const makeUnifiedReviewQueue = async (req) => {
  const {
    draw = 1,
    start = 0,
    length = 10,
    columns = [],
    order = [],
    search = {},
    filters = {},
  } = req.body || {};

  const startNum = Math.max(0, Number.parseInt(start, 10) || 0);
  const lengthNum = Math.min(Math.max(1, Number.parseInt(length, 10) || 10), 100);
  const typeFilter = isEmptyFilter(filters.type) ? 'all' : String(filters.type).toLowerCase();

  if (typeFilter === 'topup') {
    const result = await makeDataTable(TopupRequest, req, {
      baseFilters: { status: 'under_review' },
      searchFields: ['referenceCode', 'status'],
      populate: { path: 'userId', select: 'name email phone' },
      defaultSort: { createdAt: -1 },
    });
    return {
      ...result,
      data: result.data.map(formatTopupReviewRow),
    };
  }

  if (typeFilter === 'withdraw') {
    const result = await makeDataTable(Transaction, req, {
      baseFilters: { type: 'withdraw', status: 'pending_manual_review' },
      searchFields: ['gatewayRef', 'destinationAccount', 'accountUsed'],
      populate: { path: 'userId', select: 'name email phone' },
      defaultSort: { createdAt: -1 },
    });
    return {
      ...result,
      data: result.data.map(formatWithdrawReviewRow),
    };
  }

  const dateMatch = buildDateMatch(filters);
  const userMatch = buildUserMatch(filters);
  const sharedMatch = { ...dateMatch, ...userMatch };
  const searchMatch = buildSearchMatch(search);
  const sortStage = buildSortStage(order, columns);

  const [topupTotal, withdrawTotal, aggregation] = await Promise.all([
    TopupRequest.countDocuments({ status: 'under_review' }),
    Transaction.countDocuments({ type: 'withdraw', status: 'pending_manual_review' }),
    TopupRequest.aggregate([
      ...topupUnionPipeline(sharedMatch),
      {
        $unionWith: {
          coll: 'transactions',
          pipeline: withdrawUnionPipeline(sharedMatch),
        },
      },
      ...(searchMatch ? [{ $match: searchMatch }] : []),
      { $sort: sortStage },
      {
        $facet: {
          filtered: [{ $count: 'count' }],
          rows: [{ $skip: startNum }, { $limit: lengthNum }],
        },
      },
    ]),
  ]);

  const facet = aggregation[0] || {};
  const recordsFiltered = facet.filtered?.[0]?.count || 0;
  const rows = (facet.rows || []).map(formatUnionRow);

  return {
    draw: Number.parseInt(draw, 10) || 1,
    recordsTotal: topupTotal + withdrawTotal,
    recordsFiltered,
    data: rows,
    pagination: {
      totalItems: recordsFiltered,
      totalPages: Math.ceil(recordsFiltered / lengthNum) || 0,
      currentPage: Math.floor(startNum / lengthNum) + 1,
      itemsPerPage: lengthNum,
      start: startNum,
      length: lengthNum,
      hasNextPage: startNum + lengthNum < recordsFiltered,
      hasPrevPage: startNum > 0,
    },
  };
};

module.exports = {
  makeUnifiedReviewQueue,
  formatTopupReviewRow,
  formatWithdrawReviewRow,
};
