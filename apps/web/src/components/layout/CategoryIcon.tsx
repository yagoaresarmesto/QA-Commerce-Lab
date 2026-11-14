import { Cable, CircuitBoard, Cpu, Gpu, HardDrive, Headphones, Keyboard, Laptop, MemoryStick, Monitor, MonitorSpeaker, Mouse, Package, Smartphone, Tablet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  laptop: Laptop,
  'monitor-speaker': MonitorSpeaker,
  cpu: Cpu,
  gpu: Gpu,
  'circuit-board': CircuitBoard,
  'memory-stick': MemoryStick,
  'hard-drive': HardDrive,
  monitor: Monitor,
  keyboard: Keyboard,
  mouse: Mouse,
  headphones: Headphones,
  smartphone: Smartphone,
  tablet: Tablet,
  cable: Cable,
};

export function CategoryIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = (icon && ICONS[icon]) || Package;
  return <Icon className={className} aria-hidden="true" />;
}
