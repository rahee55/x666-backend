const WITHDRAW_GATEWAYS = ["bank", "jazzcash", "easypaisa"];

const WITHDRAW_METHODS = [
  {
    id: "bank",
    label: "Bank Transfer",
    provider: "manual",
    payoutChannel: "bank",
    description: "Manual payout to your bank account using IBAN",
    accountLabel: "IBAN",
    accountPlaceholder: "PK00XXXX0000000000000000",
    requiredFields: ["iban"],
    optionalFields: ["accountTitle"],
  },
  {
    id: "jazzcash",
    label: "JazzCash",
    provider: "manual",
    payoutChannel: "mobile_wallet",
    description: "Manual payout to your JazzCash mobile wallet",
    accountLabel: "JazzCash mobile number",
    accountPlaceholder: "03001234567",
    requiredFields: ["accountNumber"],
    optionalFields: [],
  },
  {
    id: "easypaisa",
    label: "EasyPaisa",
    provider: "manual",
    payoutChannel: "mobile_wallet",
    description: "Manual payout to your EasyPaisa mobile wallet",
    accountLabel: "EasyPaisa mobile number",
    accountPlaceholder: "03001234567",
    requiredFields: ["accountNumber"],
    optionalFields: [],
  },
];

const getWithdrawMethod = (gateway) =>
  WITHDRAW_METHODS.find((method) => method.id === gateway);

module.exports = {
  WITHDRAW_GATEWAYS,
  WITHDRAW_METHODS,
  getWithdrawMethod,
};
