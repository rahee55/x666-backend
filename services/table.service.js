const getPaginatedData = async (
  model,
  queryParams,
  searchFields = [],
  options = {},
) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      ...filters
    } = queryParams;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const cleanedFilters = {};
    Object.keys(filters).forEach((key) => {
      if (filters[key] !== '' && filters[key] !== null && filters[key] !== undefined) {
        cleanedFilters[key] = filters[key];
      }
    });

    let query = { ...options.filters, ...cleanedFilters };

    if (search && search.trim() !== '' && searchFields.length > 0) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const searchConditions = searchFields.map((field) => ({ [field]: searchRegex }));
      query = { $and: [query, { $or: searchConditions }] };
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      model
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNumber)
        .populate(options.populate || '')
        .lean(),
      model.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limitNumber);

    return {
      rows: data,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

module.exports = {
  getPaginatedData,
};
