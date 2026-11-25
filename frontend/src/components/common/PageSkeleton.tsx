import React from 'react';
import { Logo } from './Logo';

export const PageSkeleton: React.FC = () => {
  return (
    <div
      className="min-h-screen bg-paper text-ink flex flex-col justify-between p-4 sm:p-6"
      role="status"
      aria-label="Loading PrintFlow"
    >
      {/* Top Bar Placeholder */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between py-2 border-b border-border/60">
        <div className="flex items-center space-x-3">
          <div className="animate-pulse">
            <Logo variant="mark" size="sm" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 rounded skeleton-shimmer" />
            <div className="h-2.5 w-40 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="h-8 w-20 rounded-lg skeleton-shimmer" />
      </div>

      {/* Center Content Shimmer */}
      <div className="max-w-5xl w-full mx-auto flex-1 py-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-2xl bg-surface border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded skeleton-shimmer" />
                <div className="w-8 h-8 rounded-lg skeleton-shimmer" />
              </div>
              <div className="h-7 w-24 rounded skeleton-shimmer" />
              <div className="h-2.5 w-32 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>

        <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
          <div className="h-5 w-48 rounded skeleton-shimmer" />
          <div className="h-24 w-full rounded-xl skeleton-shimmer" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-12 rounded-xl skeleton-shimmer" />
            <div className="h-12 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl w-full mx-auto py-3 flex justify-center">
        <div className="h-3 w-48 rounded skeleton-shimmer" />
      </div>
    </div>
  );
};

export default PageSkeleton;
