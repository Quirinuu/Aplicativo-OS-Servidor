import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { createPageUrl } from '@/utils';
import { 
  ClipboardList, 
  AlertTriangle, 
  Wrench, 
  CheckCircle2 
} from "lucide-react";
import { motion } from "framer-motion";

export default function StatsCards({ orders = [] }) {
  const stats = {
    total: orders.filter(o => o.current_status !== 'COMPLETED').length,
    urgent: orders.filter(o => o.priority === 'URGENT' && o.current_status !== 'COMPLETED').length,
    maintenance: orders.filter(o => o.current_status === 'MAINTENANCE').length,
    completed: orders.filter(o => o.current_status === 'COMPLETED').length
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
    },
    {
      title: "Em Manutenção",
      value: stats.maintenance,
      icon: Wrench,
      gradient: "from-purple-500 to-purple-600",
      bgLight: "bg-purple-50"
    },
    {
      title: "Concluídas",
      value: stats.completed,
      icon: CheckCircle2,
      gradient: "from-green-500 to-green-600",
      bgLight: "bg-green-50"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className={`${card.bgLight} border-none overflow-hidden`}>
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
  );
}