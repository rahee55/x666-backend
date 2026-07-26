const mongoose = require('mongoose');

const DATE_FILTER_KEYS = new Set(['fromDate', 'toDate', 'createdAtFrom', 'createdAtTo']);

const escapeRegExp = (string) => String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isEmptyFilter = (value) =>
  value === undefined || value === null || value === '' || value === 'all';

const normalizeFilterValue = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const castFilterValue = (key, value) => {
  const normalized = normalizeFilterValue(value);

  if (
    (key === 'userId' || key.endsWith('Id') || key.endsWith('_id')) &&
    typeof normalized === 'string' &&
    mongoose.Types.ObjectId.isValid(normalized)
  ) {
    return new mongoose.Types.ObjectId(normalized);
  }

  if (typeof normalized === 'string' && /^\d+$/.test(normalized)) {
    return normalized;
  }

  return normalized;
};

const applyDateFilters = (query, filters, dateField = 'createdAt') => {
  const fromDate = filters.fromDate || filters.createdAtFrom;
  const toDate = filters.toDate || filters.createdAtTo;

  if (isEmptyFilter(fromDate) && isEmptyFilter(toDate)) {
    return;
  }

  query[dateField] = {};
  if (!isEmptyFilter(fromDate)) {
    query[dateField].$gte = new Date(fromDate);
  }
  if (!isEmptyFilter(toDate)) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    query[dateField].$lte = end;
  }
};

const buildMongoQuery = ({
  baseFilters = {},
  filters = {},
  search = {},
  searchFields = [],
  columns = [],
  dateField = 'createdAt',
}) => {
  const query = { ...baseFilters };

  Object.entries(filters).forEach(([key, rawValue]) => {
    if (DATE_FILTER_KEYS.has(key) || isEmptyFilter(rawValue)) {
      return;
    }
    query[key] = castFilterValue(key, rawValue);
  });

  applyDateFilters(query, filters, dateField);

  const searchValue = search?.value?.trim();
  if (!searchValue) {
    return query;
  }

  const searchableFields =
    searchFields.length > 0
      ? searchFields
      : columns.map((column) => column?.data).filter(Boolean);

  if (searchableFields.length === 0) {
    return query;
  }

  const regex = { $regex: escapeRegExp(searchValue), $options: 'i' };
  const searchConditions = searchableFields.map((field) => ({ [field]: regex }));

  return { $and: [query, { $or: searchConditions }] };
};

const buildMongoSort = (order = [], columns = [], defaultSort = { createdAt: -1 }) => {
  if (!Array.isArray(order) || order.length === 0 || !Array.isArray(columns)) {
    return defaultSort;
  }

  const sort = {};

  order.forEach(({ column, dir }) => {
    const columnIndex = Number(column);
    const columnDef = columns[columnIndex];
    const sortKey = columnDef?.data || columnDef?.name;
    if (!sortKey) return;
    sort[sortKey] = dir === 'asc' ? 1 : -1;
  });

  return Object.keys(sort).length > 0 ? sort : defaultSort;
};

/**
 * DataTables-style server-side processing for MongoDB models.
 * Expects POST body: { draw, start, length, columns, order, search, filters }
 */
const makeDataTable = async (model, req, options = {}) => {
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
  const lengthNum = Math.min(
    Math.max(1, Number.parseInt(length, 10) || 10),
    options.maxLength || 100,
  );

  const baseFilters = options.baseFilters || {};
  const searchFields = options.searchFields || [];
  const dateField = options.dateField || 'createdAt';
  const defaultSort = options.defaultSort || { [dateField]: -1 };

  const query = buildMongoQuery({
    baseFilters,
    filters,
    search,
    searchFields,
    columns,
    dateField,
  });
  const sort = buildMongoSort(order, columns, defaultSort);

  const [recordsTotal, recordsFiltered, rows] = await Promise.all([
    model.countDocuments(baseFilters),
    model.countDocuments(query),
    model
      .find(query)
      .sort(sort)
      .skip(startNum)
      .limit(lengthNum)
      .populate(options.populate || '')
      .lean(),
  ]);

  return {
    draw: Number.parseInt(draw, 10) || 1,
    recordsTotal,
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

/** @deprecated Use makeDataTable with POST body instead */
const getPaginatedData = async (model, queryParams, searchFields = [], options = {}) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    fromDate,
    toDate,
    ...filters
  } = queryParams;

  const req = {
    body: {
      draw: 1,
      start: (Math.max(1, Number.parseInt(page, 10) || 1) - 1) * (Number.parseInt(limit, 10) || 10),
      length: Number.parseInt(limit, 10) || 10,
      columns: [{ data: sortBy }],
      order: [{ column: 0, dir: sortOrder === 'asc' ? 'asc' : 'desc' }],
      search: { value: search },
      filters: {
        ...filters,
        fromDate,
        toDate,
      },
    },
  };

  const result = await makeDataTable(model, req, {
    ...options,
    searchFields,
    baseFilters: options.filters || options.baseFilters || {},
  });

  return {
    rows: result.data,
    pagination: result.pagination,
  };
};

module.exports = {
  makeDataTable,
  getPaginatedData,
  buildMongoSort,
  buildMongoQuery,
};
