import type { Config } from "tailwindcss";

// 디자인방향_리포트렌즈.md 의 토큰(Falcon 톤).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#F4F6FB", deep: "#EEF1F8" },
        card: "#FFFFFF",
        primary: { DEFAULT: "#2D5BFF", light: "#5B8DEF" },
        ink: { DEFAULT: "#1D2333", sub: "#5A6377", muted: "#8A93A8" },
        line: "#E4E8F2",
        success: { bg: "#E3F8EC", text: "#16A34A" },
      },
      borderRadius: { card: "18px" },
      boxShadow: { card: "0 10px 30px rgba(20,30,60,.06)" },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
