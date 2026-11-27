import {
  Ban,
  Fingerprint,
  ListChecks,
  RotateCcw,
  Smartphone,
  ZapOff,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { EASE_SETTLE, SPRING_SNAPPY } from './MotionPrimitives';

interface Feature {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  Icon: LucideIcon;
}

const FEATURES: Feature[] = [
  { titleKey: 'features.survives.title', bodyKey: 'features.survives.body', Icon: RotateCcw },
  { titleKey: 'features.porn.title', bodyKey: 'features.porn.body', Icon: Ban },
  { titleKey: 'features.social.title', bodyKey: 'features.social.body', Icon: Smartphone },
  { titleKey: 'features.allowlist.title', bodyKey: 'features.allowlist.body', Icon: ListChecks },
  { titleKey: 'features.tamper.title', bodyKey: 'features.tamper.body', Icon: Fingerprint },
  { titleKey: 'features.willpower.title', bodyKey: 'features.willpower.body', Icon: ZapOff },
];

export function FeaturesView() {
  const { t } = useI18n();

  return (
    <section aria-labelledby="features-heading">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
          {t('features.eyebrow')}
        </div>
        <h2
          id="features-heading"
          className="mt-2.5 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[26px]"
        >
          {t('features.title')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {t('features.lead')}
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ titleKey, bodyKey, Icon }, index) => (
          <motion.article
            key={titleKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.22,
              delay: index * 0.045,
              ease: EASE_SETTLE,
            }}
            whileHover={{ y: -3, transition: SPRING_SNAPPY }}
            className="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#0d131b]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-slate-100 text-sky-700 ring-1 ring-slate-200/70 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 dark:from-sky-500/15 dark:to-slate-800 dark:text-sky-300 dark:ring-white/10">
                <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-300 transition-colors group-hover:text-sky-500/70 dark:text-slate-600 dark:group-hover:text-sky-400/70">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="mt-4 text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
              {t(titleKey)}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
              {t(bodyKey)}
            </p>
            {index === 0 && (
              <span className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
                {t('features.tag')}
              </span>
            )}
          </motion.article>
        ))}
      </div>
    </section>
  );
}
