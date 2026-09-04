const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique : true,
  },
  googleId: {
    type: String,
    sparse: true,
  },
  githubId: {
    type: String,
    sparse: true,
  },
  authProvider: {
    type: String,
    enum: ["local", "google", "github", "email"],
    default: "email",
  },
  role : {
    type : String,
    default : "USER"
  },
  ltmEnabled: {
    type: Boolean,
    default: false,
  },
}, {timestamps : true});

const UserModel = mongoose.models.User || mongoose.model("User" , UserSchema);

module.exports =  UserModel;
