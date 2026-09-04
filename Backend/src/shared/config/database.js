const mongoose = require("mongoose")

const ConnectDB = (url) => mongoose.connect(url);

module.exports = {ConnectDB};