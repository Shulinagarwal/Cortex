const {
  addUserFact,
  listUserFacts,
  updateUserFact,
  deleteUserFact,
  getLtmSettings,
  setLtmEnabled,
} = require("./ltm.service");
const { sendError } = require("../../shared/utils/apiError");

const handleAddMemory = async (req, res) => {
  try {
    const result = await addUserFact(req.user._id, req.body.text);

    if (!result.created) {
      if (result.reason === "disabled") {
        return sendError(res, 400, "LTM_DISABLED", "Enable memory before adding facts.");
      }
      if (result.reason === "duplicate") {
        return res.status(200).json({ created: false, reason: "duplicate", existing: result.existing });
      }
      return sendError(res, 400, "VALIDATION_ERROR", "Memory text is required.");
    }

    return res.status(201).json({ created: true, fact: result.fact });
  } catch (error) {
    console.error("Error adding memory:", error);
    return sendError(res, 500, "MEMORY_ADD_FAILED", "Failed to add memory.");
  }
};

const handleListMemories = async (req, res) => {
  try {
    const facts = await listUserFacts(req.user._id);
    return res.status(200).json({ facts });
  } catch (error) {
    console.error("Error listing memories:", error);
    return sendError(res, 500, "MEMORY_FETCH_FAILED", "Failed to load memories.");
  }
};

const handleUpdateMemory = async (req, res) => {
  try {
    const updated = await updateUserFact(req.user._id, req.params.id, req.body.text);
    if (!updated) return sendError(res, 404, "NOT_FOUND", "Memory not found.");
    return res.status(200).json({ fact: updated });
  } catch (error) {
    console.error("Error updating memory:", error);
    return sendError(res, 500, "MEMORY_UPDATE_FAILED", "Failed to update memory.");
  }
};

const handleDeleteMemory = async (req, res) => {
  try {
    const deleted = await deleteUserFact(req.user._id, req.params.id);
    if (!deleted) return sendError(res, 404, "NOT_FOUND", "Memory not found.");
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting memory:", error);
    return sendError(res, 500, "MEMORY_DELETE_FAILED", "Failed to delete memory.");
  }
};

const handleGetMemorySettings = async (req, res) => {
  try {
    const settings = await getLtmSettings(req.user._id);
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Error fetching memory settings:", error);
    return sendError(res, 500, "MEMORY_SETTINGS_FETCH_FAILED", "Failed to load memory settings.");
  }
};

const handleUpdateMemorySettings = async (req, res) => {
  try {
    const settings = await setLtmEnabled(req.user._id, req.body.enabled);
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Error updating memory settings:", error);
    return sendError(res, 500, "MEMORY_SETTINGS_UPDATE_FAILED", "Failed to update memory settings.");
  }
};

module.exports = {
  handleAddMemory,
  handleListMemories,
  handleUpdateMemory,
  handleDeleteMemory,
  handleGetMemorySettings,
  handleUpdateMemorySettings,
};
