import { useState, useContext, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "./auth.context";
import { api } from "../../shared/api/client";
import toast from "react-hot-toast";
import { Sparkles, Brain, Plug, AlertCircle, ArrowLeft } from "lucide-react";
import { getApiErrorMessage, getApiErrorCode } from "../../shared/utils/apiError";

const FieldError = ({ children }) =>
  children ? (
    <p className="flex items-center gap-1.5 text-sm text-red-400 mt-2">
      <AlertCircle size={15} className="shrink-0" />
      {children}
    </p>
  ) : null;

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFFFFF" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const LoginPage = () => {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const codeInputRef = useRef(null);

  const { setUser, setToken } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "oauth_failed") {
      setError("That sign-in didn't complete. Please try again.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const requestCode = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email address is required");
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/api/auth/otp/request", { email });

      setStep("code");
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send a code. Try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await api.post("/api/auth/otp/verify", { email, code });

      setToken(response.data.accessToken);
      setUser(response.data.user);
      toast.success("Signed in.");
      navigate("/");
    } catch (err) {
      const errorCode = getApiErrorCode(err);

      const needsNewCode =
        errorCode === "CODE_EXPIRED" ||
        errorCode === "CODE_LOCKED" ||
        errorCode === "NO_PENDING_CODE";

      setError(getApiErrorMessage(err, "Couldn't verify that code."));
      setCode("");

      if (needsNewCode) setStep("email");
      else codeInputRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const oauth = (provider) => {
    window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/${provider}`;
  };

  const inputClass = [
    "w-full bg-zinc-950 rounded-lg p-3 text-neutral-50 placeholder-secondary-text",
    "border transition-shadow focus:outline-none focus:ring-2",
    error
      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
      : "border-white/10 focus:border-accent focus:ring-accent",
  ].join(" ");

  const socialButtonClass =
    "flex items-center justify-center bg-zinc-950 border border-white/10 rounded-lg py-3 hover:bg-zinc-800 transition-colors shadow-sm";

  const primaryButtonClass =
    "w-full bg-accent hover:opacity-90 text-white font-bold py-3.5 rounded-lg transition-opacity flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md";

  const spinner = (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-neutral-50 font-sans flex items-center justify-center p-6 relative">
      <div className="absolute top-8 right-8 font-extrabold text-2xl tracking-tighter flex items-center gap-2 text-neutral-50">
        <span className="text-3xl text-accent">C</span> CortexAi
      </div>

      <div className="w-full max-w-6xl flex flex-col md:flex-row items-center gap-12 lg:gap-24">
        <div className="w-full md:w-1/2 flex flex-col justify-center">
          <div className="max-w-lg mx-auto md:mx-0">
            <p className="text-accent text-xs font-bold tracking-[0.2em] uppercase mb-3">
              Your Intelligent Workspace
            </p>
            <h1 className="text-4xl lg:text-5xl font-bold mb-4 tracking-tight text-neutral-50 leading-tight">
              Think clearer.
              <br />
              Build further.
            </h1>
            <p className="text-secondary-text mb-10 text-base leading-relaxed">
              Cortex brings conversation, document intelligence, and real-world tools together
              in one agent — grounded in your context, not just a single prompt.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 shrink-0 bg-zinc-900 rounded-lg flex items-center justify-center text-accent border border-white/10">
                  <Sparkles size={16} />
                </div>
                <p className="text-secondary-text text-sm">
                  A single agent that decides which tools it needs, per turn
                </p>
              </div>

              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 shrink-0 bg-zinc-900 rounded-lg flex items-center justify-center text-accent border border-white/10">
                  <Brain size={16} />
                </div>
                <p className="text-secondary-text text-sm">
                  Remembers what matters to you, across every conversation
                </p>
              </div>

              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 shrink-0 bg-zinc-900 rounded-lg flex items-center justify-center text-accent border border-white/10">
                  <Plug size={16} />
                </div>
                <p className="text-secondary-text text-sm">
                  Connects to real services like GitHub to act on your behalf
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full md:w-1/2 flex items-center justify-center md:justify-end">
          <div className="w-full max-w-[440px] bg-zinc-900 p-8 lg:p-10 rounded-2xl shadow-2xl border border-white/10">
            {step === "email" ? (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-neutral-50 mb-2">Sign in to CortexAi</h2>
                  <p className="text-accent text-sm">Welcome back! Please sign in to continue</p>
                </div>

                <form onSubmit={requestCode} noValidate>
                  <input
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    autoComplete="email"
                    autoFocus
                    aria-invalid={Boolean(error)}
                    className={inputClass}
                    placeholder="Enter your email"
                  />

                  <FieldError>{error}</FieldError>

                  <button type="submit" disabled={isLoading} className={`mt-4 ${primaryButtonClass}`}>
                    {isLoading ? <>{spinner}Sending…</> : "Continue with email"}
                  </button>
                </form>

                <div className="flex items-center my-6">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="px-4 text-xs text-secondary-text font-medium uppercase tracking-wider">or</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => oauth("google")}
                    aria-label="Continue with Google"
                    title="Continue with Google"
                    className={socialButtonClass}
                  >
                    <GoogleIcon />
                  </button>
                  <button
                    onClick={() => oauth("github")}
                    aria-label="Continue with GitHub"
                    title="Continue with GitHub"
                    className={socialButtonClass}
                  >
                    <GitHubIcon />
                  </button>
                </div>

                <p className="mt-8 text-center text-xs text-secondary-text leading-relaxed">
                  New here? Any of the options above works &mdash; your account is created
                  the first time you sign in.
                </p>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-neutral-50 mb-2">Enter your code</h2>
                  <p className="text-secondary-text text-sm break-all">Sent to {email}</p>
                </div>

                <form onSubmit={verifyCode} noValidate>
                  <input
                    ref={codeInputRef}
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (error) setError("");
                    }}
                    aria-invalid={Boolean(error)}
                    className={`${inputClass} text-center text-2xl tracking-[0.4em] font-mono`}
                    placeholder="000000"
                  />

                  <FieldError>{error}</FieldError>

                  <button
                    type="submit"
                    disabled={isLoading || code.length !== 6}
                    className={`mt-4 ${primaryButtonClass}`}
                  >
                    {isLoading ? <>{spinner}Verifying…</> : "Verify & sign in"}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => { setStep("email"); setCode(""); setError(""); }}
                  className="w-full text-sm text-secondary-text hover:text-neutral-50 transition-colors flex items-center justify-center gap-1.5 mt-4"
                >
                  <ArrowLeft size={14} /> Use a different email
                </button>

                <p className="mt-6 text-center text-xs text-secondary-text">
                  The code expires in 10 minutes and can only be used once.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
