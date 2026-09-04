import { Outlet, Navigate } from "react-router-dom";
import { AuthContext } from "./auth.context";
import { useContext } from "react";

const ProtectedRoute = () => {
  const { token, bootstrapped } = useContext(AuthContext);

  if (!bootstrapped) {
    return <div className="min-h-screen bg-zinc-950" />;
  }

  if (!token) {
    return <Navigate to="/Login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
