# OpenPath: WCAG 2.2 Level A and AA conformance report

**Scope:** the `<openpath-flow>` and `<openpath-jobs>` elements (`frontend/dist/openpath.js`) with
the three question files in `frontend/public/questions/`, as shown on the demo pages
(`frontend/demo/`). The host page around the element (Savanna, or your own site) is the host's
responsibility and is not covered, except where a row says so.

**Date of the checks recorded here:** 2026-11-16.

**This is a self-assessment from automated tests.** No testing with disabled users,
co-designers, or by hand with a screen reader (NVDA, JAWS, TalkBack, VoiceOver), switch access
or voice control has been done or recorded. Where a row says *Supports*, that means the
automated checks below passed and the code was reviewed; it does not mean a person using
assistive technology has confirmed it.

## How it was checked

| Method | What it is |
|--------|------------|
| **axe walk** | `npm run test:browser` (`frontend/test/browser/a11y.browser.mjs`): headless Chrome walks every screen of the onboarding form, the job list (filter, apply, application form) and the employer form, in English, Amharic and Arabic (right to left), with every helper off, each helper on, large and largest text with high contrast at 320 px (400 % zoom), dark mode, and 640 px (200 % zoom). On every screen it runs axe-core with the tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice` and **fails on serious or critical violations** (moderate and minor ones are not gated). |
| **walk check** | Extra assertions in the same walk: no sideways scroll; targets at least 44 × 44 px; text at least 18 px; `lang` and `dir` on the form; focus lands on the question heading after each step; errors linked to the field, focused and announced; a 3 px solid focus outline; Back/Next follow the reading direction; nothing spoken unless read-aloud is on; no requests leave the machine. |
| **unit test** | `npm test` in `frontend/` (vitest + jsdom, 22 files): axe on each question type, focus management, errors, `showIf` announcements, contrast maths, theme and host-colour correction, "never colour alone", helpers, language fallback. |
| **keyboard** | Only what the walk and unit tests do: the walk presses Tab and Escape on some screens; unit tests check focus moves. **No full keyboard-only pass by a person has been recorded.** |
| **code review** | Read the source; no test asserts it. |
| **manual** | **None recorded.** |

### Tools, browsers, languages

| | |
|-|-|
| Tools | axe-core 4.14.0, playwright-core 1.65.1, vitest 5.1.0, jsdom 29 |
| Browser | Google Chrome 157.0.8103.51, headless, Windows 11 (the walk falls back to Edge if Chrome is missing). **Firefox, Safari, and mobile browsers: not tested.** |
| Languages | English (source); Amharic (draft, not reviewed by a native speaker); Arabic (draft, right to left, not reviewed) |
| Results on 2026-11-16 | Browser walk: all screens passed (en, am, ar). Frontend unit tests: 361/361 passed. API tests: 78/78 passed (in-memory store; the Postgres run was not repeated that day). |

## Results

Legend: **Supports**, **Partially**, **Not applicable**, **Not tested**.
4.1.1 Parsing is obsolete in WCAG 2.2 and is not listed.

### 1 Perceivable

| Criterion | Level | Result | Note | Checked by |
|-----------|-------|--------|------|------------|
| 1.1.1 Non-text Content | A | Supports | Icons are decorative (`aria-hidden`); every control has a text name. | axe walk, unit test |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | Not applicable | No audio or video content. Read-aloud audio files are spoken versions of text that is on screen. | code review |
| 1.2.2 Captions (Prerecorded) | A | Not applicable | No video. | code review |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | Not applicable | No video. | code review |
| 1.2.4 Captions (Live) | AA | Not applicable | No live media. | code review |
| 1.2.5 Audio Description (Prerecorded) | AA | Not applicable | No video. | code review |
| 1.3.1 Info and Relationships | A | Supports | Real `<label>`s, `<fieldset>`/`<legend>` for choices, one `h2` per question, hints and errors tied with `aria-describedby`. | axe walk, unit test |
| 1.3.2 Meaningful Sequence | A | Supports | DOM order is reading order in LTR and RTL; Back/Next follow the reading direction. | walk check, axe walk |
| 1.3.3 Sensory Characteristics | A | Not tested | Instructions do not refer to shape, position or colour as far as reviewed; not checked by a test. | code review |
| 1.3.4 Orientation | AA | Not tested | No orientation lock in the code; not tried on a rotated device. | code review |
| 1.3.5 Identify Input Purpose | AA | Partially | Name (`name`), phone (`tel-national`), city (`address-level2`) and organisation have `autocomplete`. The onboarding date of birth uses the Ethiopian calendar and has no `bday` tokens (the date control supports `bday-*` when `"autocomplete": "bday"` is set). | unit test, code review |
| 1.4.1 Use of Color | A | Supports | Errors have an icon and words; required/optional told apart in words; selected options are ticked native controls. | unit test ("never colour alone") |
| 1.4.2 Audio Control | A | Supports | Nothing plays unless the learner turns on read-aloud; Stop button and Escape stop it; it stops on each step change. | walk check, unit test |
| 1.4.3 Contrast (Minimum) | AA | Supports | axe colour-contrast in light, dark and high-contrast themes; host brand colours are measured and corrected at run time. | axe walk, unit test |
| 1.4.4 Resize Text | AA | Supports | Text size 150 % and 200 %, and 200 % zoom (640 px), without loss of content or sideways scroll. | walk check |
| 1.4.5 Images of Text | AA | Supports | No images of text. | code review |
| 1.4.10 Reflow | AA | Supports | No sideways scroll at 320 px with largest text, in all three languages. | walk check |
| 1.4.11 Non-text Contrast | AA | Partially | Focus outline is checked to be 3 px solid; the contrast of the outline, borders and checkboxes against the background is **not measured** by any test. | walk check (width only) |
| 1.4.12 Text Spacing | AA | Not tested | No test applies the text-spacing overrides. | none |
| 1.4.13 Content on Hover or Focus | AA | Not applicable | No tooltips or content that appears on hover or focus. | code review |

### 2 Operable

| Criterion | Level | Result | Note | Checked by |
|-----------|-------|--------|------|------------|
| 2.1.1 Keyboard | A | Partially | All controls are native buttons, inputs and selects. A full keyboard-only walk through every screen has **not** been done; tests use Tab and Escape on some screens. | keyboard (partial), code review |
| 2.1.2 No Keyboard Trap | A | Not tested | No focus-trapping code; not tested. | code review |
| 2.1.4 Character Key Shortcuts | A | Supports | The only key OpenPath handles is Escape (not a character key). | code review |
| 2.2.1 Timing Adjustable | A | Supports | No time limits; answers are saved on the device as the learner goes. | code review |
| 2.2.2 Pause, Stop, Hide | A | Supports | No moving, blinking or auto-updating content; reduced motion turns off transitions. | code review |
| 2.3.1 Three Flashes or Below Threshold | A | Supports | Nothing flashes. | code review |
| 2.4.1 Bypass Blocks | A | Not applicable | One question per screen inside the host page; skip links are the host page's job. | code review |
| 2.4.2 Page Titled | A | Not applicable | The element does not own the page title. The demo pages have titles (axe `document-title` passes). | axe walk (demo pages) |
| 2.4.3 Focus Order | A | Supports | Focus moves to the question heading on Next and Back; on Send with missing answers it goes to the first unanswered question. | walk check, unit test |
| 2.4.4 Link Purpose (In Context) | A | Supports | Each job has its own heading and a clearly named Apply control. | axe walk, walk check |
| 2.4.5 Multiple Ways | AA | Not applicable | A single form within one page. | code review |
| 2.4.6 Headings and Labels | AA | Supports | Each question is an `h2` heading and the field's label. Clarity of wording not tested with users. | axe walk, unit test |
| 2.4.7 Focus Visible | AA | Supports | 3 px solid outline on keyboard focus. | walk check |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Not tested | No sticky or overlay elements in the form as far as reviewed; not tested. | code review |
| 2.5.1 Pointer Gestures | A | Supports | No multipoint or path gestures. | code review |
| 2.5.2 Pointer Cancellation | A | Supports | Native buttons act on release (click). | code review |
| 2.5.3 Label in Name | A | Not tested | Visible labels are the accessible names by construction; not tested (axe's rule for this is not in the tags used). | code review |
| 2.5.4 Motion Actuation | A | Not applicable | No motion input. | code review |
| 2.5.7 Dragging Movements | AA | Not applicable | No dragging. | code review |
| 2.5.8 Target Size (Minimum) | AA | Supports | Buttons, inputs, selects and option rows are at least 44 × 44 px (above the 24 px minimum). | walk check |

### 3 Understandable

| Criterion | Level | Result | Note | Checked by |
|-----------|-------|--------|------|------------|
| 3.1.1 Language of Page | A | Supports | The form sets `lang` and `dir` from the language pack; the page's own `lang` is the host's job (demo pages pass axe `html-has-lang`). | walk check, axe walk |
| 3.1.2 Language of Parts | AA | Supports | Text shown in English because it has no translation is marked `lang="en"` (and `dir="ltr"` in RTL); each language name in the switcher has its own `lang`. | unit test |
| 3.2.1 On Focus | A | Supports | Focus never changes the page by itself. | code review |
| 3.2.2 On Input | A | Partially | Answers never move to the next step by themselves (voice input included). A `showIf` answer adds or removes later questions and says so, without moving focus. Choosing a language re-renders the form in that language at once. | unit test, walk check |
| 3.2.3 Consistent Navigation | AA | Supports | Back, Next and Settings are in the same place on every step. | walk check |
| 3.2.4 Consistent Identification | AA | Supports | The same controls have the same names on every step. | code review, unit test |
| 3.2.6 Consistent Help | A | Not applicable | The element offers no help mechanism; any help link is the host's. | code review |
| 3.3.1 Error Identification | A | Supports | Error in text with an icon, under the field, `aria-invalid`, focused and announced. | walk check, unit test |
| 3.3.2 Labels or Instructions | A | Supports | Every field has a label, optional ones say "optional" in words, hints give formats (e.g. phone examples). | unit test, axe walk |
| 3.3.3 Error Suggestion | AA | Supports | Plain-language errors say what to fix (e.g. phone number format for the chosen country). | unit test |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Supports | A review screen lists every answer with Edit before sending. | unit test |
| 3.3.7 Redundant Entry | A | Supports | Earlier answers prefill later flows (onboarding → job application) if the learner agreed to keep them. | walk check, unit test |
| 3.3.8 Accessible Authentication (Minimum) | AA | Not applicable | No login, password or code entry. | code review |

### 4 Robust

| Criterion | Level | Result | Note | Checked by |
|-----------|-------|--------|------|------------|
| 4.1.2 Name, Role, Value | A | Supports | Native controls; ARIA only for `aria-pressed`, `aria-disabled`, `aria-invalid`, `aria-describedby`, `aria-labelledby`. Not confirmed with a screen reader. | axe walk, unit test |
| 4.1.3 Status Messages | AA | Supports | One live region announces errors, added/removed questions, voice results and "saved on this device". Announcements are checked in the DOM only; **not heard through a screen reader**. | walk check, unit test |

## Known gaps

1. **No testing with disabled users or co-designers, and no manual screen reader testing
   (NVDA, JAWS, TalkBack, VoiceOver) is recorded.** This is the most important gap.
2. No full keyboard-only pass (2.1.1, 2.1.2); text spacing (1.4.12); non-text contrast of
   borders and focus outline (1.4.11); label in name (2.5.3); focus not obscured (2.4.11);
   orientation (1.3.4); and sensory characteristics (1.3.3) are not tested.
3. Only Chrome on Windows was used. Firefox, Safari, Android and iOS are not tested.
4. axe moderate and minor findings do not fail the walk and have not been reviewed here.
5. Amharic and Arabic texts are drafts not reviewed by native speakers, so the clarity of
   labels, instructions and errors in those languages (2.4.6, 3.3.2, 3.3.3) is unconfirmed.
6. The onboarding date of birth has no `bday` autocomplete (1.3.5).
