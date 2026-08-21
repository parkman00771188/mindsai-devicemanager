module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#191f28",
        line: "#e5e9f1",
        panel: "#f3f5f9",
        brand: "#2563eb",
        aqua: "#16a34a",
        mint: "#e9f8ef"
      },
      boxShadow: {
        soft: "0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)",
        lift: "0 12px 40px rgba(16, 24, 40, 0.14)"
      }
    }
  },
  plugins: []
};
