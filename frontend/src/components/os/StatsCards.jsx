import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { 
  ClipboardList, 
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function StatsCards({ orders = [] }) {
  const [isVisible, setIsVisible] = useState(false);

  const stats = {
    total: orders.filter(o => o.currentStatus !== 'COMPLETED').length,
    urgent: orders.filter(o => o.priority === 'URGENT' && o.currentStatus !== 'COMPLETED').length,
  };

  const cards = [
    {
      title: "OS Abertas",
      value: stats.total,
      icon: ClipboardList,
      gradient: "from-blue-500 to-blue-600",
      bgLight: "bg-blue-50"
    },
    {
      title: "Urgentes",
      value: stats.urgent,
      icon: AlertTriangle,
      gradient: "from-red-500 to-red-600",
      bgLight: "bg-red-50"
    }
  ];

  return (
    <div
      className="mb-6"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {/* Barra indicadora — sempre visível, serve de gatilho de hover */}
      <div
        className={`
          flex items-center justify-between px-4 py-2 rounded-xl cursor-default
          transition-all duration-300
          ${isVisible ? 'bg-slate-200 rounded-b-none' : 'bg-slate-100 hover:bg-slate-200'}
        `}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Resumo
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
              <ClipboardList className="w-3 h-3" />
              {stats.total} abertas
            </span>
            {stats.urgent > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {stats.urgent} urgente{stats.urgent > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <span className="text-slate-400">
          {isVisible ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </div>

      {/* Cards detalhados — aparecem apenas no hover */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            key="stats-cards"
            initial={{ opacity: 0, height: 0, scaleY: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scaleY: 1 }}
            exit={{ opacity: 0, height: 0, scaleY: 0.95 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ originY: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 pb-1">
              {cards.map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                >
                  <Card className={`${card.bgLight} border-none overflow-hidden shadow-sm`}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-600 mb-1">{card.title}</p>
                          <p className="text-3xl font-bold text-slate-800">{card.value}</p>
                        </div>
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center`}>
                          <card.icon className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}