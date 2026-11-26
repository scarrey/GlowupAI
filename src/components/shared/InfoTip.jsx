import React from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

/**
 * Small hover-info tooltip. Renders an (i) icon by default, or wraps custom
 * children. Self-contained — includes its own provider so it can be dropped
 * anywhere without extra setup.
 */
export default function InfoTip({ text, children, side = 'top', className = '' }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center cursor-help ${className}`}>
            {children || <Info className="w-3.5 h-3.5" style={{ color: '#9AAA9A' }} />}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-[240px] text-xs leading-relaxed font-jost"
          style={{ background: '#2C3E2D', color: '#F3F6F3' }}
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
