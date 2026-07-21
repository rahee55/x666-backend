// TODO: Wire real bank statement / SMS reconciliation here.
// Called after admin approval so automated reconciliation can be plugged in later.

const reconcileWithBankStatement = async (_topupRequest, _transaction) => ({
  reconciled: false,
  message: "Bank statement reconciliation is not implemented yet",
  matchedRecords: [],
});

module.exports = { reconcileWithBankStatement };
