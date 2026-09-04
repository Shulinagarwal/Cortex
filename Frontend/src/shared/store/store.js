import { configureStore } from "@reduxjs/toolkit";
import chatReducer from "../../modules/chat/chat.slice";
import settingsReducer from "../../modules/settings/settings.slice"

const store = configureStore({
  reducer: {
    chat: chatReducer,
    settings: settingsReducer,
  },
});

export default store;
