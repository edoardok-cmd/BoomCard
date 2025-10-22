# Hero Section Changes Summary

## Changes Made

### 1. Bulgarian Text Styling ✓
- **Change**: Updated Bulgarian text to display on 2 separate lines without the dash
- **Implementation**:
  - Changed text from `'Живейте повече - Плащайте по-малко'` to `'Живейте повече\nПлащайте по-малко'`
  - Added `white-space: pre-line` to CTATitle styled component to handle line breaks
  - Decreased font size for Bulgarian text specifically using `[lang="bg"] &` selector
  - Font sizes:
    - Desktop: 3.2rem (vs 4rem for English)
    - Tablet: 2.2rem (vs 2.75rem)
    - Mobile: 1.6rem (vs 2rem)
- **File**: [partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx](partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx)

### 2. Logo Explode Image ✓
- **Change**: Logo explode image now appears first instead of the black card
- **Implementation**:
  - Copied `/Users/administrator/Downloads/Boom Rado/Logo_Explode.png` to `/public/logo-explode.png`
  - Created `LogoExplode` styled component for the image
  - Logo appears at 60% of video duration
  - Logo fades out and moves left when black card appears
- **File**: [partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx](partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx)

### 3. Animation Timing ✓
- **Change**: Black card appears first, then silver card appears 3 seconds later
- **Implementation**:
  - Added separate state variables: `showLogo`, `showBlackCard`, `showSilverCard`
  - Sequence:
    1. Video plays → Logo appears at 60% duration
    2. Video ends → Black card replaces logo in center
    3. Photos eject from black card (8 seconds)
    4. Photos return to black card (8 seconds)
    5. **Silver card appears 3 seconds after photos start returning**
    6. Animations complete
  - Updated `useEffect` to trigger silver card appearance 3 seconds into the "returning" phase
- **File**: [partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx](partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx)

### 4. Symmetrical Card Positioning ✓
- **Change**: Black and silver cards are positioned symmetrically on opposite sides
- **Implementation**:
  - Black card moves to the left (x: -250px) when silver card appears
  - Silver card appears on the right (x: 250px)
  - Both cards are positioned at the same distance from center
  - Smooth spring animations using Framer Motion
- **File**: [partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx](partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx)

### 5. Playwright Tests ✓
- **Created Tests**:
  1. `hero-card-positions.spec.ts` - Automated tests for card positions (requires long video to complete)
  2. `hero-manual-verification.spec.ts` - Manual verification test with checklist
- **Files**:
  - [partner-dashboard/tests/e2e/hero-card-positions.spec.ts](partner-dashboard/tests/e2e/hero-card-positions.spec.ts)
  - [partner-dashboard/tests/e2e/hero-manual-verification.spec.ts](partner-dashboard/tests/e2e/hero-manual-verification.spec.ts)

## Animation Sequence

```
1. Video plays (boom blast animation)
   └─> Logo explode appears at 60% duration (center)

2. Video ends
   └─> Logo fades out and moves left (-300px)
   └─> Black card appears in center (x: 0)
   └─> CTA text appears below

3. Photo cycling begins (from black card)
   └─> Dealing phase: 0-3s (photos spread out)
   └─> Rest phase: 3-8s (photos stay spread)
   └─> Returning phase starts at 8s
   └─> At 11s (3 seconds into returning): Silver card appears on right
   └─> Black card moves to left (-250px)
   └─> Silver card positioned at right (250px)

4. Animation completes
   └─> Both cards visible and symmetrically positioned
   └─> Cards tilting animations continue indefinitely
```

## Testing Instructions

### Manual Testing
1. Start the dev server: `npm run dev`
2. Open http://localhost:5178/ in your browser
3. Watch the hero section animation sequence:
   - ✓ Video plays with blast animation
   - ✓ Logo explode appears during video
   - ✓ Black card replaces logo after video
   - ✓ Photos eject and return
   - ✓ Silver card appears on right
   - ✓ Black card moves to left
   - ✓ Cards are symmetrically positioned
4. Switch language to Bulgarian to verify text formatting:
   - ✓ Text on 2 lines
   - ✓ Smaller font size
   - ✓ No dash between lines

### Automated Testing
Run the manual verification test:
```bash
npx playwright test tests/e2e/hero-manual-verification.spec.ts --headed --timeout=120000
```

## Files Modified

1. [partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx](partner-dashboard/src/components/common/HeroBlast/HeroBlast.tsx) - Main hero component with all animation logic
2. [partner-dashboard/public/logo-explode.png](partner-dashboard/public/logo-explode.png) - New logo explode image

## Files Created

1. [partner-dashboard/tests/e2e/hero-card-positions.spec.ts](partner-dashboard/tests/e2e/hero-card-positions.spec.ts) - Automated position verification tests
2. [partner-dashboard/tests/e2e/hero-manual-verification.spec.ts](partner-dashboard/tests/e2e/hero-manual-verification.spec.ts) - Manual verification test with checklist

## Visual Preview

The final state shows:
- Black card on the LEFT side (~250px from center)
- Silver card on the RIGHT side (~250px from center)
- Both cards at the same vertical position
- Both cards with tilting animations
- CTA text centered below the cards with Bulgarian text on 2 lines (when in BG language)

## Notes

- The video duration affects the overall timing - currently the video appears to be quite long (40+ seconds)
- Mobile view automatically shows the cards immediately without waiting for the video
- The symmetrical positioning uses equal offsets from center (-250px and +250px) for perfect balance
