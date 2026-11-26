import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/LocaleProvider';

const TERMS: { heading: string; body: string }[] = [
  {
    heading: 'Intellectual property',
    body: 'All software, simulators, APK packages, source code, graphics and branding associated with Ironclad OS are the exclusive property of the creator and are protected by copyright law. All rights reserved.',
  },
  {
    heading: 'Permitted licence',
    body: 'You are granted a limited, personal, non-exclusive, non-transferable licence to use this web application and install the official Ironclad OS APK on Android devices that you own or are explicitly authorised to manage.',
  },
  {
    heading: 'Usage restrictions',
    body: 'You may not copy, clone, scrape, modify, rebrand, decompile, reverse-engineer, mirror, sublicense or commercially distribute Ironclad OS, its UI design or its APK, in whole or in part, without prior written consent.',
  },
  {
    heading: 'Device Owner responsibility',
    body: 'Ironclad OS uses Android Device Owner and DevicePolicyManager lockdown APIs. You are solely responsible for securing your administrator passcode, backing up your device before provisioning, and complying with applicable law.',
  },
  {
    heading: 'Disclaimer',
    body: 'Ironclad OS is provided “as is”, without warranties of any kind. The copyright holder assumes no liability for device lockouts, data loss or system issues resulting from installation or use.',
  },
];

export function LegalFooter() {
  const [showTerms, setShowTerms] = useState(false);
  const { t, tr } = useI18n();

  useEffect(() => {
    if (!showTerms) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowTerms(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showTerms]);

  return (
    <>
      <footer className="mt-auto border-t border-slate-200/80 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:px-6">
          <p>{t('footer.copyright')}</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="min-h-[36px] font-medium text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-300 dark:hover:text-white"
            >
              {t('footer.terms')}
            </button>
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="min-h-[36px] font-medium text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-300 dark:hover:text-white"
            >
              {t('footer.licensing')}
            </button>
          </div>
        </div>
      </footer>

      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setShowTerms(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-terms-heading"
            className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#0d131b]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="legal-terms-heading" className="text-base font-semibold text-slate-900 dark:text-white">
                  {tr("Terms & conditions")}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {tr("© 2026 Ironclad OS. All rights reserved.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                aria-label={tr("Close")}
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              {TERMS.map((section) => (
                <section key={section.heading}>
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                    {tr(section.heading)}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {tr(section.body)}
                  </p>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
