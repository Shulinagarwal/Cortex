import { useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./auth.context";
import { refreshSession } from "../../shared/api/client";
import toast from "react-hot-toast";

const OAuthCallback = () => {
  const navigate = useNavigate();
  const { setToken, setUser } = useContext(AuthContext);

  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    refreshSession()
      .then((token) => {
        setToken(token);
        toast.success("Successfully logged in!", { id: "oauth-login" });
        navigate("/", { replace: true });
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        toast.error("Authentication failed");
        navigate("/login", { replace: true });
      });
  }, [navigate, setToken, setUser]);

  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <svg
          className="animate-spin h-10 w-10 text-accent"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <h2 className="text-xl font-bold">Completing Login...</h2>
      </div>
    </div>
  );
};

export default OAuthCallback;
