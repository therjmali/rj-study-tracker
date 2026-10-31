import { motion } from 'framer-motion';

interface Props {
  icon: string;
  label: string;
  value: string;
  sub: string;
  pct: number;
  delay?: number;
}

export default function StatCard({ icon, label, value, sub, pct, delay = 0 }: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground font-mono">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 1, delay: delay + 0.3 }}
          className="h-full rounded-full bg-primary" />
      </div>
    </motion.div>
  );
}
