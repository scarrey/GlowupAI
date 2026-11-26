import React, { useState, useEffect } from 'react';
import { Droplets, Moon, Sun, Sparkles } from 'lucide-react';
import { api } from '../../api/client';

// Static fallback tips, shown while loading or if the AI endpoint is unavailable.
const fallbackTips = [
  { icon: Droplets, text: 'Drink at least 8 glasses of water today for glowing, hydrated skin.' },
  { icon: Moon, text: 'Aim for 8 hours of beauty sleep tonight — your skin repairs while you rest.' },
  { icon: Sun, text: 'Never skip sunscreen, even on cloudy days. UV protection is anti-aging!' },
  { icon: Droplets, text: 'Add a hydrating serum before your moisturizer for extra plumpness.' },
  { icon: Moon, text: 'Sleep on a silk pillowcase to reduce friction and prevent wrinkles.' },
];

export default function DailyTipCard() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const [tip, setTip] = useState(fallbackTips[dayOfYear % fallbackTips.length]);
  const [isAI, setIsAI] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/ai/daily-tip')
      .then((res) => {
        if (cancelled || !res?.tip) return;
        setTip({ icon: Sparkles, text: res.tip });
        setIsAI(res.source === 'ai');
      })
      .catch(() => { /* keep fallback */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const Icon = tip.icon || Sparkles;

  return (
    <div className="rounded-3xl p-6 md:p-8 bg-white shadow-glow relative overflow-hidden">
      <div className="absolute inset-0 rounded-3xl animated-border opacity-20" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-peach-bg flex items-center justify-center">
            <Icon className="w-5 h-5 text-rose-gold" />
          </div>
          <p className="font-cormorant text-xs tracking-[0.2em] uppercase text-rose-gold">
            {isAI ? 'Your AI Daily Tip' : 'Daily Tip'}
          </p>
        </div>
        <p className={`font-playfair text-lg md:text-xl text-warm-charcoal leading-relaxed italic ${loading ? 'opacity-60' : ''}`}>
          "{tip.text}"
        </p>
      </div>
    </div>
  );
}
