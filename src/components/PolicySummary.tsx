import React from 'react';
import { ArrowRight, Flame, Lock, ShieldCheck, Timer } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_SETTLE } from './MotionPrimitives';
import {
  BLOCKED_DISTRACTION_DOMAINS,
  BlockerShieldToggleKey,
  HardwareLockPolicyKey,
  KioskState,
  getEnforcedRestrictions,
  getFocusBlockRemainingMinutes,
  getLockTaskWhitelist,
  getPanicLockRemainingMinutes,
  getStrictShieldRemainingMinutes,
  isDowntimeActive,
} from '../utils/kioskEngine';
import { useI18n } from '../i18n/LocaleProvider';

interface PolicySummaryProps {
  state: KioskState;
  onOpenPolicyInspector: () => void;
}

const SHIELD_KEYS: BlockerShieldToggleKey[] = [
  'disablePornOnBrowsers',
  'blockInAppBrowsers',
  'blockUnsupportedBrowsers',
  'blockShortFormFeeds',
];

const HARDWARE_KEYS: HardwareLockPolicyKey[] = [
  'statusBarDisabled',
  'keyguardDisabled',
  'cameraDisabled',
  'usbTransferBlocked',
  'dateTimeLocked',
  'screenCaptureDisabled',
  'keepScreenAwake',
];

const MODE_LABEL: Record<KioskState['kioskMode'], string> = {
  multi_app: 'Multi-app kiosk',
  single_app: 'Single-app kiosk',
  kiosk_browser: 'Web kiosk',
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="stat-value tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </div>
    </div>
  );
}

export const PolicySummary: React.FC<PolicySummaryProps> = ({ state, onOpenPolicyInspector }) => {
  const { tr } = useI18n();
  const restrictions = Object.values(getEnforcedRestrictions(state)).filter(Boolean).length;
  const shields = SHIELD_KEYS.filter((key) => state.blockerShields?.[key]).length;
  const locks = HARDWARE_KEYS.filter((key) => state.hardwareLocks?.[key]).length;
  const allowlist = getLockTaskWhitelist(state).length;
  const allowlistedApps = Math.max(allowlist - 1, 0);

  const focusMinutes = getFocusBlockRemainingMinutes(state);
  const panicMinutes = getPanicLockRemainingMinutes(state);
  const strictMinutes = getStrictShieldRemainingMinutes(state);
  const downtime = isDowntimeActive(state);

  const timers = [
    focusMinutes > 0 && { label: tr('Focus block {m}m', { m: focusMinutes }), tone: 'sky' as const },
    panicMinutes > 0 && { label: tr('Panic lock {m}m', { m: panicMinutes }), tone: 'red' as const },
    strictMinutes > 0 && { label: tr('Strict shield {m}m', { m: strictMinutes }), tone: 'amber' as const },
    downtime && { label: tr('Downtime active'), tone: 'amber' as const },
  ].filter(Boolean) as { label: string; tone: 'sky' | 'red' | 'amber' }[];

  const toneClass = {
    sky: 'bg-sky-50 text-sky-800 border-sky-200 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
    red: 'bg-red-50 text-red-800 border-red-200 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
    amber:
      'bg-amber-50 text-amber-900 border-amber-200 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_SETTLE }}
      className="surface overflow-hidden"
      aria-label={tr("Live policy summary")}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{tr("Live policy")}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {state.isDeviceOwner ? tr("Device Owner enforced") : tr("Device Owner not provisioned")}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            state.isDeviceOwner
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              state.isDeviceOwner ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            aria-hidden="true"
          />
          {tr(MODE_LABEL[state.kioskMode])}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5 sm:grid-cols-4">
        <Stat value={`${restrictions}/4`} label={tr("Restrictions")} />
        <Stat value={`${locks}/7`} label={tr("Hardware locks")} />
        <Stat value={`${shields}/4`} label={tr("Blockers")} />
        <Stat value={`${allowlistedApps}`} label={tr("Allowed apps")} />
      </div>

      {timers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-5">
          {timers.map((timer) => (
            <span
              key={timer.label}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${toneClass[timer.tone]}`}
            >
              <Timer className="h-3 w-3" aria-hidden="true" />
              {timer.label}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-2 border-t border-slate-200/80 px-5 py-4 text-xs text-slate-600 dark:border-white/10 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          {state.blockedAttemptsToday}{" "}{tr("blocked")}{" "}{state.blockedAttemptsToday === 1 ? tr("attempt") : tr("attempts")}{" "}{tr("today")}{"\n        "}</div>
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          {BLOCKED_DISTRACTION_DOMAINS.length}{" "}{tr("domains blocked ·")}{" "}{state.allowedDomains.length}{" "}{tr("allowed")}{"\n        "}</div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />{"\n          "}{tr("Distrust score")}{" "}{state.distrustScore}
          {state.tamperEscalationTier > 0 ? ` · ${tr('Tier')} ${state.tamperEscalationTier}` : ''}
        </div>
      </div>

      {state.events.length > 0 && (
        <div className="border-t border-slate-200/80 px-5 py-4 dark:border-white/10">
          <div className="eyebrow">{tr("Recent activity")}</div>
          <ul className="mt-2 space-y-1.5">
            {state.events.slice(0, 3).map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    event.outcome === 'blocked'
                      ? 'bg-red-500'
                      : event.outcome === 'enforced'
                        ? 'bg-emerald-500'
                        : 'bg-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <span className="shrink-0 font-mono text-slate-400 dark:text-slate-500">
                  {event.timestamp}
                </span>
                <span className="truncate">{tr(event.detail)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <motion.button
        type="button"
        onClick={onOpenPolicyInspector}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.12, ease: EASE_SETTLE }}
        className="group flex w-full items-center justify-between gap-2 border-t border-slate-200/80 px-5 py-3 text-[13px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.04]"
      >
        {tr("Inspect every policy")}
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
          aria-hidden="true"
        />
      </motion.button>
    </motion.section>
  );
};
