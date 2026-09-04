import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./modules/auth/auth.context.jsx";
import "./index.css";
import App from "./App.jsx";
import store from "./shared/store/store.js";
import { Provider } from "react-redux";


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Provider store={store} >
        <App />
        </Provider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
