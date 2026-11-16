# OpenPath: 2-minute live demo

One presenter drives, one talks (or one person does both). Lines in quotes are
what to say. Times are cumulative.

## Before you go on (10 minutes before)

1. From the repo root: `npm run demo:nodocker`. Wait for both URLs to print.
2. Open these tabs in Chrome, in this order, at 100% zoom:
   1. http://localhost:5173/savanna/index.html
   2. http://localhost:5173/demo/jobs.html
   3. `docs/pitch/index.html` (the slides), on slide 8
3. In tab 1, open DevTools > Application > Local storage and clear it, so
   "How do you want to use this?" shows again. Close DevTools.
4. Test the microphone once in tab 1 and press **Allow** in Chrome's own prompt,
   so the browser does not ask in the middle of the demo. Then clear local storage again.
5. Turn the laptop volume up (read-aloud must be heard by the room).
6. Have a backup: the typed answer for every voice step is in the script below.

The in-memory API forgets everything on restart. That is fine for a demo.

## The demo

### 0:00 – 0:15 · Start from an existing site (tab 1)

- Show the Savanna page. Click **Start accessible onboarding**.
- "This is an existing site. We added one script tag. Nothing else on the page changed."

### 0:15 – 0:35 · The learner chooses how to use it

- "How do you want to use this?" is on screen.
- Point at **Continue with my device's own tools**: "If you already use TalkBack or NVDA,
  one press turns every helper off, so we never talk over your screen reader."
- Tick **Read questions to me**, **I want to speak my answers** and **Simple words**.
  Under **Text size**, choose **Large**. Go on to the first question.
- On the first question, press **Listen**. Let it read a few words, then press **Escape**.
- "Every helper is off until the learner turns it on."

### 0:35 – 0:55 · Answer by voice

- On the name question press **Speak your answer**. The consent question appears; read
  the first line aloud ("Your voice is sent over the internet...") and press **Allow**.
- Say a name clearly. It lands in the field, still editable. Press **Next**.
- "It never moves on by itself. The learner checks the text first."
- If the mic fails: the message ends with "You can type instead." Say "and that is the
  point", type the name, and carry on.

### 0:55 – 1:15 · Built for Ethiopia

- Phone: type a number and go on.
- Date of birth: it opens in the Ethiopian calendar (13 months in the list). Pick a date,
  then press **Use Gregorian calendar**: "The same day carries over. Either calendar."
- Language and location: answer quickly.
- ID question: choose **I have no ID. Please help me.**
- Point at the step count: "One more question was added. A screen reader hears that once."
  The new question asks which organisation is helping. "No ID is a route, not a dead end."

### 1:15 – 1:30 · Offline

- Open DevTools > Network, set **Offline**. Press **Next**.
- The note says "Saved on this device. It will be sent when you are back online."
- Set Network back to **No throttling**. "It sends by itself when the connection is back."
- Close DevTools.

### 1:30 – 1:50 · Career Gateway (tab 2)

- Open **Support I need**. Read the line "Only you can see this. Employers are not told."
- Tick **Step-free workplace**. The list shrinks and the number of results is announced.
- "This filter never leaves the phone. Not to us, not to the employer."
- Press **Apply for** on any job: "Same form, same helpers, answers by voice."

### 1:50 – 2:00 · Close (tab 3, slide 8)

- "439 automated tests and zero axe violations across 48 real-browser checks
  in three languages. What we have not done yet is test with disabled users.
  That is our next step, and we would like your help with it."

## If something breaks

| What | Do this |
|------|---------|
| Form says it cannot reach the server | Say "this is the offline mode", skip the 1:15 step, and keep going. |
| Read-aloud is silent | Check volume; otherwise say "no voice on this laptop, so the Listen button would be hidden" and move on. |
| Mic does not work | Type. The failure message ("You can type instead.") is part of the story. |
| "How do you want to use this?" does not appear | Local storage was not cleared; press **Settings** on the step instead. |
| Running long | Drop the offline step (1:15 – 1:30). |

## Optional (only for Q&A)

- **Brand colours cannot break it:** in DevTools on the demo page, set
  `--openpath-color: #fff59d` on `openpath-flow`. The console explains that it uses
  `#847600` (4.59:1) for text instead.
- **Amharic and Arabic:** use the language switcher on the first screen. Arabic turns the
  whole form right to left. Both translations are drafts awaiting a native-speaker review;
  say so if asked.
- **Employers:** http://localhost:5173/demo/employer.html posts a job and the support it
  offers. It is open to anyone for now; sign-in is a next step.
