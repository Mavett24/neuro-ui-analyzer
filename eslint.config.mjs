import next from "eslint-config-next/core-web-vitals";

const config = [
  ...next,
  {
    rules: {
      // Images here are user uploads shown from blob: URLs and canvas-composited previews,
      // which next/image can't optimize.
      "@next/next/no-img-element": "off",
    },
  },
  { ignores: [".next/**", "node_modules/**", "public/**"] },
];

export default config;
