const express = require("express");
const topupController = require("../controllers/topupController");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const { topupInitiateLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.use(auth);

router.post("/initiate", topupInitiateLimiter, topupController.initiate);
router.post(
  "/:id/submit-receipt",
  upload.single("screenshot"),
  topupController.submitReceipt,
);
router.get("/requests", topupController.listRequests);
router.get("/requests/:id", topupController.getRequest);
router.get("/requests/:id/receipt", topupController.getReceipt);

module.exports = router;
