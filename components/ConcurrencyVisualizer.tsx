
import React from 'react';
import { Thread, ThreadEvent, ConcurrencyRelation } from '../types';

interface ConcurrencyVisualizerProps {
  threads: Thread[];
  events: ThreadEvent[];
  relations?: ConcurrencyRelation[];
  onEventClick?: (event: ThreadEvent) => void;
}

const ConcurrencyVisualizer: React.FC<ConcurrencyVisualizerProps> = ({ threads, events, relations = [], onEventClick }) => {
  
  // Calculate layout
  const threadWidth = 240;
  const padding = 60;
  const timeScale = 15; // pixels per time unit
  const headerHeight = 60;
  
  const width = Math.max(800, threads.length * threadWidth + padding * 2);
  const maxTime = Math.max(...events.map(e => e.timestamp));
  const height = Math.max(400, maxTime * timeScale + 150);

  const getThreadX = (index: number) => padding + index * threadWidth + threadWidth / 2;

  // GitHub Theme Colors
  const eventColor = (action: string) => {
      switch(action) {
          case 'lock': return '#d29922'; // Yellow/Orange
          case 'wait': return '#cf222e'; // Red
          case 'unlock': return '#1a7f37'; // Green
          case 'read': return '#0969da'; // Blue
          case 'write': return '#8250df'; // Purple
          default: return '#6e7781'; // Gray
      }
  }

  const getEventCoordinates = (eventId: string) => {
      const evt = events.find(e => e.id === eventId);
      if (!evt) return null;
      const threadIndex = threads.findIndex(t => t.id === evt.threadId);
      if (threadIndex === -1) return null;
      return {
          x: getThreadX(threadIndex),
          y: headerHeight + evt.timestamp * timeScale
      };
  };

  return (
    <div className="w-full bg-white rounded-md border border-[#d0d7de] overflow-hidden shadow-sm flex flex-col">
       <div className="p-3 border-b border-[#d0d7de] bg-[#f6f8fa] flex justify-between items-center">
            <h3 className="text-sm font-semibold text-[#24292f]">并发时序图 (Concurrency Timeline)</h3>
             <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0969da]"></span> Read</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#8250df]"></span> Write</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d29922]"></span> Lock</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#cf222e]"></span> Conflict</span>
            </div>
        </div>
        <div className="overflow-auto flex-1 p-4 bg-white">
            <svg width={width} height={height} className="bg-white rounded">
                <defs>
                    <marker id="arrow-conflict" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#cf222e" />
                    </marker>
                    <marker id="arrow-order" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#57606a" />
                    </marker>
                </defs>

                {/* Draw Thread Lanes */}
                {threads.map((thread, index) => {
                    const x = getThreadX(index);
                    const isIsr = thread.type === 'isr';
                    return (
                        <g key={thread.id}>
                            {/* Header */}
                            <rect 
                                x={x - 90} y={10} width={180} height={40} rx={6} 
                                fill={isIsr ? '#ffebe9' : '#f6f8fa'} 
                                stroke={isIsr ? '#ff818266' : '#d0d7de'} 
                                strokeWidth={1}
                            />
                            <text x={x} y={35} textAnchor="middle" className={`text-sm font-semibold ${isIsr ? 'fill-[#cf222e]' : 'fill-[#24292f]'}`}>
                                {thread.name}
                            </text>
                            
                            {/* Vertical Line */}
                            <line 
                                x1={x} y1={headerHeight} 
                                x2={x} y2={height - 20} 
                                stroke={isIsr ? '#ff818266' : '#d0d7de'} 
                                strokeWidth="2" 
                                strokeDasharray={isIsr ? "0" : "5,5"} 
                            />
                        </g>
                    );
                })}

                {/* Draw Relations */}
                {relations.map((rel, idx) => {
                    const start = getEventCoordinates(rel.sourceId);
                    const end = getEventCoordinates(rel.targetId);
                    
                    if (!start || !end) return null;
                    
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const controlY = Math.abs(dy) > 50 ? dy / 2 : 30;
                    
                    const isConflict = rel.type === 'conflict';
                    const color = isConflict ? '#cf222e' : '#57606a';
                    const dash = isConflict ? '4,2' : '0';

                    const midX = (start.x + end.x) / 2;
                    const midY = (start.y + end.y) / 2;

                    return (
                        <g key={`rel-${idx}`}>
                             <path 
                                d={`M ${start.x} ${start.y} Q ${start.x + dx/2} ${start.y + controlY} ${end.x} ${end.y}`}
                                fill="none" 
                                stroke={color} 
                                strokeWidth={isConflict ? 2 : 1.5} 
                                strokeDasharray={dash}
                                markerEnd={`url(#arrow-${rel.type})`}
                            />
                            {rel.description && (
                                <g>
                                    <rect x={midX - 5} y={midY - 10} width={10} height={10} fill="white" opacity="0.8" />
                                    <text x={midX} y={midY} textAnchor="middle" fill={color} className="text-[10px] font-bold">!</text>
                                    <text x={midX + 10} y={midY} fill={color} className="text-[10px] italic">{rel.description}</text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {/* Draw Events */}
                {events.map((evt) => {
                    const threadIndex = threads.findIndex(t => t.id === evt.threadId);
                    if (threadIndex === -1) return null;
                    const x = getThreadX(threadIndex);
                    const y = headerHeight + evt.timestamp * timeScale;
                    const color = eventColor(evt.action);
                    const isRW = evt.action === 'read' || evt.action === 'write';

                    return (
                        <g 
                            key={evt.id} 
                            onClick={() => onEventClick && onEventClick(evt)}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                            {/* Time Marker - Removed Text, kept grid line for structure */}
                            {/* <text x={20} y={y + 4} className="text-[10px] fill-[#57606a] font-mono">t={evt.timestamp}</text> */}
                            <line x1={40} y1={y} x2={width-40} y2={y} stroke="#eaeef2" strokeWidth="1" />

                            {/* Event Box */}
                            {isRW ? (
                                <rect 
                                    x={x - 60} 
                                    y={y - 12} 
                                    width={120} 
                                    height={24} 
                                    rx={12} 
                                    fill="white" 
                                    stroke={color} 
                                    strokeWidth={2}
                                />
                            ) : (
                                <rect 
                                    x={x - 70} 
                                    y={y - 15} 
                                    width={140} 
                                    height={30} 
                                    rx={4} 
                                    fill="white" 
                                    stroke={color} 
                                    strokeWidth={2}
                                />
                            )}
                            
                            {/* Event Text */}
                            <text x={x} y={y + 4} textAnchor="middle" className="text-xs font-medium fill-[#24292f]" style={{ fontSize: '11px'}}>
                                {isRW ? (
                                    <tspan>
                                        <tspan fontWeight="bold" fill={color}>{evt.action.toUpperCase()}</tspan>
                                        <tspan fill="#57606a">: {evt.resource}</tspan>
                                    </tspan>
                                ) : (
                                    `${evt.action.toUpperCase()}: ${evt.resource || ''}`
                                )}
                            </text>

                            {/* Description */}
                             <text 
                                x={x + (isRW ? 70 : 80)} 
                                y={y + 4} 
                                textAnchor="start" 
                                className="text-[10px] fill-[#57606a]"
                             >
                                {evt.description}
                            </text>
                            
                            <circle cx={x} cy={y} r={isRW ? 3 : 4} fill={color} stroke="white" strokeWidth="1.5" />
                        </g>
                    );
                })}
            </svg>
        </div>
    </div>
  );
};

export default ConcurrencyVisualizer;
