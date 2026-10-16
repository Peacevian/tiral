import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sky and orange: the light sheet (Race sidebar, top and tab bars, dialogs).
        sheet: {
          DEFAULT: "#F4F8FD",
          card: "#FFFFFF",
          soft: "#E3EDFA",
          chip: "#E3EDFA",
          line: "#D9E4F2",
          handle: "#C9D7EA",
          mute: "#5B6F88",
          chipink: "#1E56A8",
          blue: "#1E56A8",
          ink: "#0E2A4D"
        },
        // White text on flame passes for big bold buttons; flame-deep for orange text.
        flame: { DEFAULT: "#E85F0C", dark: "#D9530A", deep: "#C2410C", soft: "#FFE9D9" },
        leaf: { DEFAULT: "#2F7D4A", soft: "#DDF0E3" }
      }
    },
  },
  plugins: [],
}

export default config
