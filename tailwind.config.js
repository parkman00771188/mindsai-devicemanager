module.exports = {
  content: ["./client/index.html", "./client/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2f3349",
        line: "#e6e9f2",
        panel: "#f7f8fc",
        brand: "#7367f0",
        aqua: "#39d0bd",
        mint: "#ecfbf7"
      },
      boxShadow: {
        soft: "0 14px 34px rgba(47, 51, 73, 0.08)",
        lift: "0 18px 44px rgba(115, 103, 240, 0.18)"
      }
    }
  },
  plugins: []
};
