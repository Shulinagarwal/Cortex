import { createSlice } from "@reduxjs/toolkit";

const getInitialSettings = () => {
  const savedSettings = localStorage.getItem("cortex_settings");

  if (savedSettings) {
    return JSON.parse(savedSettings);
  }

  return {
    model: "gemini-1.5-pro", 
    systemPrompt: "You are Cortex, an intelligent and helpful AI assistant.",
    theme: "dark", 
  };
};

const settingsSlice = createSlice({
  name: "settings",
  initialState: getInitialSettings(),
  reducers: {
    updateSettings: (state, action) => {
      if (action.payload.model !== undefined)
        state.model = action.payload.model;
      if (action.payload.systemPrompt !== undefined)
        state.systemPrompt = action.payload.systemPrompt;
      if (action.payload.theme !== undefined)
        state.theme = action.payload.theme;

      localStorage.setItem("cortex_settings", JSON.stringify(state));
    },
  },
});

export const { updateSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
