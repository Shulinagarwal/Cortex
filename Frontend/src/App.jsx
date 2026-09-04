import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import LoginPage from "./modules/auth/login.page";
import ChatPage from "./modules/chat/chat.page";
import SettingsPage from "./modules/settings/settings.page";
import LibraryPage from "./modules/library/library.page";
import DashboardLayout from "./shell/dashboardLayout";
import NotFoundPage from "./system/notFound.page";
import ProtectedRoute from "./modules/auth/protectedRoute";
import OAuthCallback from "./modules/auth/oauthCallback.page";
import ErrorBoundary from "./system/errorBoundary";

const App = () => {
  return (
    <ErrorBoundary>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/Login" element={<LoginPage />} />
        <Route path="/signup" element={<Navigate to="/Login" replace />} />

        <Route path="/oauth-callback" element={<OAuthCallback />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<ChatPage />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/documents" element={<Navigate to="/library" replace />} />
            <Route path="/profile" element={<Navigate to="/settings?tab=profile" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
};

export default App;
