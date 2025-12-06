import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { DataFlowNode, DataFlowEdge } from '../types';

interface DataFlowVisualizerProps {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
}

const DataFlowVisualizer: React.FC<DataFlowVisualizerProps> = ({ nodes, edges }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const width = 800;
    const height = 400;
    const margin = { top: 40, right: 120, bottom: 40, left: 120 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Define marker for arrows
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28) // Offset from node
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#57606a');

    const levelScale = d3.scaleLinear()
        .domain([0, Math.max(1, nodes.length - 1)])
        .range([0, innerHeight]);

    const processedNodes = nodes.map((n, i) => ({
      ...n,
      x: innerWidth / 2 + (i % 2 === 0 ? -20 : 20),
      y: levelScale(i),
    }));

    const linkGenerator = d3.linkVertical<any, { x: number; y: number }>()
      .x((n) => n.x)
      .y((n) => n.y);

    // Draw Links
    svg.selectAll('.link')
      .data(edges)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#57606a')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)')
      .attr('d', (d) => {
        const sourceNode = processedNodes.find(n => n.id === d.source);
        const targetNode = processedNodes.find(n => n.id === d.target);
        if (!sourceNode || !targetNode) return '';
        
        return linkGenerator({ source: sourceNode, target: targetNode });
      });

    // Draw Nodes
    const nodeGroups = svg.selectAll('.node')
      .data(processedNodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Node Circles
    nodeGroups.append('circle')
      .attr('r', 20)
      .attr('fill', d => {
        if (d.type === 'source') return '#0969da'; // Blue
        if (d.type === 'sink') return '#cf222e';   // Red
        return '#f6f8fa'; // Gray
      })
      .attr('stroke', '#24292f')
      .attr('stroke-width', 2);

    // Node Icons/Text inside circle
    nodeGroups.append('text')
      .attr('dy', 5)
      .attr('text-anchor', 'middle')
      .text((d, i) => (i + 1).toString())
      .attr('fill', d => (d.type === 'propagate' ? '#24292f' : 'white'))
      .attr('font-size', '12px')
      .attr('font-weight', 'bold');

    // Labels
    nodeGroups.append('text')
      .attr('dy', -30)
      .attr('text-anchor', 'middle')
      .text(d => d.label)
      .attr('fill', '#24292f')
      .attr('font-weight', 'bold')
      .attr('font-size', '14px');

    // File info
    nodeGroups.append('text')
      .attr('dy', 35)
      .attr('text-anchor', 'middle')
      .text(d => `${d.location.file}:${d.location.line}`)
      .attr('fill', '#57606a')
      .attr('font-size', '11px');

  }, [nodes, edges]);

  return (
    <div className="w-full h-96 bg-white rounded-md border border-[#d0d7de] overflow-hidden shadow-sm">
        <div className="p-3 border-b border-[#d0d7de] bg-[#f6f8fa] flex justify-between items-center">
            <h3 className="text-sm font-semibold text-[#24292f]">数据流追踪 (Data Flow)</h3>
            <div className="flex gap-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0969da]"></span> Source</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f6f8fa] border border-[#24292f]"></span> Step</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#cf222e]"></span> Sink</span>
            </div>
        </div>
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
};

export default DataFlowVisualizer;