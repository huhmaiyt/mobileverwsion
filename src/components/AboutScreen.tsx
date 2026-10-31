/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { STRINGS } from '../strings.ts';
import { TEAM, TEAM_NAME, TEAM_SCHOOL } from '../teamData.ts';

export const AboutScreen: React.FC = () => {
  const teamLine = [TEAM_NAME, TEAM_SCHOOL].filter(Boolean).join(', ');

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#16222B]">About DustWatch</h1>
        <p className="text-sm text-[#4B5964] mt-2 leading-relaxed">
          {STRINGS.app.tagline} It covers ten UAE cities and the next 12 hours, using open weather and
          air-quality forecasts. School Mode compares those conditions with a school's own outdoor-activity rules.
        </p>
      </div>

      <section aria-labelledby="about-limits" className="space-y-2">
        <h2 id="about-limits" className="text-base font-semibold text-[#16222B]">
          What to keep in mind
        </h2>
        <ul className="list-disc pl-5 text-sm text-[#4B5964] space-y-1.5 leading-relaxed">
          <li>Ratings are estimates from model forecasts, not measurements at your location.</li>
          <li>PM10 also includes smoke and pollution, not only dust.</li>
          <li>
            DustWatch is an experimental student project. For official warnings, use the{' '}
            <a
              href={STRINGS.disclaimer.ncmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline hover:text-blue-900"
            >
              UAE National Center of Meteorology
            </a>
            .
          </li>
        </ul>
      </section>

      {TEAM.length > 0 && (
        <section aria-labelledby="about-team" className="space-y-3">
          <h2 id="about-team" className="text-base font-semibold text-[#16222B]">
            Team
          </h2>
          {teamLine && <p className="text-sm text-[#4B5964]">{teamLine}</p>}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {TEAM.map((m) => (
              <div key={m.name} className="border-t border-[#CBD3D7] pt-2">
                <dt className="font-semibold text-[#16222B]">{m.name}</dt>
                <dd className="text-[#4B5964]">{m.role}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
};
