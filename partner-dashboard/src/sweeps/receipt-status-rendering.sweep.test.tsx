/**
 * Class sweep: every ReceiptStatus member renders its intended status class on
 * each surface listed in SURFACES below — today ReceiptCard and
 * ReceiptDetailPage, the two components BC-QA-031-FOLLOWUP-4 changed.
 *
 * The per-member quantifier is executable: SURFACES is mounted once per
 * Object.values(ReceiptStatus) member, and a member added to the enum without a
 * rendering decision fails both tsc and this suite. The per-SURFACE quantifier
 * is NOT: SURFACES is a hand-written array, so a status-dispatching component
 * that is never added to it is simply not covered. Other partner-facing
 * dispatch sites exist and are outside this sweep — ReceiptsPage,
 * ReceiptAnalyticsPage, ReceiptAnalyticsWidget, and the CSS-selector dispatch
 * in receiptPDFTemplates.ts (that last one is stale and is BC-QA-056 ITEM 4).
 * Adding a surface is a one-entry change; deriving SURFACES from something
 * checkable, so an unlisted component fails the sweep, is real work and belongs
 * on the board rather than in a comment promising it.
 *
 * WHAT DEFECT CLASS THIS EXISTS FOR
 * ---------------------------------
 * A `switch (receipt.status)` whose success branch names a status the backend
 * never emits. The branch is then unreachable, the real terminal status falls
 * through to `default`, and the badge quietly renders the wrong thing forever.
 * That is not hypothetical: in `ReceiptDetailPage` the ONLY success cases were
 * `VALIDATED` / `CASHBACK_APPLIED`, two members invented on the frontend and
 * absent from `enum ReceiptStatus` in backend-api/prisma/schema.prisma, so an
 * APPROVED receipt — the real granted-cashback terminal state — rendered an
 * amber *pending* pill with a Clock icon on a live routed page. `tsc` was happy
 * (both sides are enum members), the suite was green (neither file had a test),
 * and nothing reported it. `ReceiptCard` carried the same two dead labels but
 * beside an already-correct `APPROVED` case, so it rendered correctly
 * throughout; it is swept here because it dispatches on status, not because it
 * was broken.
 *
 * `receipts-api.contract.test.ts` now pins the enum's MEMBERSHIP against Prisma.
 * That is a different guarantee from this one: membership says APPROVED exists,
 * it says nothing about APPROVED having a rendering case. This sweep closes that
 * half.
 *
 * WHY A SWEEP RATHER THAN AN "APPROVED RENDERS GREEN" TEST
 * -------------------------------------------------------
 * A single-member test pins the one member someone already thought about. The
 * defect class is "a member nobody thought about reaches `default` unnoticed",
 * so the check iterates `ReceiptStatus` itself. Adding a member to the enum
 * therefore cannot be done silently: the member enters this loop automatically,
 * and `EXPECTED_STATUS_CLASS` below — typed `Record<ReceiptStatus, StatusClass>`
 * — fails `tsc` until someone states what it should look like, and fails at
 * runtime here too (so `npx vitest run` alone is red, not only a typecheck).
 *
 * HOW IT CHECKS
 * -------------
 * It renders the real components and reads what the browser engine computes,
 * rather than reading the switch source. `getComputedStyle` resolves the
 * styled-components rules in jsdom, so the assertions below are on the actual
 * pill background, the actual text colour and the actual icon element — the
 * three things the six `switch` sites across the two files produce.
 *
 * The expectations are SEMANTIC, not a copy of the palette literals:
 *
 *   - icon    — compared against a reference render of `CheckCircle` /
 *               `XCircle` / `Clock` from lucide-react, so it survives lucide
 *               renaming its emitted classes and still says "success shows a
 *               tick, failure shows a cross, in-flight shows a clock".
 *   - colour  — reduced to a hue family (green / red / amber). A re-shade stays
 *               green; swapping the success and danger colours goes red, which a
 *               literal-for-literal comparison would also catch but only by
 *               restating the source in the test.
 *
 * A member's badge must also render IDENTICALLY to every other member of its
 * class on the same surface — that is what makes this a class check rather than
 * seven independent ones, and it means a new member silently given its own
 * bespoke styling has to be declared as its own class here.
 *
 * FAIL-LOUD, NEVER FAIL-OPEN
 * --------------------------
 * Every helper throws with an explicit message when it cannot verify: no status
 * icon in the rendered tree, more than one, a colour that reduces to no known
 * hue family, a class table that does not cover the enum, or two of the three
 * reference icons sharing a class. A sweep that passes because it stopped
 * finding anything to look at is worth nothing.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

import { LanguageProvider } from '../contexts/LanguageContext';
import { ReceiptStatus } from '../types/receipt.types';
import type { PartnerReceipt } from '../types/receipt.types';
import { ReceiptCard } from '../components/feature/ReceiptCard/ReceiptCard';
import { ReceiptDetailPage } from '../pages/ReceiptDetailPage';
import { receiptsApiService } from '../services/receipts-api.service';

vi.mock('../services/receipts-api.service', async () => {
  const actual = await vi.importActual<typeof import('../services/receipts-api.service')>(
    '../services/receipts-api.service',
  );
  return {
    ...actual,
    receiptsApiService: { ...actual.receiptsApiService, getReceiptById: vi.fn() },
  };
});

// ---------------------------------------------------------------------------
// The declared intent
// ---------------------------------------------------------------------------

type StatusClass = 'success' | 'failure' | 'in-flight';

/**
 * What each status is supposed to look like to a partner.
 *
 * `Record<ReceiptStatus, StatusClass>` is deliberate: a member added to the enum
 * breaks `tsc` here until someone decides. `in-flight` is the neutral/waiting
 * class that the `default` arm of every switch produces — listing a member as
 * `in-flight` is a statement that falling through is CORRECT for it, not an
 * admission that it was forgotten.
 */
const EXPECTED_STATUS_CLASS: Record<ReceiptStatus, StatusClass> = {
  // Terminal, cashback granted. The member the original defect stranded on the
  // `default` arm.
  [ReceiptStatus.APPROVED]: 'success',
  // Terminal, cashback refused.
  [ReceiptStatus.REJECTED]: 'failure',
  // Not terminal: the submission is somewhere between upload and a decision.
  [ReceiptStatus.PENDING]: 'in-flight',
  [ReceiptStatus.PROCESSING]: 'in-flight',
  [ReceiptStatus.VALIDATING]: 'in-flight',
  [ReceiptStatus.MANUAL_REVIEW]: 'in-flight',
  // EXPIRED is terminal and is arguably a failure to the partner. It is recorded
  // as `in-flight` because that is what the surfaces render TODAY, and this
  // sweep's job is to pin current behaviour, not to change it.
  //
  // Re-classifying it is BC-QA-056 ITEM 6, which names this entry explicitly
  // alongside the related Success Rate question. Whoever decides EXPIRED is a
  // failure state must change THIS LINE in the same change — otherwise the
  // sweep goes red on a deliberate decision, with no prior notice.
  [ReceiptStatus.EXPIRED]: 'in-flight',
};

/**
 * The class a member is declared to belong to.
 *
 * Throws rather than returning `undefined` for a member the table does not
 * cover, so an undeclared member produces "no declared rendering class" instead
 * of an assertion comparing something against `undefined`.
 */
function declaredClass(status: ReceiptStatus): StatusClass {
  const cls = EXPECTED_STATUS_CLASS[status];
  if (!cls) {
    throw new Error(
      `[status sweep] cannot verify ${status}: EXPECTED_STATUS_CLASS declares no rendering ` +
        `class for it. A member added to ReceiptStatus must be given one here — deciding what ` +
        `a new status looks like is the whole point of this sweep.`,
    );
  }
  return cls;
}

/** Which lucide icon each class must show. */
const ICON_FOR_CLASS = {
  success: <CheckCircle />,
  failure: <XCircle />,
  'in-flight': <Clock />,
} as const satisfies Record<StatusClass, React.ReactElement>;

/** Which hue family each class's background and text colour must fall in. */
const HUE_FOR_CLASS = {
  success: 'green',
  failure: 'red',
  'in-flight': 'amber',
} as const satisfies Record<StatusClass, HueFamily>;

// ---------------------------------------------------------------------------
// Colour reduction
// ---------------------------------------------------------------------------

type HueFamily = 'green' | 'red' | 'amber';

/**
 * Reduce a computed colour to a hue family.
 *
 * The three predicates are mutually exclusive, and anything matching none of
 * them (or more than one) throws rather than being reported as a mismatch — a
 * colour this function cannot classify means the palette moved somewhere this
 * sweep no longer understands, which is a "cannot verify", not a failure of the
 * component.
 *
 * `amber` needs the `g - b` gap because a warm yellow satisfies `r > g && r > b`
 * just as red does; the gap is what separates rgb(254,243,199) from
 * rgb(254,226,226).
 */
const CHANNEL_GAP = 38; // ~15% of 255

function hueFamily(css: string, where: string): HueFamily {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css.trim());
  if (!m) {
    throw new Error(
      `[status sweep] cannot verify ${where}: computed colour ${JSON.stringify(css)} is not an ` +
        `rgb()/rgba() triple. Either the palette moved to a colour space jsdom reports ` +
        `differently, or the badge lost its rule and this is an unset default.`,
    );
  }
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];

  const families: HueFamily[] = [];
  if (g > r && g > b) families.push('green');
  if (r > g && r > b && Math.abs(g - b) <= CHANNEL_GAP) families.push('red');
  if (r >= g && g - b > CHANNEL_GAP) families.push('amber');

  if (families.length !== 1) {
    throw new Error(
      `[status sweep] cannot verify ${where}: computed colour ${css} (r=${r} g=${g} b=${b}) ` +
        `reduces to ${families.length === 0 ? 'no' : families.join(' and ')} hue family. ` +
        `This sweep classifies green / red / amber only; a palette outside those needs a ` +
        `deliberate update here rather than a silent pass.`,
    );
  }
  return families[0];
}

// ---------------------------------------------------------------------------
// Locating the badge in a rendered tree
// ---------------------------------------------------------------------------

/** `class` attribute of a lucide icon, read from a real render of it. */
function referenceIconClass(element: React.ReactElement): string {
  const { container, unmount } = render(element);
  const svg = container.querySelector('svg');
  if (!svg) {
    throw new Error('[status sweep] cannot verify: a lucide reference icon rendered no <svg>.');
  }
  const cls = svg.getAttribute('class');
  unmount();
  if (!cls) {
    throw new Error(
      '[status sweep] cannot verify: lucide no longer puts a class on its <svg>, so the ' +
        'icon identity check below has nothing to compare. Compare on the rendered path ' +
        'geometry instead.',
    );
  }
  return cls;
}

let ICON_CLASS: Record<StatusClass, string>;

/**
 * The status badge: the single element in the tree holding one of the three
 * status icons.
 *
 * Selecting on the icon rather than on the label text keeps this independent of
 * translation strings, and the "exactly one" requirement is what binds the
 * result to the badge — CheckCircle / XCircle / Clock appear nowhere else in
 * either component.
 */
function statusBadge(container: HTMLElement, where: string): { badge: HTMLElement; iconClass: string } {
  const known = Object.values(ICON_CLASS);
  const icons = Array.from(container.querySelectorAll('svg')).filter(svg =>
    known.includes(svg.getAttribute('class') ?? ''),
  );

  if (icons.length !== 1) {
    const seen = Array.from(container.querySelectorAll('svg'))
      .map(s => s.getAttribute('class'))
      .join(', ');
    throw new Error(
      `[status sweep] cannot verify ${where}: expected exactly one status icon in the rendered ` +
        `tree, found ${icons.length}. Icons present: ${seen || '(none)'}. Either the badge did ` +
        `not render, or one of CheckCircle / XCircle / Clock is now used somewhere else in this ` +
        `component and this selector no longer isolates the badge.`,
    );
  }

  const badge = icons[0].parentElement;
  if (!(badge instanceof HTMLElement)) {
    throw new Error(
      `[status sweep] cannot verify ${where}: the status icon has no element parent to read the ` +
        `badge styling off.`,
    );
  }
  return { badge, iconClass: icons[0].getAttribute('class') as string };
}

interface Observed {
  iconClass: string;
  background: HueFamily;
  color: HueFamily;
  /** Everything that must be identical across members of one class. */
  signature: string;
}

function observe(container: HTMLElement, where: string): Observed {
  const { badge, iconClass } = statusBadge(container, where);
  const computed = window.getComputedStyle(badge);
  const rawBackground = computed.backgroundColor;
  const rawColor = computed.color;
  return {
    iconClass,
    background: hueFamily(rawBackground, `${where} badge background`),
    color: hueFamily(rawColor, `${where} badge text colour`),
    signature: `icon=${iconClass} background=${rawBackground} color=${rawColor}`,
  };
}

// ---------------------------------------------------------------------------
// The two surfaces
// ---------------------------------------------------------------------------

const receiptWith = (status: ReceiptStatus): PartnerReceipt => ({
  id: 'rcpt-sweep-1',
  totalAmount: 200,
  merchantName: 'Sweep Merchant',
  imageUrl: 'https://example.com/r.jpg',
  cashbackAmount: 12.34,
  status,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

interface Surface {
  name: string;
  /** Render the surface showing a receipt in `status`, and return its container. */
  mount: (status: ReceiptStatus) => Promise<HTMLElement>;
}

const SURFACES: Surface[] = [
  {
    name: 'ReceiptCard (src/components/feature/ReceiptCard/ReceiptCard.tsx)',
    mount: async status => {
      const { container } = render(
        <MemoryRouter>
          <LanguageProvider>
            <ReceiptCard receipt={receiptWith(status)} />
          </LanguageProvider>
        </MemoryRouter>,
      );
      return container;
    },
  },
  {
    name: 'ReceiptDetailPage (src/pages/ReceiptDetailPage.tsx)',
    mount: async status => {
      (receiptsApiService.getReceiptById as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: receiptWith(status),
      });
      const { container } = render(
        <MemoryRouter initialEntries={['/receipts/rcpt-sweep-1']}>
          <LanguageProvider>
            <Routes>
              <Route path="/receipts/:id" element={<ReceiptDetailPage />} />
            </Routes>
          </LanguageProvider>
        </MemoryRouter>,
      );
      // The page fetches before it can render a badge; without this the sweep
      // would read the loading state and `statusBadge` would throw.
      await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
      return container;
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReceiptStatus rendering sweep (BC-QA-031-FOLLOWUP-4)', () => {
  beforeEach(() => {
    // Language only affects the label text, which nothing below reads; pinning it
    // keeps the render deterministic regardless of the runner's stored value.
    localStorage.setItem('boomcard_language', 'en');
    ICON_CLASS = {
      success: referenceIconClass(ICON_FOR_CLASS.success),
      failure: referenceIconClass(ICON_FOR_CLASS.failure),
      'in-flight': referenceIconClass(ICON_FOR_CLASS['in-flight']),
    };
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('declares an intended rendering for exactly the members the enum has', () => {
    // The runtime half of the `Record<ReceiptStatus, StatusClass>` guarantee, so
    // `npx vitest run` on its own is red for an undeclared member rather than
    // relying on someone also running `tsc --noEmit`.
    expect(
      Object.keys(EXPECTED_STATUS_CLASS).sort(),
      'EXPECTED_STATUS_CLASS no longer covers ReceiptStatus exactly. A member added to the ' +
        'enum must be given an intended rendering here — that decision is the whole point of ' +
        'this sweep, and skipping it is how APPROVED came to render as pending.',
    ).toEqual(Object.values(ReceiptStatus).sort());
  });

  it('renders the three classes distinguishably (otherwise this sweep asserts nothing)', () => {
    const icons = Object.values(ICON_CLASS);
    expect(
      new Set(icons).size,
      `the three status icons no longer have distinct classes (${icons.join(', ')}), so the ` +
        `per-member icon assertions below could not tell a success badge from a pending one.`,
    ).toBe(icons.length);

    const hues = Object.values(HUE_FOR_CLASS);
    expect(new Set(hues).size, 'two status classes are mapped to the same hue family.').toBe(
      hues.length,
    );
  });

  SURFACES.forEach(surface => {
    describe(surface.name, () => {
      it('gives every ReceiptStatus member the icon and hue its class requires', async () => {
        for (const status of Object.values(ReceiptStatus)) {
          cleanup();
          const where = `${surface.name} with status=${status}`;
          const expectedClass = declaredClass(status);
          const observed = observe(await surface.mount(status), where);

          expect(
            observed.iconClass,
            `${where} renders the wrong icon. ${status} is classed '${expectedClass}', which ` +
              `must show ${ICON_CLASS[expectedClass]}. Reaching the switch's \`default\` arm ` +
              `instead of an explicit \`case ReceiptStatus.${status}:\` is exactly how an ` +
              `APPROVED receipt came to show a Clock.`,
          ).toBe(ICON_CLASS[expectedClass]);

          expect(
            observed.background,
            `${where} renders a pill background in the ${observed.background} family, but ` +
              `${status} is classed '${expectedClass}' and must be ` +
              `${HUE_FOR_CLASS[expectedClass]}.`,
          ).toBe(HUE_FOR_CLASS[expectedClass]);

          expect(
            observed.color,
            `${where} renders badge text in the ${observed.color} family, but ${status} is ` +
              `classed '${expectedClass}' and must be ${HUE_FOR_CLASS[expectedClass]}.`,
          ).toBe(HUE_FOR_CLASS[expectedClass]);
        }
      });

      it('renders members of the same class identically, and different classes differently', async () => {
        const signatures = new Map<ReceiptStatus, string>();
        for (const status of Object.values(ReceiptStatus)) {
          cleanup();
          signatures.set(
            status,
            observe(await surface.mount(status), `${surface.name} with status=${status}`).signature,
          );
        }

        for (const [a, sigA] of signatures) {
          for (const [b, sigB] of signatures) {
            if (a === b) continue;
            const [classA, classB] = [declaredClass(a), declaredClass(b)];
            const sameClass = classA === classB;
            expect(
              sigA === sigB,
              sameClass
                ? `${a} and ${b} are both classed '${classA}' but render differently on ` +
                  `${surface.name}:\n  ${a}: ${sigA}\n  ${b}: ${sigB}\n` +
                  `If one of them deserves its own treatment, give it its own StatusClass here ` +
                  `so the decision is recorded, rather than letting the two drift apart silently.`
                : `${a} ('${classA}') and ${b} ('${classB}') render identically on ` +
                  `${surface.name} (${sigA}). One of them is falling through to a branch meant ` +
                  `for the other.`,
            ).toBe(sameClass);
          }
        }
      });
    });
  });
});
