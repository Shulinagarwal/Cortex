const UserModel = require("./user.model");
const { sendError } = require("../../shared/utils/apiError");

const getUserProfile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user._id);

    if (!user) {
      return sendError(res, 404, "NOT_FOUND", "User not found.");
    }

    return res.json(user);
  } catch (error) {
    console.error("Failed to load profile:", error);
    return sendError(res, 500, "INTERNAL_ERROR", "Could not load your profile.");
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user._id);

    if (!user) {
      return sendError(res, 404, "NOT_FOUND", "User not found.");
    }

    user.fullname = req.body.fullname || user.fullname;

    const updatedUser = await user.save();

    return res.json({
      _id: updatedUser._id,
      fullname: updatedUser.fullname,
      email: updatedUser.email,
    });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return sendError(res, 500, "INTERNAL_ERROR", "Could not update your profile.");
  }
};

module.exports = { getUserProfile, updateUserProfile };
