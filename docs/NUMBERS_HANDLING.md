# Numbers Handling - Design Suggestions

## The Problem
Numerical data in scientific papers, textbooks, and technical content needs special treatment:
- Dates: "2024-01-15" or "January 15, 2024"
- Percentages: "45.7%"
- Measurements: "3.5 kg", "150 cm"
- Formulas: "E=mc²"
- Statistics: "p < 0.05", "n=1,234"
- Code snippets: "x = 42"

Simply showing these longer isn't enough - they need **contextual presentation**.

---

## Suggested Approaches

### 1. Number Clustering
Group related numbers together as a single "word unit":
- "January 15, 2024" → display as one unit
- "$1,234.56" → display as one unit
- "3.5 ± 0.2 kg" → display as one unit

### 2. Pause Mode for Data-Heavy Sections
Detect data-dense paragraphs and:
- Auto-pause after showing a number
- Show a "data card" with the number in context
- User presses space to continue

### 3. Science Mode Toggle
User can enable "Science Mode" which:
- Extends display time for numbers by 2x
- Shows numbers in a different color (blue?)
- Adds a subtle background highlight
- Displays units alongside the number

### 4. Equation/Formula Skip
Detect LaTeX-style or formula patterns and:
- Show entire formula as one unit
- Or skip and show "[Formula]" with option to view
- Formulas don't work well with RSVP anyway

### 5. Data Preview Panel
For tables and data-heavy content:
- Detect tabular data patterns
- Show a small preview panel below the word display
- "This section contains numerical data - tap to view table"

---

## Recommended Implementation (Phase 1)

**Simple approach - no AI needed:**

1. Detect number patterns with regex
2. Group with adjacent units/symbols as one display unit
3. Add 1.5x display time multiplier for number units
4. Different color (subtle blue) to signal "this is data"

**Regex patterns to detect:**
```
/\d{1,3}(,\d{3})*(\.\d+)?%?/  - Numbers with commas, decimals, percentages
/\$\d+/                        - Currency
/\d+\s*(kg|g|mg|lb|km|m|cm)/   - Measurements
/\d{4}[-/]\d{2}[-/]\d{2}/      - Dates (ISO)
```

---

## Not Recommended

- **Longer display time alone** - doesn't help comprehension
- **Skipping numbers** - loses context
- **Complex AI parsing** - overkill for MVP

---

## Future Consideration

If we add AI chapter detection, we could also:
- Classify paragraphs as "narrative" vs "data-heavy"
- Adjust reading speed per paragraph type
- Generate summaries of data sections
