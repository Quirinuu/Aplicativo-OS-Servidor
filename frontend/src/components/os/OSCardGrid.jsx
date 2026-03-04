import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from "framer-motion";
import {
  AlertTriangle, Zap, Clock, ArrowDown,
  GripVertical, ChevronUp, ChevronDown, ExternalLink
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { safeFormatDate } from '@/utils/date';

const priorityConfig = {
  URGENT: {
    label: 'Urgente',
    bar: 'bg-red-500',
    bg: 'bg-red-50 hover:bg-red-100',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: AlertTriangle,
    gradient: 'from-red-500 to-red-600',
  },
  HIGH: {
    label: 'Alta',
    bar: 'bg-orange-400',
    bg: 'bg-orange-50 hover:bg-orange-100',
    border: 'border-orange-200',
    text: 'text-orange-700',
    icon: Zap,
    gradient: 'from-orange-500 to-orange-600',
  },
  MEDIUM: {
    label: 'Média',
    bar: 'bg-yellow-400',
    bg: 'bg-yellow-50 hover:bg-yellow-100',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    icon: Clock,
    gradient: 'from-yellow-500 to-yellow-600',
  },
  LOW: {
    label: 'Baixa',
    bar: 'bg-green-400',
    bg: 'bg-green-50 hover:bg-green-100',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: ArrowDown,
    gradient: 'from-green-500 to-green-600',
  },
};

const statusLabel = {
  RECEIVED: 'Recebido',
  WAITING: 'Aguardando',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  ANALYSIS: 'Em análise',
  MAINTENANCE: 'Manutenção',
  WAITING_PARTS: 'Ag. Peças',
  READY_FOR_PICKUP: 'Pronto',
};

function OSCardItem({
  order, index, total, zoom,
  onPriorityChange, onMoveUp, onMoveDown,
  onDragStart, onDragEnd, onDragEnter, onDragOver, onDrop,
  dragOverIndex, draggingIndex,
}) {
  const [hovered, setHovered] = useState(false);
  if (!order) return null;

  const cfg = priorityConfig[order.priority] || priorityConfig.MEDIUM;
  const PriorityIcon = cfg.icon;
  const isDragging = draggingIndex === index;
  const isDragOver = dragOverIndex === index && draggingIndex !== index;

  // zoom >= 1 = bigger cards, zoom <= -1 = smaller cards
  const isSmall = zoom <= -1;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragEnd={onDragEnd}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(index); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={(e) => { e.preventDefault(); onDrop(index); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        transition-all duration-150 rounded-lg
        ${isDragging ? 'opacity-30 scale-95 cursor-grabbing' : 'cursor-default'}
        ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-1 scale-[1.02]' : ''}
      `}
    >
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      >
        <div className={`
          relative rounded-lg border overflow-hidden
          ${cfg.bg} ${cfg.border}
          transition-shadow duration-150
          ${hovered ? 'shadow-md' : 'shadow-sm'}
        `}>
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />

          <div className={`pl-3 pr-2 ${isSmall ? 'py-1.5' : 'py-2.5'}`}>
            <div className="flex items-center gap-1.5">
              {/* Reorder controls */}
              <div
                className="flex flex-col items-center flex-shrink-0"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveUp(index); }}
                  disabled={index === 0}
                  className={`transition-colors ${index === 0 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-blue-500'}`}
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <div className="text-slate-200 hover:text-blue-300 cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-3 h-3" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveDown(index); }}
                  disabled={index === total - 1}
                  className={`transition-colors ${index === total - 1 ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-blue-500'}`}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`font-bold text-slate-800 truncate ${isSmall ? 'text-xs' : 'text-sm'}`}>
                    #{order.osNumber}
                  </span>
                  <div onMouseDown={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`
                            flex-shrink-0 rounded-md bg-gradient-to-br ${cfg.gradient}
                            flex items-center justify-center shadow-sm hover:shadow-md transition-all
                            ${isSmall ? 'w-5 h-5' : 'w-6 h-6'}
                          `}
                          title={`Prioridade: ${cfg.label}`}
                        >
                          <PriorityIcon className={isSmall ? 'w-2.5 h-2.5 text-white' : 'w-3 h-3 text-white'} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-sm">
                        {Object.entries(priorityConfig).map(([key, c]) => {
                          const Icon = c.icon;
                          return (
                            <DropdownMenuItem
                              key={key}
                              onClick={() => onPriorityChange(order.id, key)}
                              className="cursor-pointer"
                            >
                              <Icon className={`w-3.5 h-3.5 mr-2 ${c.text}`} />
                              {c.label}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <p className={`text-slate-600 truncate font-medium mt-0.5 ${isSmall ? 'text-xs leading-tight' : 'text-xs'}`}>
                  {order.clientName}
                </p>

                {!isSmall && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-slate-400">
                      {safeFormatDate(order.createdAt)}
                    </span>
                    <span className={`text-xs font-medium px-1 py-0.5 rounded-full ${cfg.text} bg-white/60`}>
                      {statusLabel[order.currentStatus] || order.currentStatus}
                    </span>
                  </div>
                )}

                {isSmall && (
                  <p className="text-xs text-slate-400 leading-tight">
                    {safeFormatDate(order.createdAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Hover action */}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className={`transition-all duration-150 overflow-hidden ${
                hovered ? 'max-h-7 opacity-100 mt-1.5' : 'max-h-0 opacity-0 mt-0'
              }`}
            >
              <Link to={`/os/${order.id}`}>
                <button className="w-full text-xs flex items-center justify-center gap-1 py-0.5 rounded bg-white/80 hover:bg-white text-slate-600 hover:text-blue-600 border border-slate-200 transition-colors">
                  <ExternalLink className="w-3 h-3" />
                  Ver OS
                </button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// zoom: +2 = poucos cards grandes | 0 = padrão | -2 = muitos cards pequenos
const zoomGridCols = {
  '-2': 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9',
  '-1': 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7',
   '0': 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
   '1': 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
   '2': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3',
};

export default function OSCardGrid({ orders, onReorder, onPriorityChange, zoom = 0 }) {
  const draggingIndexRef = useRef(null);
  const dragOverIndexRef = useRef(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleMoveUp = useCallback((index) => {
    if (index === 0) return;
    const newOrders = [...orders];
    [newOrders[index], newOrders[index - 1]] = [newOrders[index - 1], newOrders[index]];
    onReorder(newOrders);
  }, [orders, onReorder]);

  const handleMoveDown = useCallback((index) => {
    if (index === orders.length - 1) return;
    const newOrders = [...orders];
    [newOrders[index], newOrders[index + 1]] = [newOrders[index + 1], newOrders[index]];
    onReorder(newOrders);
  }, [orders, onReorder]);

  const handleDragStart = useCallback((e, index) => {
    draggingIndexRef.current = index;
    dragOverIndexRef.current = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    requestAnimationFrame(() => setDraggingIndex(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    const from = draggingIndexRef.current;
    const to   = dragOverIndexRef.current;
    if (from !== null && to !== null && from !== to) {
      const newOrders = [...orders];
      const [removed] = newOrders.splice(from, 1);
      newOrders.splice(to, 0, removed);
      onReorder(newOrders);
    }
    draggingIndexRef.current = null;
    dragOverIndexRef.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  }, [orders, onReorder]);

  const handleDragEnter = useCallback((index) => {
    if (index !== draggingIndexRef.current) {
      dragOverIndexRef.current = index;
      setDragOverIndex(index);
    }
  }, []);

  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const handleDrop      = useCallback((index) => { dragOverIndexRef.current = index; }, []);

  const colsClass = zoomGridCols[String(zoom)] || zoomGridCols['0'];

  return (
    <div className={`grid ${colsClass} gap-2`}>
      {orders.map((order, index) => (
        <OSCardItem
          key={order.id}
          order={order}
          index={index}
          total={orders.length}
          zoom={zoom}
          onPriorityChange={onPriorityChange}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          draggingIndex={draggingIndex}
          dragOverIndex={dragOverIndex}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}