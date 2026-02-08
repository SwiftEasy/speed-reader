# Speed Reader Session - Feb 2, 2026
## Cadence Optimization & Line Spotlight Feature

### Summary
This session focused on making single-word RSVP display feel more natural and adding a context mode line spotlight feature. The result is a significantly smoother reading experience.

---

## 1. Single Word Display - Natural Cadence

### Features Implemented

#### ORP Alignment (Already Existed)
- Words positioned so the Optimal Recognition Point (~1/3 into word) stays centered
- Red focal letter marks the anchor point
- Located in `getOptimalRecognitionPoint()` and `WordDisplay` component

#### 4-Beat Pacing
Every 4th word gets a micro-pause (+30%) creating a rhythmic "ta-ta-ta-ta [pause]" pattern.

```javascript
const beat = (wordPosition % 4) + 1;
if (beat === 4) beatMultiplier = 1.3;
```

#### Smooth Sentence Curve
Symmetric cosine curve for natural sentence flow:
- **Start**: 120% (slow - orient reader)
- **Middle**: 90% (fast - cruise)
- **End**: 120% (slow - anticipate pause)

```javascript
const smoothCurve = 0.90 + 0.30 * Math.cos(sentenceProgress * Math.PI * 2);
```

#### Emphasis Detection
- **Capitalized words** mid-sentence: +20% (proper nouns, emphasis)
- **After comma**: +15% (key phrase starts)
- **First word of sentence**: +25% (orient reader)

```javascript
if (!isFirstOfSentence && /^[A-Z]/.test(word)) multiplier += 0.2;
if (isAfterComma) beatMultiplier = Math.max(beatMultiplier, 1.15);
if (isFirstOfSentence) beatMultiplier = Math.max(beatMultiplier, 1.25);
```

#### Random Variation (±12%)
Prevents monotony by adding subtle random jitter:

```javascript
const jitter = 0.88 + Math.random() * 0.24; // 0.88 to 1.12
delay = delay * jitter;
```

#### Punctuation Pauses
- **Sentence end** (. ! ?): +110%
- **Comma** (, ; :): +40%
- **Long words** (>8 chars): +30%
- **Very long words** (>12 chars): +60%
- **Numbers**: +50%

---

## 2. Context Mode - Line Spotlight Feature

### Toggle Location
Settings → Context → ⚙️ Settings → **Line Spotlight**

### Behavior (Final Version)
When enabled:
- **Current line + past lines**: White text (revealed)
- **Future lines**: Dim (40% opacity)
- **No red sweep glow** (disabled for cleaner look)

### How It Works

```
Line 1:  WHITE WHITE WHITE WHITE WHITE  (past - already read)
Line 2:  WHITE WHITE WHITE WHITE WHITE  (current - being read)
Line 3:  dim   dim   dim   dim   dim    (future - not yet read)
Line 4:  dim   dim   dim   dim   dim    (future)
```

### Constant Timing Sync
When spotlight mode is on, word timing uses constant delay (base WPM only) to sync with the visual flow:

```javascript
if (showContext && spotlightMode) {
  const baseDelay = 60000 / wpm;
  delay = baseDelay / contextSpeedMultiplier;
}
```

---

## 3. All Timing Parameters (Current Values)

| Parameter | Value | Effect |
|-----------|-------|--------|
| 4-beat pause | +30% | Every 4th word |
| Sentence start | 120% | Cosine curve start |
| Sentence middle | 90% | Cosine curve valley |
| Sentence end | 120% | Cosine curve end |
| First word of sentence | +25% | Orient reader |
| After comma | +15% | Emphasis |
| Capitalized mid-sentence | +20% | Emphasis |
| Period/!/? | +110% | Sentence breath |
| Comma/;/: | +40% | Clause pause |
| Long word (>8) | +30% | Processing time |
| Very long (>12) | +60% | More processing |
| Numbers | +50% | Processing time |
| Random jitter | ±12% | Prevent monotony |

---

## 4. Files Modified

### `/src/components/SpeedReader.jsx`

#### New State Variables
```javascript
const [spotlightMode, setSpotlightMode] = useState(false);
```

#### Modified Functions
- `calculateDelay()` - Added all cadence logic
- Reading interval `useEffect` - Added sentence tracking, spotlight sync

#### New UI
- Spotlight toggle in Context settings panel

---

## 5. CSS Animation (Preserved but Disabled)

The red sweep animation code is preserved but not rendered:

```javascript
// CSS for spotlight sweep animation
const spotlightStyles = `
@keyframes sweepLine {
  0% { left: -10%; }
  100% { left: 85%; }
}
.spotlight-sweep {
  animation: sweepLine var(--sweep-duration, 2s) linear forwards;
}
`;
```

To re-enable red sweep, uncomment the spotlight div in the Context rendering section.

---

## 6. User Preference Notes

- **Preferred**: Line-by-line white reveal without red glow
- **Key insight**: The smooth sentence curve (120% → 90% → 120%) makes reading feel natural
- **Game changer**: Combination of rhythm + emphasis + variation mimics natural speech

---

## 7. Future Enhancement Ideas

1. **Adjustable curve parameters** - Let user tune start/middle/end percentages
2. **Per-line sweep speed** - Adjust based on line length
3. **Reading ruler mode** - Horizontal bar that moves down
4. **Peripheral gradient** - Words blur as distance from focus increases
5. **Multiple spotlight styles** - Toggle between different visual guides

---

*Session completed: Feb 2, 2026, ~11:24pm CET*
