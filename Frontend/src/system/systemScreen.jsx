const SystemScreen = ({ children }) => {
  return (
    <div className="min-h-screen bg-zinc-950 text-neutral-50 font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 35%, rgba(21,93,252,0.25), transparent 60%)",
        }}
      />
      <div className="absolute top-16 left-[12%] w-16 h-16 rounded-2xl border border-white/10 bg-zinc-900/60 rotate-12" />
      <div className="absolute bottom-20 right-[15%] w-24 h-24 rounded-2xl border border-white/10 bg-zinc-900/60 -rotate-12" />

      <div className="relative font-extrabold text-2xl tracking-tighter flex items-center gap-2 mb-10">
        <span className="text-3xl text-accent">C</span> CortexAi
      </div>

      <div className="relative w-full max-w-md flex flex-col items-center text-center">
        {children}
      </div>
    </div>
  );
};

export default SystemScreen;
