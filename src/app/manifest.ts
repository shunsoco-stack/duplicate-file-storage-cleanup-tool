import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "重複ファイル検出・ストレージ整理ツール",
    short_name: "重複整理",
    description:
      "SHA-256による完全重複検出とHuman Reviewで、安全なストレージ整理計画を端末内で作成します。",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icons/storage-cleanup-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/storage-cleanup-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
