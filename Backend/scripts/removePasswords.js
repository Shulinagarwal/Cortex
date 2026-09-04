require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected.");

  const users = mongoose.connection.collection("users");

  const before = await users.countDocuments({ password: { $exists: true } });
  console.log(`Documents with a stored password: ${before}`);

  if (before === 0) {
    console.log("Nothing to remove.");
    await mongoose.disconnect();
    return;
  }

  const result = await users.updateMany(
    { password: { $exists: true } },
    { $unset: { password: "" } },
  );
  console.log(`Removed the password field from ${result.modifiedCount} document(s).`);

  const after = await users.countDocuments({ password: { $exists: true } });
  console.log(`Remaining: ${after} ${after === 0 ? "(FR-AUTH-07a satisfied)" : "(STILL PRESENT)"}`);

  await mongoose.disconnect();
  process.exit(after === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
