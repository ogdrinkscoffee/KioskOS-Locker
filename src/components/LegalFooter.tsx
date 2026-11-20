import React, { useState } from 'react';

export function LegalFooter() {
  const [showTerms, setShowTerms] = useState(false);

  return (
    <>
      <footer className="mt-12 border-t border-slate-800 bg-slate-950/90 px-6 py-6 text-xs text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <p className="font-medium text-slate-300">
              © 2026 KioskOS. All Rights Reserved.
            </p>
            <p className="text-[11px] text-slate-500">
              Proprietary Software &amp; UI. Unauthorized copying, reverse-engineering, or redistribution is strictly prohibited.
            </p>
          </div>

          <div className="flex items-center gap-5">
            <button
              onClick={() => setShowTerms(true)}
              className="font-medium text-blue-400 underline-offset-4 hover:text-blue-300 hover:underline"
            >
              Terms &amp; Conditions
            </button>
            <button
              onClick={() => setShowTerms(true)}
              className="text-slate-300 underline-offset-4 hover:text-white hover:underline"
            >
              Copyright &amp; Licensing
            </button>
          </div>
        </div>
      </footer>

      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  KioskOS — Terms &amp; Conditions
                </h2>
                <p className="text-xs text-slate-400">
                  Effective Date: 2026 • © 2026 KioskOS. All Rights Reserved.
                </p>
              </div>
              <button
                onClick={() => setShowTerms(false)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-slate-300">
              <section>
                <h3 className="font-semibold text-white">1. Intellectual Property &amp; Copyright</h3>
                <p>
                  All software, web simulator interfaces, native Android APK packages, source code,
                  architecture, graphics, and branding associated with KioskOS are the exclusive
                  property of the creator and are protected by copyright and intellectual property
                  laws. All rights are strictly reserved.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-white">2. Permitted End-User License</h3>
                <p>
                  You are granted a limited, personal, non-exclusive, non-transferable license to
                  use this web application and install the official KioskOS APK on Android devices
                  that you own or have explicit administrative authorization to manage.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-white">3. Anti-Piracy &amp; Usage Restrictions</h3>
                <p>
                  You may not copy, clone, scrape, modify, rebrand, decompile, reverse-engineer,
                  mirror, sublicense, or commercially distribute KioskOS, its UI design, or its APK
                  in whole or in part without prior written consent from the copyright holder.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-white">4. Device Owner &amp; Administrator Responsibility</h3>
                <p>
                  KioskOS utilizes Android Device Owner and DevicePolicyManager lockdown APIs.
                  You are solely responsible for securing your administrator passcode, backing up
                  your device prior to provisioning, and complying with all applicable laws.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-white">5. Disclaimer &amp; Limitation of Liability</h3>
                <p>
                  KioskOS is provided &ldquo;as is&rdquo; without warranties of any kind. The
                  copyright holder assumes no liability for device lockouts, data loss, or system
                  issues resulting from the installation or use of this software.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
