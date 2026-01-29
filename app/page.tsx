"use client";

import { CopilotChat, CopilotKitProvider } from "@copilotkit/react-core/v2";
// import { createA2UIMessageRenderer } from "./packages/a2ui-renderer/src/A2UIMessageRenderer";
import { createA2UIMessageRenderer } from "@copilotkit/a2ui-renderer";
import { theme } from "./theme";

// Disable static optimization for this page
export const dynamic = "force-dynamic";

const A2UIMessageRenderer = createA2UIMessageRenderer({ theme });

// 导入自定义图表渲染器
import { createCustomChartRenderer } from "./components/custom-chart-renderer";
// 创建自定义图表渲染器实例
const customChartRenderer = createCustomChartRenderer();


const activityRenderers = [
  // A2UIMessageRenderer,
  customChartRenderer,
];
console.log('A2UIMessageRenderer', activityRenderers);

export default function Home() {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      showDevConsole="auto"
      renderActivityMessages={activityRenderers}
    >
      <main
        className="h-full overflow-auto w-screen"
        style={{ minHeight: "100dvh" }}
      >
        <CopilotChat className="h-full" />
      </main>
    </CopilotKitProvider>
  );
}
