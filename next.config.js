/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fonts.gstatic.com",
        port: "",
        pathname: "/s/i/productlogos/drive_2020q4/v8/web-64dp/*",
        search: "",
      },
    ],
  },
  experimental: {
    reactCompiler: true,
  },
};

export default config;
