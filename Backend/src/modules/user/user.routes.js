const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../../shared/middleware/auth.middleware");
const {
  getUserProfile,
  updateUserProfile,
} = require("./user.controller");

router
  .route("/profile")
  .get(isAuthenticated, getUserProfile)
  .put(isAuthenticated, updateUserProfile);

module.exports = router;
