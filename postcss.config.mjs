// Used by `next build --webpack` (Hostinger's build server can't run Next's native compiler / Turbopack).
// `next dev` still uses Turbopack and the @tailwindcss/turbopack rule in next.config.ts.
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
