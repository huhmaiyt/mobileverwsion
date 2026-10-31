/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

interface OutlineDrawContextValue {
  isRevealed: boolean;
  shouldReduceMotion: boolean;
  outlineDelay: number;
  outlineDuration: number;
}

const OutlineDrawContext = createContext<OutlineDrawContextValue>({
  isRevealed: true,
  shouldReduceMotion: false,
  outlineDelay: 0,
  outlineDuration: 0.75,
});

export const useOutlineDrawCardContext = () => useContext(OutlineDrawContext);

export interface OutlineDrawCardProps extends React.HTMLAttributes<HTMLDivElement> {
  outlineColor?: string;
  baseBorderColor?: string;
  strokeWidth?: number;
  borderRadius?: number;
  duration?: number;
  delay?: number;
  children: React.ReactNode;
  className?: string;
  /**
   * Viewport trigger threshold (0 to 1). Defaults to 0.15.
   */
  viewportAmount?: number;
}

/**
 * Builds an SVG perimeter path around a rounded rectangle starting from
 * the midpoint of the right-hand edge and tracing clockwise around the card.
 */
function buildPerimeterPath(
  width: number,
  height: number,
  radius: number,
  strokeWidth: number
): string {
  if (width <= 0 || height <= 0) return '';

  const inset = strokeWidth / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = Math.max(x0, width - inset);
  const y1 = Math.max(y0, height - inset);

  const maxRadius = Math.min((x1 - x0) / 2, (y1 - y0) / 2);
  const effectiveR = Math.max(0, Math.min(radius, maxRadius));

  const startX = x1;
  const startY = (y0 + y1) / 2;

  // Clockwise starting from right-hand edge midpoint:
  // 1. Down right edge -> bottom-right corner arc
  // 2. Left across bottom edge -> bottom-left corner arc
  // 3. Up left edge -> top-left corner arc
  // 4. Right across top edge -> top-right corner arc
  // 5. Down right edge back to start point
  return [
    `M ${startX.toFixed(2)} ${startY.toFixed(2)}`,
    `L ${x1.toFixed(2)} ${(y1 - effectiveR).toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${(x1 - effectiveR).toFixed(2)} ${y1.toFixed(2)}`,
    `L ${(x0 + effectiveR).toFixed(2)} ${y1.toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${x0.toFixed(2)} ${(y1 - effectiveR).toFixed(2)}`,
    `L ${x0.toFixed(2)} ${(y0 + effectiveR).toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${(x0 + effectiveR).toFixed(2)} ${y0.toFixed(2)}`,
    `L ${(x1 - effectiveR).toFixed(2)} ${y0.toFixed(2)}`,
    `A ${effectiveR.toFixed(2)} ${effectiveR.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${(y0 + effectiveR).toFixed(2)}`,
    `L ${startX.toFixed(2)} ${startY.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * OutlineDrawCard: A polished, scroll-triggered container that progressively draws
 * an outline around its perimeter starting from the right-hand edge, followed by a staged,
 * elegant reveal of headings, supporting text, and visual elements.
 */
export const OutlineDrawCard: React.FC<OutlineDrawCardProps> = ({
  outlineColor = '#E8874A',
  baseBorderColor = 'rgba(223, 203, 179, 0.45)',
  strokeWidth = 1.5,
  borderRadius = 12,
  duration = 0.75,
  delay = 0,
  children,
  className = '',
  viewportAmount = 0.15,
  ...rest
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  const shouldReduceMotion = Boolean(shouldReduce);

  const isInView = useInView(containerRef, {
    once: true,
    amount: viewportAmount,
    margin: '0px 0px -40px 0px',
  });

  // Keyboard accessibility: if an element inside receives focus, reveal immediately
  const [isFocused, setIsFocused] = useState(false);

  // Measure container dimensions for SVG path precision
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions((prev) => {
          if (
            Math.abs(prev.width - rect.width) < 0.5 &&
            Math.abs(prev.height - rect.height) < 0.5
          ) {
            return prev;
          }
          return { width: Math.round(rect.width), height: Math.round(rect.height) };
        });
      }
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const isRevealed = shouldReduceMotion || isFocused || isInView;

  const pathD = buildPerimeterPath(
    dimensions.width,
    dimensions.height,
    borderRadius,
    strokeWidth
  );

  return (
    <OutlineDrawContext.Provider
      value={{
        isRevealed,
        shouldReduceMotion,
        outlineDelay: isFocused ? 0 : delay,
        outlineDuration: shouldReduceMotion || isFocused ? 0 : duration,
      }}
    >
      <div
        ref={containerRef}
        onFocusCapture={() => setIsFocused(true)}
        className={`relative ${className}`}
        {...rest}
      >
        {/* SVG Perimeter Outline Canvas */}
        {dimensions.width > 0 && dimensions.height > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none w-full h-full overflow-visible z-10"
            style={{ borderRadius }}
            aria-hidden="true"
          >
            {/* Optional subtle base guide border */}
            {baseBorderColor && baseBorderColor !== 'transparent' && (
              <path
                d={pathD}
                fill="none"
                stroke={baseBorderColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Progressively drawn perimeter outline from right edge */}
            <motion.path
              d={pathD}
              fill="none"
              stroke={outlineColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={shouldReduceMotion ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 1 }}
              animate={isRevealed ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.6 }}
              transition={{
                duration: shouldReduceMotion || isFocused ? 0 : duration,
                delay: shouldReduceMotion || isFocused ? 0 : delay,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </svg>
        )}

        {/* Content Children */}
        {children}
      </div>
    </OutlineDrawContext.Provider>
  );
};

export interface OutlineDrawChildProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  children: React.ReactNode;
  className?: string;
  delayOffset?: number;
}

/**
 * OutlineDrawHeading: Fades and moves gently into view once the perimeter outline finishes.
 */
export const OutlineDrawHeading: React.FC<OutlineDrawChildProps> = ({
  children,
  className = '',
  delayOffset = 0,
  ...rest
}) => {
  const { isRevealed, shouldReduceMotion, outlineDelay, outlineDuration } = useOutlineDrawCardContext();

  const totalDelay = shouldReduceMotion ? 0 : outlineDelay + outlineDuration + delayOffset;

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 7 }}
      animate={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 7 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.35,
        delay: totalDelay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

/**
 * OutlineDrawBody: Supporting text that follows the heading with a slight stagger.
 */
export const OutlineDrawBody: React.FC<OutlineDrawChildProps> = ({
  children,
  className = '',
  delayOffset = 0.12,
  ...rest
}) => {
  const { isRevealed, shouldReduceMotion, outlineDelay, outlineDuration } = useOutlineDrawCardContext();

  const totalDelay = shouldReduceMotion ? 0 : outlineDelay + outlineDuration + delayOffset;

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
      animate={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.35,
        delay: totalDelay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

/**
 * OutlineDrawVisual: Relevant visual elements (buttons, badges, icons, illustrations) that appear last.
 */
export const OutlineDrawVisual: React.FC<OutlineDrawChildProps> = ({
  children,
  className = '',
  delayOffset = 0.24,
  ...rest
}) => {
  const { isRevealed, shouldReduceMotion, outlineDelay, outlineDuration } = useOutlineDrawCardContext();

  const totalDelay = shouldReduceMotion ? 0 : outlineDelay + outlineDuration + delayOffset;

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      animate={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.35,
        delay: totalDelay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
};
