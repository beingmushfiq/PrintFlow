import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Globe,
  ArrowRight,
  Store,
  LogIn,
  UserPlus,
  ChevronDown,
  QrCode,
  ShieldCheck,
  Calculator,
  Printer,
  Flame,
  Sparkles,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { Logo } from '../../components/common/Logo';
import { DevCenterPointBadge } from '../../components/common/DevCenterPointBadge';
import { usePageTitle } from '../../hooks/usePageTitle';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { PrintPipelineFallback } from '../../components/landing/PrintPipelineFallback';

const PrintPipelineCanvas = lazy(() => import('../../components/landing/PrintPipelineCanvas'));

interface PublicShopSummary {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
}

function canUseWebGL(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (navigator.userAgent.toLowerCase().includes('jsdom')) return false;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export const LandingHome: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'landing', 'storefront']);
  usePageTitle();

  const [shops, setShops] = useState<PublicShopSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('printflow-main');
  const [activeChapter, setActiveChapter] = useState<number>(0);
  const [colorMode, setColorMode] = useState<boolean>(false);
  const [duplexMode, setDuplexMode] = useState<boolean>(true);
  const [webglReady, setWebglReady] = useState<boolean>(() => canUseWebGL());

  const chapter0Ref = useRef<HTMLElement>(null);
  const chapter1Ref = useRef<HTMLElement>(null);
  const chapter2Ref = useRef<HTMLElement>(null);
  const chapter3Ref = useRef<HTMLElement>(null);

  // Single IntersectionObserver handles discrete chapter switching cleanly with zero scroll polling or inertia drift
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const sectionRefs: Array<{ idx: number; el: HTMLElement | null }> = [
      { idx: 0, el: chapter0Ref.current },
      { idx: 1, el: chapter1Ref.current },
      { idx: 2, el: chapter2Ref.current },
      { idx: 3, el: chapter3Ref.current },
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const match = sectionRefs.find((item) => item.el === entry.target);
            if (match) {
              setActiveChapter(match.idx);
            }
          }
        }
      },
      {
        rootMargin: '-32% 0px -32% 0px',
        threshold: 0.12,
      }
    );

    sectionRefs.forEach(({ el }) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ shops: PublicShopSummary[] }>('/public/shops')
      .then((res) => {
        if (!active || !res.data?.shops?.length) return;
        const list = res.data.shops;
        setShops(list);
        const hasDefault = list.some((s) => s.slug === 'printflow-main');
        setSelectedSlug(hasDefault ? 'printflow-main' : list[0].slug);
      })
      .catch(() => {
        // Fallback silently to default printflow-main
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('bn') ? 'en' : 'bn';
    i18n.changeLanguage(nextLang);
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
        window.localStorage.setItem('printflow_locale', nextLang);
      }
    } catch {
      // Ignore storage failures in restricted contexts
    }
  };

  const isBengali = i18n.language.startsWith('bn');
  const locale = isBengali ? 'bn' : 'en';

  const sampleEstimatePoisha = !colorMode
    ? duplexMode
      ? 500
      : 1000
    : duplexMode
    ? 3000
    : 4000;

  const jumpToChapter = (chapterIdx: number, id?: string) => {
    setActiveChapter(chapterIdx);
    if (id) {
      const target = document.getElementById(id);
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#070B14] text-white flex flex-col">
      {/* Sticky Solid Obsidian Topbar (zero backdrop-blur compositor thrash over WebGL) */}
      <header className="sticky top-0 z-30 w-full max-w-full overflow-hidden border-b border-white/10 bg-[#070B14]/95 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 w-full">
          <div className="flex items-center space-x-3 flex-1 min-w-0 overflow-hidden">
            <Logo variant="mark" theme="white" size="md" />
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white truncate">
                {t('common:app_name')}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                {t('common:tagline')}
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <button
              type="button"
              onClick={() => jumpToChapter(1, 'chapter-1')}
              className="hover:text-[#00D2FF] transition-colors"
            >
              {t('landing:nav_workflow')}
            </button>
            <button
              type="button"
              onClick={() => jumpToChapter(2, 'chapter-2')}
              className="hover:text-[#00D2FF] transition-colors"
            >
              {t('landing:nav_pricing')}
            </button>
            <button
              type="button"
              onClick={() => jumpToChapter(3, 'chapter-3')}
              className="hover:text-[#00D2FF] transition-colors"
            >
              {t('landing:nav_security')}
            </button>
          </nav>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={toggleLanguage}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-white/15 bg-[#0C1427] hover:border-[#00D2FF]/60 transition-colors text-xs sm:text-sm font-medium text-white shrink-0"
            aria-label="Toggle language"
          >
            <Globe className="w-4 h-4 text-[#00D2FF]" />
            <span>{isBengali ? 'English' : 'বাংলা'}</span>
          </motion.button>
        </div>
      </header>

      {/* Main Obsidian 3D Choreography Container — pure seamless spatial field without card borders */}
      <div className="relative bg-[#070B14] overflow-x-clip">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-12 items-start">
            {/* Sticky Borderless 3D Stage */}
            <div className="lg:col-span-6 lg:order-2 lg:sticky lg:top-16 pt-2 lg:py-6 w-full min-w-0">
              <div className="relative h-[290px] sm:h-[380px] lg:h-[calc(100vh-6rem)] w-full overflow-hidden transform-gpu">
                {/* Soft radial atmospheric spotlight seamlessly embedded in #070B14 */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(circle at 50% 48%, rgba(36, 91, 219, 0.22) 0%, rgba(0, 210, 255, 0.06) 36%, rgba(7, 11, 20, 0) 68%)',
                  }}
                />

                {webglReady ? (
                  <Suspense
                    fallback={
                      <PrintPipelineFallback
                        activeChapter={activeChapter}
                        colorMode={colorMode}
                        duplexMode={duplexMode}
                      />
                    }
                  >
                    <PrintPipelineCanvas
                      activeChapter={activeChapter}
                      colorMode={colorMode}
                      duplexMode={duplexMode}
                      onContextLost={() => setWebglReady(false)}
                    />
                  </Suspense>
                ) : (
                  <PrintPipelineFallback
                    activeChapter={activeChapter}
                    colorMode={colorMode}
                    duplexMode={duplexMode}
                  />
                )}

                {/* Minimal subtle B&W / Color switch tucked cleanly at bottom-right corner */}
                <div className="absolute bottom-3 right-3 z-10">
                  <div className="inline-flex items-center gap-1 bg-white/[0.04] p-1 rounded-full border border-white/10">
                    <button
                      type="button"
                      onClick={() => setColorMode(false)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        !colorMode
                          ? 'bg-white text-[#070B14]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {t('landing:ch2_bw')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorMode(true)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        colorMode
                          ? 'bg-[#00D2FF] text-[#070B14]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {t('landing:ch2_color')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Open-Air Editorial Storytelling Column */}
            <div className="lg:col-span-6 lg:order-1 space-y-16 lg:space-y-0 min-w-0">
              {/* Chapter 0: Hero & Immediate Platform Brief */}
              <section
                id="chapter-0"
                ref={chapter0Ref}
                className="min-h-[auto] lg:min-h-[calc(100vh-4.5rem)] py-6 sm:py-10 lg:py-16 flex flex-col justify-center space-y-6"
              >
                <div className="inline-flex items-center gap-2 self-start px-3.5 py-1.5 rounded-full border border-[#00D2FF]/30 bg-[#00D2FF]/10 text-[#00D2FF] text-xs font-semibold tracking-wide">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('common:hero_heading')}</span>
                </div>

                <div className="space-y-4">
                  <h2 className="font-display text-3xl sm:text-5xl font-bold text-white tracking-tight leading-[1.1]">
                    {t('common:hero_title')}
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                    {t('common:hero_subtitle')}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xl border-l-2 border-[#245BDB] pl-3.5">
                    {t('landing:brief_summary')}
                  </p>
                </div>

                {/* Inline Platform Capabilities Proof Row */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                    <QrCode className="w-3.5 h-3.5 text-[#00D2FF]" />
                    <span>{t('landing:pill_zero_app')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                    <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('landing:pill_poisha')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t('landing:pill_shred')}</span>
                  </span>
                </div>

                {/* Seamless Floating Action Dock */}
                <div className="pt-2 space-y-4 max-w-xl">
                  {shops.length > 1 && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="landing-shop-select"
                        className="block text-xs font-semibold text-slate-400"
                      >
                        {t('common:select_shop')}
                      </label>
                      <div className="relative">
                        <select
                          id="landing-shop-select"
                          value={selectedSlug}
                          onChange={(e) => setSelectedSlug(e.target.value)}
                          className="w-full h-11 pl-3.5 pr-9 text-xs font-semibold rounded-xl border border-white/15 bg-white/[0.04] text-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#00D2FF]/40 focus:border-[#00D2FF] cursor-pointer"
                        >
                          {shops.map((s) => (
                            <option key={s.id} value={s.slug} className="bg-[#070B14] text-white">
                              {s.name}
                              {s.address ? ` — ${s.address}` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <motion.div
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    >
                      <Link
                        to={`/s/${selectedSlug}`}
                        className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-[#245BDB] text-white font-bold text-sm shadow-lg shadow-[#245BDB]/25 hover:bg-[#1B48B3] transition-colors"
                      >
                        <div className="flex items-center space-x-2.5">
                          <Store className="w-4 h-4 shrink-0" />
                          <span className="text-left">{t('common:customer_point')}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </Link>
                    </motion.div>

                    <motion.div
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    >
                      <Link
                        to="/owner/shop"
                        className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-white/15 bg-white/[0.03] text-white font-bold text-sm hover:border-[#00D2FF]/60 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5">
                          <LogIn className="w-4 h-4 text-[#00D2FF] shrink-0" />
                          <span className="text-left">{t('common:owner_console_qr')}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </Link>
                    </motion.div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <Link
                      to="/login"
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.03] hover:border-white/35 text-slate-200 font-semibold text-xs transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5 text-[#00D2FF]" />
                      <span>{t('common:owner_login')}</span>
                    </Link>
                    <Link
                      to="/register"
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.03] hover:border-white/35 text-slate-200 font-semibold text-xs transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('common:register_new_shop')}</span>
                    </Link>
                  </div>
                </div>
              </section>

              {/* Borderless Open-Air Scroll Story Chapters with Illuminated 2px Vertical Timeline Spine */}
              <div className="relative pl-6 sm:pl-8 border-l-2 border-white/10 space-y-16 lg:space-y-0 pb-16 lg:pb-24">
                {/* Chapter I: Zero-App QR Counter Intake & Security Shield */}
                <section
                  id="chapter-1"
                  ref={chapter1Ref}
                  data-chapter-active={activeChapter === 1}
                  className="relative lg:min-h-[72vh] flex items-center py-6 lg:py-16"
                >
                  <span
                    className={`absolute -left-[27px] sm:-left-[35px] w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                      activeChapter === 1
                        ? 'bg-[#00D2FF] ring-4 ring-[#00D2FF]/25 scale-125'
                        : 'bg-white/20'
                    }`}
                  />
                  <div
                    className={`w-full space-y-5 transition-opacity duration-500 ${
                      activeChapter === 1 ? 'opacity-100' : 'opacity-65 lg:opacity-55 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#00D2FF]">
                        {t('landing:ch1_step')}
                      </span>
                      <QrCode className="w-4 h-4 text-[#00D2FF]" />
                    </div>
                    <h3 className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                      {t('landing:ch1_title')}
                    </h3>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                      {t('landing:ch1_desc')}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{t('landing:ch1_point_1')}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00D2FF] shrink-0" />
                        <span>{t('landing:ch1_point_2')}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Chapter II: Zero-Float Poisha Math & Interactive 3D Sheet Control */}
                <section
                  id="chapter-2"
                  ref={chapter2Ref}
                  data-chapter-active={activeChapter === 2}
                  className="relative lg:min-h-[72vh] flex items-center py-6 lg:py-16"
                >
                  <span
                    className={`absolute -left-[27px] sm:-left-[35px] w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                      activeChapter === 2
                        ? 'bg-emerald-400 ring-4 ring-emerald-400/25 scale-125'
                        : 'bg-white/20'
                    }`}
                  />
                  <div
                    className={`w-full space-y-5 transition-opacity duration-500 ${
                      activeChapter === 2 ? 'opacity-100' : 'opacity-65 lg:opacity-55 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-400">
                        {t('landing:ch2_step')}
                      </span>
                      <Layers className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h3 className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                      {t('landing:ch2_title')}
                    </h3>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                      {t('landing:ch2_desc')}
                    </p>

                    {/* Sleek Open Interactive 3D Sheet Strip */}
                    <div className="pt-2 space-y-3 max-w-md">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-400">
                          {t('landing:ch2_toggle_label')}
                        </span>
                        <span className="font-mono text-base font-bold text-[#00D2FF]">
                          {formatMoney(sampleEstimatePoisha, locale)}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setColorMode((v) => !v)}
                          className="px-4 py-2 rounded-full border border-white/15 bg-white/[0.04] hover:border-[#00D2FF]/60 text-xs font-semibold text-white transition-colors"
                        >
                          {colorMode ? t('landing:ch2_color') : t('landing:ch2_bw')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDuplexMode((v) => !v)}
                          className="px-4 py-2 rounded-full border border-white/15 bg-white/[0.04] hover:border-emerald-400/60 text-xs font-semibold text-white transition-colors"
                        >
                          {duplexMode ? t('landing:ch2_duplex') : t('landing:ch2_simplex')}
                        </button>
                      </div>

                      <p className="text-[11px] font-mono text-slate-500">
                        {t('landing:ch2_sample_rate')}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Chapter III: Autonomous Win32 Printing & Ephemeral Zero-Trace Shred */}
                <section
                  id="chapter-3"
                  ref={chapter3Ref}
                  data-chapter-active={activeChapter === 3}
                  className="relative lg:min-h-[72vh] flex items-center py-6 lg:py-16"
                >
                  <span
                    className={`absolute -left-[27px] sm:-left-[35px] w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                      activeChapter === 3
                        ? 'bg-blue-400 ring-4 ring-blue-400/25 scale-125'
                        : 'bg-white/20'
                    }`}
                  />
                  <div
                    className={`w-full space-y-5 transition-opacity duration-500 ${
                      activeChapter === 3 ? 'opacity-100' : 'opacity-65 lg:opacity-55 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest text-blue-400">
                        {t('landing:ch3_step')}
                      </span>
                      <Printer className="w-4 h-4 text-blue-400" />
                    </div>
                    <h3 className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                      {t('landing:ch3_title')}
                    </h3>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                      {t('landing:ch3_desc')}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                        <Printer className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{t('landing:ch3_point_1')}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/10 text-xs font-medium text-slate-200">
                        <Flame className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{t('landing:ch3_point_2')}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Luminance Transition Bridge into Architectural Paper Section */}
        <div
          className="h-16 sm:h-24 w-full"
          style={{
            background: 'linear-gradient(180deg, rgba(7,11,20,0) 0%, #F7F8FA 100%)',
          }}
        />
      </div>

      {/* Architectural Paper Closing Action Band (#F7F8FA) */}
      <section className="bg-paper text-ink px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
              {t('landing:closing_eyebrow')}
            </span>
            <h2 className="font-display text-2xl sm:text-4xl font-bold text-ink tracking-tight">
              {t('landing:closing_title')}
            </h2>
            <p className="text-sm sm:text-base text-muted leading-relaxed">
              {t('landing:closing_subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface border border-border rounded-2xl p-6 sm:p-7 shadow-sm space-y-5 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="font-display text-xl font-bold text-ink">
                  {t('landing:card_customer_title')}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {t('landing:card_customer_desc')}
                </p>
              </div>
              <Link
                to={`/s/${selectedSlug}`}
                className="inline-flex items-center justify-between px-4 py-3 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
              >
                <span>{t('common:customer_point')}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 sm:p-7 shadow-sm space-y-5 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="font-display text-xl font-bold text-ink">
                  {t('landing:card_owner_title')}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {t('landing:card_owner_desc')}
                </p>
              </div>
              <Link
                to="/owner/shop"
                className="inline-flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-paper hover:border-accent text-ink font-bold text-sm transition-colors"
              >
                <span>{t('common:owner_console_qr')}</span>
                <ArrowRight className="w-4 h-4 text-accent" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Subtle DevCenterPoint Closing Footer */}
      <footer className="border-t border-border bg-surface px-6 py-5 text-center">
        <DevCenterPointBadge variant="footer" />
      </footer>
    </div>
  );
};

export default LandingHome;
