// Tailwind CSS v4 for both `next dev` (Turbopack) and `next build --webpack` (what Hostinger can run:
// its build server can't load Next's native compiler, see scripts/prepare-wasm-swc.mjs).
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
