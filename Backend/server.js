require("dotenv").config();

const { ConnectDB } = require("./src/shared/config/database");
const { createApp } = require("./src/app");

const PORT = process.env.PORT || 5000;
const app = createApp();

ConnectDB(process.env.MONGO_URI)
  .then(() => console.log("DataBase is Connected"))
  .catch((err) =>
    console.log("Error OCcured While Connecting the DataBase", err),
  );

app.listen(PORT, () => console.log("Server is Started at", PORT));
