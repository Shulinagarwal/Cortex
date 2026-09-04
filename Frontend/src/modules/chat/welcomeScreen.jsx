const WelcomeScreen = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center w-full px-4 mt-16">
      <div className="flex items-center justify-center gap-3 mb-10">
        <span className="text-6xl text-accent font-black tracking-tighter">C</span>
        <h1 className="text-5xl font-extrabold text-white tracking-tight">
          CortexAi
        </h1>
      </div>

      <p className="text-lg text-secondary-text max-w-xl mx-auto mb-12 leading-relaxed">
        Experience the next generation of intelligent assistance. Code
        generation, data analysis, and creative ideation, all in one place.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        {[
          {
            icon: "💻",
            title: "Review Code",
            desc: "Analyze my current codebase for bugs",
          },
          {
            icon: "📊",
            title: "Analyze Data",
            desc: "Extract key insights from my metrics",
          },
          {
            icon: "📝",
            title: "Draft Email",
            desc: "Write a professional team memo",
          },
          {
            icon: "🧠",
            title: "Brainstorm",
            desc: "Generate software architecture ideas",
          },
        ].map((item, index) => (
          <div
            key={index}
            className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/40 border border-white/10 hover:bg-zinc-800 hover:border-white/20 transition-all duration-300 cursor-pointer text-left group shadow-sm hover:shadow-md"
          >
            <div className="text-2xl bg-zinc-950 p-3 rounded-xl group-hover:scale-110 transition-transform duration-300 shadow-inner">
              {item.icon}
            </div>
            <div className="mt-1">
              <h3 className="text-neutral-50 font-semibold mb-1 group-hover:text-white transition-colors">
                {item.title}
              </h3>
              <p className="text-secondary-text text-sm leading-snug">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WelcomeScreen;
