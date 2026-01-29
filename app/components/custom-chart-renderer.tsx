// components/custom-chart-renderer.tsx
'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { init, EChartsOption } from 'echarts';
import { z } from 'zod';
import { v0_8 } from '@a2ui/lit';

/**
 * 自定义图表渲染器组件
 * 用于渲染 A2UI 表面活动中的图表数据，支持多轮对话会话管理
 */
export const CustomChartRenderer: React.FC<{
  content: any;
  agent: any;
}> = (res) => {
  const { content, agent } = res;
  console.warn('CustomChartRenderer 被调用', res, content, agent);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const prevConfigRef = useRef<string>('');
  const processorsRef = useRef(new Map<string, any>());
  const lastSignatureRef = useRef<string | null>(null);
  const [operations, setOperations] = useState<any[]>([]);
  
  // 处理 operations 数据，类似 A2UIMessageRenderer 的逻辑
  useEffect(() => {
    console.log('处理 operations 数据:', {
      hasContent: !!content,
      hasOperations: !!(content && Array.isArray(content.operations)),
      operationsCount: content?.operations?.length || 0,
      operations: content?.operations ? content.operations.map((op: any) => Object.keys(op)[0]) : []
    });
    
    if (!content || !Array.isArray(content.operations)) {
      console.log('没有有效的 operations 数据，清理 processors');
      processorsRef.current.forEach((processor) => processor.clearSurfaces());
      processorsRef.current.clear();
      lastSignatureRef.current = null;
      setOperations([]);
      return;
    }
    
    const processors = processorsRef.current;
    const incoming = content.operations as any[];
    const signature = stringifyOperations(incoming);
    
    if (signature && signature === lastSignatureRef.current) {
      console.log('operations 数据未变化，跳过处理');
      return;
    }
    
    console.log('开始处理新的 operations 数据，数量:', incoming.length);
    
    const groupedOperations = new Map<string, any[]>();
    
    for (const operation of incoming) {
      const surfaceId = getOperationSurfaceId(operation) ?? 'default';
      
      if (!groupedOperations.has(surfaceId)) {
        groupedOperations.set(surfaceId, []);
      }
      groupedOperations.get(surfaceId)!.push(operation);
    }
    
    console.log('按 surfaceId 分组结果:', Array.from(groupedOperations.keys()));
    
    groupedOperations.forEach((operationsForSurfaceId, surfaceId) => {
      let processor = processors.get(surfaceId);
      if (!processor) {
        console.log('创建新的 processor for surface:', surfaceId);
        processor = v0_8.Data.createSignalA2uiMessageProcessor();
        processors.set(surfaceId, processor);
      }
      
      try {
        console.log('处理 surface', surfaceId, '的 operations，数量:', operationsForSurfaceId.length);
        processor.processMessages(operationsForSurfaceId);
        console.log('surface', surfaceId, '处理完成，surfaces 数量:', processor.getSurfaces().size);
      } catch (error) {
        console.error('处理 surface', surfaceId, '时出错:', error);
        processors.delete(surfaceId);
      }
    });
    
    const emptyProcessors: string[] = [];
    processors.forEach((processor, surfaceId) => {
      if (processor.getSurfaces().size === 0) {
        emptyProcessors.push(surfaceId);
      }
    });
    if (emptyProcessors.length > 0) {
      console.log('清理空 processors:', emptyProcessors);
      for (const surfaceId of emptyProcessors) {
        processors.delete(surfaceId);
      }
    }
    
    lastSignatureRef.current = signature;
    setOperations(incoming);
    
    console.log('operations 处理完成，当前 processors 数量:', processors.size);
  }, [content]);
  
  // 从处理后的 surfaces 中提取图表配置
  const surfaceEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      surface: any;
      processor: any;
    }> = [];
    
    console.log('生成 surfaceEntries，当前 processors 数量:', processorsRef.current.size);
    
    processorsRef.current.forEach((processor, processorId) => {
      const surfaces = processor.getSurfaces();
      console.log('processor', processor, surfaces, processorId, '的 surfaces 数量:', surfaces.size);
      
      surfaces.forEach((surface: any, surfaceId: string) => {
        console.log('surface', surfaceId, '的 keys:', surface);
        const checkObj = {
          surfaceKeys: Object.keys(surface),
          hasComponentTree: !!surface?.componentTree,
          componentTreeKeys: surface?.componentTree ? Object.keys(surface.componentTree) : [],
          componentTreeStructure: surface?.componentTree ? '存在' : '不存在'
        }
        console.log('检查 surface', surfaceId, ':', checkObj);
        
        // 如果 surface 有 componentTree，直接使用
        console.log('surface', surface, surface?.componentTree)
        if (surface?.componentTree) {
          entries.push({ id: surfaceId, surface, processor });
        } else {
          // 如果没有 componentTree，检查是否有其他结构可以提取组件
          console.log('surface', surfaceId, '没有 componentTree，检查其他结构:', Object.keys(surface));
        }
      });
    });
    
    console.log('生成的 surfaceEntries 数量:', entries, entries.length);
    return entries;
  }, [operations]);
  
  // 为每个 surface 创建独立的图表配置
  const surfaceChartConfigs = useMemo(() => {
    console.log('生成 surfaceChartConfigs，surfaceEntries 数量:', surfaceEntries.length);
    
    return surfaceEntries.map(({ id, surface }) => {
      console.log(`处理 surface ${id}:`, {
        surfaceKeys: Object.keys(surface),
        hasComponentTree: !!surface.componentTree
      });
      
      const hasEcharts = checkForEchartsComponent(surface);
      const echartsConfig = hasEcharts ? extractFirstEchartsConfig(surface) : null;
      
      console.log(`surface ${id} 检测结果:`, {
        hasEcharts,
        hasEchartsConfig: !!echartsConfig
      });
      
      return {
        id,
        surface,
        hasEcharts,
        echartsConfig
      };
    });
  }, [surfaceEntries]);
  console.log('surfaceEntries', surfaceEntries)
  // 如果没有 surface 条目，不渲染任何内容
  if (!surfaceEntries.length) {
    return null;
  }

  
  return (
    <div className="custom-chart-renderer flex min-h-0 flex-1 flex-col gap-6 overflow-auto py-6">
      {surfaceChartConfigs.map(({ id, surface, hasEcharts, echartsConfig }) => (
        <SurfaceChart
          key={id}
          id={id}
          surface={surface}
          hasEcharts={hasEcharts}
          echartsConfig={echartsConfig}
        />
      ))}
    </div>
  );
};

/**
 * 检查内容中是否包含 Echarts 组件
 * @param content 活动内容
 * @returns 是否包含 Echarts 组件
 */
function checkForEchartsComponent(content: any): boolean {
  if (!content) {
    console.log('checkForEchartsComponent: 内容为空');
    return false;
  }
  
  console.log('checkForEchartsComponent 检查内容结构:', {
    contentKeys: Object.keys(content),
    hasComponentTree: !!content.componentTree,
    hasOperations: Array.isArray(content.operations)
  });
  
  // 关键修复：支持多种数据结构
  
  // 1. 检查 componentTree 中的 Echarts 组件（surface 格式）
  if (content.componentTree && content.componentTree.properties && content.componentTree.properties.children) {
    console.log('检查 componentTree.properties.children 结构');
    
    for (const child of content.componentTree.properties.children) {
      console.log('检查 componentTree 子节点:', child.id, '类型:', child.type);
      
      // 检查是否是 Echarts 组件
      if (child.type === 'Echarts') {
        console.log('在 componentTree 中找到 Echarts 组件:', child.id);
        return true;
      }
    }
  }
  
  // 2. 检查 operations 中的 Echarts 组件（原始数据格式）
  if (Array.isArray(content.operations)) {
    console.log('检查 operations，数量:', content.operations.length);
    
    for (const operation of content.operations) {
      console.log('检查 operation:', Object.keys(operation));
      
      // 检查 surfaceUpdate 中的 components
      if (operation.surfaceUpdate?.components && Array.isArray(operation.surfaceUpdate.components)) {
        console.log('surfaceUpdate 中有 components，数量:', operation.surfaceUpdate.components.length);
        
        for (const component of operation.surfaceUpdate.components) {
          console.log('检查 component:', component.id, 'component 结构:', Object.keys(component.component || {}));
          
          // 检查是否有 Echarts 组件
          if (component.component && (component.component.Echarts || component.component.echarts)) {
            console.log('找到 Echarts 组件:', component.id);
            return true;
          }
        }
      }
    }
  }
  
  // 3. 检查从 processor 处理后的 surface 数据结构
  if (content.id && content.components && Array.isArray(content.components)) {
    console.log('检查 surface 数据结构 (从 operations 处理后的):', {
      surfaceId: content.id,
      componentsCount: content.components.length
    });
    
    for (const component of content.components) {
      console.log('检查 surface component:', component.id, 'component 结构:', Object.keys(component.component || {}));
      
      // 检查是否有 Echarts 组件
      if (component.component && (component.component.Echarts || component.component.echarts)) {
        console.log('在 surface 中找到 Echarts 组件:', component.id);
        return true;
      }
    }
  }
  
  console.warn('checkForEchartsComponent: 未找到 Echarts 组件');
  return false;
}

/**
 * 从内容中提取第一个 Echarts 配置
 * @param content 活动内容
 * @returns 第一个有效的 ECharts 配置对象
 */
function extractFirstEchartsConfig(content: any): EChartsOption | null {
  if (!content) {
    console.warn('extractFirstEchartsConfig: 内容为空');
    return null;
  }
  
  console.log('extractFirstEchartsConfig 开始提取配置:', {
    hasComponentTree: !!content.componentTree,
    hasOperations: Array.isArray(content.operations),
    hasComponents: !!content.components
  });
  
  try {
    // 关键修复：支持多种数据结构
    
    // 1. 从 componentTree 中提取 Echarts 配置（surface 格式）
    if (content.componentTree && content.componentTree.properties && content.componentTree.properties.children) {
      console.log('从 componentTree.properties.children 中提取配置');
      
      for (const child of content.componentTree.properties.children) {
        if (child.type === 'Echarts' && child.properties) {
          console.log('在 componentTree 中找到 Echarts 组件:', child.id);
          
          // 将 surface 格式转换为 Echarts 配置格式
          const echartsProps = {
            options: child.properties.options,
            width: child.properties.width,
            height: child.properties.height
          };
          
          const config = extractAndValidateEchartsOptions(echartsProps);
          if (config) {
            console.log('从 componentTree 中成功提取 Echarts 配置');
            return config;
          }
        }
      }
    }
    
    // 2. 从 operations 中提取图表配置（原始数据格式）
    if (Array.isArray(content.operations)) {
      console.log('从 operations 中提取配置，数量:', content.operations.length);
      
      for (const operation of content.operations) {
        if (operation.surfaceUpdate?.components && Array.isArray(operation.surfaceUpdate.components)) {
          console.log('检查 surfaceUpdate 中的 components，数量:', operation.surfaceUpdate.components.length);
          
          for (const component of operation.surfaceUpdate.components) {
            if (component.component && (component.component.Echarts || component.component.echarts)) {
              console.log('找到 Echarts 组件:', component.id);
              const echartsProps = component.component.Echarts || component.component.echarts;
              const config = extractAndValidateEchartsOptions(echartsProps);
              if (config) {
                console.log('从 operations 中成功提取 Echarts 配置');
                return config;
              }
            }
          }
        }
      }
    }
    
    // 3. 从 processor 处理后的 surface 数据结构中提取
    if (content.id && content.components && Array.isArray(content.components)) {
      console.log('从 surface 数据结构中提取配置 (从 operations 处理后的)');
      
      for (const component of content.components) {
        if (component.component && (component.component.Echarts || component.component.echarts)) {
          console.log('在 surface 中找到 Echarts 组件:', component.id);
          const echartsProps = component.component.Echarts || component.component.echarts;
          const config = extractAndValidateEchartsOptions(echartsProps);
          if (config) {
            console.log('从 surface 数据结构中成功提取 Echarts 配置');
            return config;
          }
        }
      }
    }
    
    console.warn('extractFirstEchartsConfig: 未找到有效的 Echarts 组件');
  } catch (error) {
    console.error('提取 Echarts 配置失败:', error);
  }
  
  return null;
}

/**
 * 从 componentTree 中提取 Echarts 配置
 * @param componentTree 组件树
 * @returns ECharts 配置对象
 */
function extractFromComponentTree(componentTree: any): EChartsOption | null {
  if (!componentTree || typeof componentTree !== 'object') return null;
  
  // 检查当前节点的组件
  if (componentTree.component && (componentTree.component.Echarts || componentTree.component.echarts)) {
    const echartsProps = componentTree.component.Echarts || componentTree.component.echarts;
    return extractAndValidateEchartsOptions(echartsProps);
  }
  
  // 递归检查子节点
  if (componentTree.children && Array.isArray(componentTree.children)) {
    for (const child of componentTree.children) {
      const config = extractFromComponentTree(child);
      if (config) return config;
    }
  }
  
  return null;
}

/**
 * 提取并验证 Echarts 配置选项
 * @param echartsProps Echarts 属性对象
 * @returns 验证后的 ECharts 配置对象
 */
function extractAndValidateEchartsOptions(echartsProps: any): EChartsOption | null {
  if (!echartsProps || !echartsProps.options) return null;
  
  let options: any;
  
  // 提取配置（支持多种格式）
  if (echartsProps.options.literalObject) {
    options = echartsProps.options.literalObject;
  } else if (echartsProps.options.literalString) {
    // 如果是字符串格式，尝试解析JSON
    try {
      options = JSON.parse(echartsProps.options.literalString);
    } catch (error) {
      console.error('解析 Echarts 配置字符串失败:', error);
      return null;
    }
  } else {
    options = echartsProps.options;
  }
  
  // 验证配置完整性
  return validateAndEnhanceEchartsConfig(options);
}

/**
 * 验证并增强 Echarts 配置
 * @param options Echarts 配置对象
 * @returns 增强后的配置对象
 */
function validateAndEnhanceEchartsConfig(options: any): EChartsOption | null {
  if (!options || typeof options !== 'object') return null;
  
  // 确保配置有基本结构
  const enhancedOptions: EChartsOption = { ...options };
  
  // 检测图表类型并添加必要的配置
  const chartType = detectChartType(enhancedOptions);
  
  // 根据图表类型添加必要的默认配置
  switch (chartType) {
    case 'bar':
      // 确保柱状图有必要的配置
      if (!enhancedOptions.xAxis) {
        enhancedOptions.xAxis = { type: 'category' };
      }
      if (!enhancedOptions.yAxis) {
        enhancedOptions.yAxis = { type: 'value' };
      }
      break;
      
    case 'line':
      // 确保折线图有必要的配置
      if (!enhancedOptions.xAxis) {
        enhancedOptions.xAxis = { type: 'category' };
      }
      if (!enhancedOptions.yAxis) {
        enhancedOptions.yAxis = { type: 'value' };
      }
      break;
      
    case 'pie':
      // 饼图通常不需要额外的配置
      break;
      
    default:
      // 未知图表类型，添加基本配置
      if (!enhancedOptions.xAxis) {
        enhancedOptions.xAxis = { type: 'category' };
      }
      if (!enhancedOptions.yAxis) {
        enhancedOptions.yAxis = { type: 'value' };
      }
  }
  
  // 确保有标题
  if (!enhancedOptions.title) {
    enhancedOptions.title = { text: '图表', left: 'center' };
  }
  
  // 确保有工具提示
  if (!enhancedOptions.tooltip) {
    enhancedOptions.tooltip = { trigger: 'item' };
  }
  
  return enhancedOptions;
}

/**
 * 检测图表类型
 * @param options Echarts 配置对象
 * @returns 图表类型
 */
function detectChartType(options: any): string {
  if (!options.series || !Array.isArray(options.series)) return 'unknown';
  
  const firstSeries = options.series[0];
  if (firstSeries && firstSeries.type) {
    return firstSeries.type;
  }
  
  // 根据数据格式推断图表类型
  if (firstSeries && firstSeries.data) {
    const firstDataItem = firstSeries.data[0];
    
    // 柱状图数据格式：数值数组 [120, 200, 150, 80, 70]
    if (typeof firstDataItem === 'number') {
      return 'bar';
    }
    
    // 饼图数据格式：对象格式 {value: 120, name: "中餐"}
    if (typeof firstDataItem === 'object' && firstDataItem.value !== undefined) {
      return 'pie';
    }
    
    // 折线图数据格式：数组格式 ["中餐", 120] 或 [0, 120]
    if (Array.isArray(firstDataItem) && firstDataItem.length === 2) {
      return 'line';
    }
  }
  
  // 根据坐标轴类型推断
  if (options.xAxis && options.xAxis.type === 'category' && options.yAxis && options.yAxis.type === 'value') {
    return 'bar'; // 默认柱状图
  }
  
  return 'unknown';
}

/**
 * 获取操作的 surfaceId
 * @param operation 操作对象
 * @returns surfaceId 或 null
 */
function getOperationSurfaceId(operation: any): string | null {
  if (!operation || typeof operation !== 'object') {
    return null;
  }
  
  if (typeof operation.surfaceId === 'string') {
    return operation.surfaceId;
  }
  
  return (
    operation?.beginRendering?.surfaceId ??
    operation?.surfaceUpdate?.surfaceId ??
    operation?.dataModelUpdate?.surfaceId ??
    operation?.deleteSurface?.surfaceId ??
    null
  );
}

/**
 * 序列化 operations 数组
 * @param ops operations 数组
 * @returns 序列化后的字符串或 null
 */
function stringifyOperations(ops: any[]): string | null {
  try {
    return JSON.stringify(ops);
  } catch (error) {
    return null;
  }
}

/**
 * Surface 图表组件 - 处理每个 surface 的独立图表渲染
 */
const SurfaceChart: React.FC<{
  id: string;
  surface: any;
  hasEcharts: boolean;
  echartsConfig: EChartsOption | null;
}> = ({ id, surface, hasEcharts, echartsConfig }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const prevConfigRef = useRef<string>('');

  // 渲染 Echarts 图表
  useEffect(() => {
    if (!chartRef.current) return;
    
    // 检查当前配置是否与之前相同，避免不必要的重渲染
    const configString = JSON.stringify(echartsConfig || {});
    if (configString === prevConfigRef.current && chartInstanceRef.current) {
      return;
    }
    
    prevConfigRef.current = configString;
    
    // 清理之前的图表实例
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }
    
    if (!echartsConfig) {
      console.warn(`Surface ${id}: 没有有效的 Echarts 配置，跳过渲染`);
      return;
    }
    
    try {
      // 初始化 ECharts 实例
      const chart = init(chartRef.current);
      chartInstanceRef.current = chart;
      
      // 设置图表配置项
      chart.setOption(echartsConfig, true); // 使用 true 参数确保不合并配置
      
      console.log(`Surface ${id}: Echarts 图表渲染成功`);
      
      // 响应式适配
      const resizeHandler = () => chart.resize();
      window.addEventListener('resize', resizeHandler);
      
      // 清理函数
      return () => {
        window.removeEventListener('resize', resizeHandler);
        if (chartInstanceRef.current) {
          chartInstanceRef.current.dispose();
          chartInstanceRef.current = null;
        }
        prevConfigRef.current = '';
      };
    } catch (error) {
      console.error(`Surface ${id}: Echarts 渲染失败:`, error);
    }
  }, [echartsConfig, id]);

  return (
    <div className="flex w-full flex-none overflow-hidden rounded-lg bg-white/5 p-4">
      <div className="w-full">
        <div className="text-sm text-green-600 font-semibold mb-2">
          📊 自定义图表渲染器 (surface: {id})
        </div>
        <div className="text-gray-700">
          {hasEcharts ? (
            <div className="mb-4">
              <span className="text-green-600 font-medium">✅ 检测到 Echarts 组件 - 正在渲染图表</span>
            </div>
          ) : (
            <div className="mb-2">
              <span className="text-yellow-600 font-medium">⚠️ 未检测到 Echarts 组件</span>
            </div>
          )}
          
          {/* 图表渲染区域 */}
          {hasEcharts && echartsConfig && (
            <div className="mb-4">
              <div 
                ref={chartRef} 
                className="echarts-container"
                style={{ 
                  width: '100%', 
                  height: '400px',
                  backgroundColor: '#fff',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  padding: '16px'
                }}
              />
            </div>
          )}
          
          {/* 调试信息 */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-600">
              调试信息 (surface: {id})
            </summary>
            <pre className="text-xs mt-2 bg-white p-2 rounded border max-h-40 overflow-auto">
              {JSON.stringify(surface, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
};

/**
 * 创建自定义图表渲染器配置
 * @returns ReactActivityMessageRenderer 配置对象
 */
export const createCustomChartRenderer = () => {
  return {
    activityType: "a2ui-surface", 
    content: z.any(),
    render: CustomChartRenderer
  };
};

export default CustomChartRenderer;