const UserBankDetail = require("../models/UserBankDetail");
const { WITHDRAW_METHODS } = require("../config/withdrawMethods");
const { getWithdrawEligibility } = require("../services/spinService");
const { bankDetailSchema, validate } = require("../services/validationSchema");
const { asyncHandler, sendSuccess, sendError } = require("../services/helper");

const formatBankDetail = (detail) => ({
  id: detail._id,
  gateway: detail.gateway,
  accountTitle: detail.accountTitle,
  iban: detail.iban,
  accountNumber: detail.accountNumber,
  isDefault: detail.isDefault,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
});

exports.listBankDetails = asyncHandler(async (req, res) => {
  const details = await UserBankDetail.find({ userId: req.user._id }).sort(
    "-isDefault -updatedAt",
  );

  sendSuccess(res, {
    data: { bankDetails: details.map(formatBankDetail) },
  });
});

exports.addBankDetail = asyncHandler(async (req, res) => {
  const errors = validate(bankDetailSchema, req.body);
  if (errors.length) return sendError(res, errors.join(", "));

  if (req.body.isDefault) {
    await UserBankDetail.updateMany(
      { userId: req.user._id },
      { $set: { isDefault: false } },
    );
  }

  const detail = await UserBankDetail.create({
    userId: req.user._id,
    ...req.body,
    isDefault: Boolean(req.body.isDefault),
  });

  sendSuccess(
    res,
    {
      message: "Bank detail saved",
      data: { bankDetail: formatBankDetail(detail) },
    },
    201,
  );
});

exports.updateBankDetail = asyncHandler(async (req, res) => {
  const errors = validate(bankDetailSchema, req.body);
  if (errors.length) return sendError(res, errors.join(", "));

  const detail = await UserBankDetail.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!detail) return sendError(res, "Bank detail not found", 404);

  if (req.body.isDefault) {
    await UserBankDetail.updateMany(
      { userId: req.user._id, _id: { $ne: detail._id } },
      { $set: { isDefault: false } },
    );
  }

  Object.assign(detail, req.body);
  await detail.save();

  sendSuccess(res, {
    message: "Bank detail updated",
    data: { bankDetail: formatBankDetail(detail) },
  });
});

exports.deleteBankDetail = asyncHandler(async (req, res) => {
  const detail = await UserBankDetail.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!detail) return sendError(res, "Bank detail not found", 404);

  sendSuccess(res, { message: "Bank detail deleted" });
});

exports.setDefaultBankDetail = asyncHandler(async (req, res) => {
  const detail = await UserBankDetail.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!detail) return sendError(res, "Bank detail not found", 404);

  await UserBankDetail.updateMany(
    { userId: req.user._id },
    { $set: { isDefault: false } },
  );

  detail.isDefault = true;
  await detail.save();

  sendSuccess(res, {
    message: "Default bank detail updated",
    data: { bankDetail: formatBankDetail(detail) },
  });
});

exports.getWithdrawMethodOptions = asyncHandler(async (req, res) => {
  const eligibility = await getWithdrawEligibility(req.user._id);

  sendSuccess(res, {
    data: {
      provider: "manual",
      methods: WITHDRAW_METHODS.map((method) => ({
        ...method,
        enabled: eligibility.canWithdraw,
      })),
      ...eligibility,
    },
  });
});
