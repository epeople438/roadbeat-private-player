import type { Metadata, Viewport } from "next";
import "./globals.css";

const themeBootScript = `(() => {
  try {
    const savedTheme = localStorage.getItem("roadbeat:theme");
    document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0c10",
};

export const metadata: Metadata = {
  title: "RoadBeat · 私人车载音乐",
  description: "把自己的常见音频或 MP4 音轨存进 iPhone，分列表离线连接车载蓝牙播放。",
  applicationName: "RoadBeat",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RoadBeat",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "RoadBeat · 私人车载音乐",
    description: "本地导入、独立歌曲列表、MP4 音轨播放与车载蓝牙控制。",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
