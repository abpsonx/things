import type { MetadataRoute } from "next";

// Internal/company-only app — disallow all crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
