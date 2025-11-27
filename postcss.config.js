import { purgeCSSPlugin } from "@fullhuman/postcss-purgecss";
import postcssImport from "postcss-import";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";

const purgecssPlugin = purgeCSSPlugin({
  content: ["./docs/*.html"],
  defaultExtractor: content => content.match(/[A-Za-z0-9-_:/.]+/g) || []
});

export default {
  plugins: [
    postcssImport,
    tailwindcss,
    autoprefixer,
    ...(process.env.NODE_ENV === "build" ? [purgecssPlugin, cssnano] : [])
  ]
};
