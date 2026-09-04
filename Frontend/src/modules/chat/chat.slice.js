import { createSlice } from "@reduxjs/toolkit";

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    chats: [],
  },
  reducers: {
    setChats: (state, action) => {
      state.chats = action.payload;
    },

    addChat: (state, action) => {
      const newChat = action.payload;
      const existingIndex = state.chats.findIndex((c) => c._id === newChat._id);
      if (existingIndex >= 0) {
        state.chats.splice(existingIndex, 1);
      }
      state.chats.unshift(newChat);
    },

    updateChatTitle: (state, action) => {
      const { chatId, newTitle } = action.payload;
      const chat = state.chats.find((c) => c._id === chatId);
      if (chat) {
        chat.title = newTitle;
      } else if (import.meta.env.DEV) {
        console.warn(`updateChatTitle: no chat ${chatId} in the store; title dropped.`);
      }
    },

    removeChat: (state, action) => {
      state.chats = state.chats.filter((c) => c._id !== action.payload);
    },
  },
});

export const { setChats, addChat, updateChatTitle, removeChat } =
  chatSlice.actions;
export default chatSlice.reducer;
