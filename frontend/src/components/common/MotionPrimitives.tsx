import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { useSmoothScroll } from './SmoothScrollProvider';

export const SNAPPY_EASE = [0.22, 1, 0.36, 1] as const;

export const MotionPage: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.26, ease: SNAPPY_EASE }}
    className={className}
  >
    {children}
  </motion.div>
);

export const MotionModalBackdrop: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}> = ({ children, onClick, className = '' }) => {
  const { stopScroll, startScroll } = useSmoothScroll();

  useEffect(() => {
    stopScroll();
    return () => startScroll();
  }, [stopScroll, startScroll]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClick?.();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs ${className}`}
    >
      {children}
    </motion.div>
  );
};

export const MotionModalPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.96, y: 8 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.96, y: 8 }}
    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    data-lenis-prevent
    className={className}
  >
    {children}
  </motion.div>
);

interface AnimatedCounterProps {
  value: number;
  formatter?: (val: number) => string;
  duration?: number;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  formatter = (v) => String(Math.round(v)),
  duration = 0.65,
}) => {
  const [display, setDisplay] = useState<string>(() => formatter(value));
  const objRef = useRef<{ val: number }>({ val: 0 });
  const prevValueRef = useRef<number | null>(null);
  const formatterRef = useRef(formatter);
  formatterRef.current = formatter;

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');

    if (prefersReduced || isJsdom || value === 0) {
      objRef.current.val = value;
      prevValueRef.current = value;
      setDisplay(formatterRef.current(value));
      return;
    }

    const startVal = prevValueRef.current ?? 0;
    objRef.current.val = startVal;
    prevValueRef.current = value;

    const tween = gsap.to(objRef.current, {
      val: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        setDisplay(formatterRef.current(objRef.current.val));
      },
      onComplete: () => {
        setDisplay(formatterRef.current(value));
      },
    });

    return () => {
      tween.kill();
    };
  }, [value, duration]);

  return <span>{display}</span>;
};
