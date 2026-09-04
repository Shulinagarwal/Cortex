import { Link } from "react-router-dom";
import SystemScreen from "./systemScreen";

const NotFoundPage = () => {
  return (
    <SystemScreen>
      <div className="relative mb-2">
        <h1 className="text-8xl md:text-9xl font-extrabold text-zinc-800 tracking-widest select-none">
          404
        </h1>
        <span className="absolute top-2 left-1/2 -translate-x-1/2 bg-accent text-white text-xs font-medium px-2 py-1 rounded rotate-6 whitespace-nowrap">
          Signal unavailable
        </span>
      </div>

      <h2 className="text-2xl font-bold mt-6 mb-2">Page not found</h2>
      <p className="text-secondary-text mb-8 max-w-sm">
        The page you're looking for doesn't exist, has been moved, or was never here.
      </p>

      <div className="flex flex-col items-center gap-4">
        <Link
          to="/"
          className="px-6 py-3 bg-accent hover:opacity-90 transition-opacity text-white font-semibold rounded-lg"
        >
          Back to Dashboard
        </Link>
        <span className="text-sm text-secondary-text/70 cursor-default">Contact Support</span>
      </div>
    </SystemScreen>
  );
};

export default NotFoundPage;
