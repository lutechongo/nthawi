import { useApp } from '../App.jsx';

export default function Help() {
  const { data } = useApp();
  const { idleMinutes, meetIdleMinutes } = data.settings;
  const faqs = [
    ['How is active time measured?', 'Time counts while tracking is on, a Chrome window is focused, its active tab is one of your tracked tools, and you are using the keyboard or mouse. Background tabs and other apps never count.'],
    ['What happens when I go idle?', `After ${idleMinutes} min without activity (${meetIdleMinutes} min in Google Meet), tracking pauses and those idle minutes are cut out of your totals. It picks up again on its own when you're back. Change the limits in Settings.`],
    ['How are sessions named?', 'From the tab title, so "Onboarding flow v2 – Figma" becomes "Onboarding flow v2". Google Meet calls take the meeting\'s own name from the call. If you come back to the same file within 10 minutes, the same session continues and the time away is left out. You can rename any session from its ⋯ menu.'],
    ['Why are my sessions grouped by app?', 'Switching between tabs creates a new visit each time, which can mean hundreds of rows. "By app" folds them into one line per app, then one line per file or meeting with its visit count. Open a line to see every visit, or switch to "Every visit" for the full list.'],
    ['Why didn\'t I see a nudge?', 'Nudges appear as a small card in the top-right of the tab you\'re working in. They only show while Nthawi is counting, and a pause of 5 minutes or more counts as a break and resets the clock. If you chose system notifications, check that notifications are allowed for Chrome in your computer\'s settings. Use Preview in Settings → Nudges to see what each looks like.'],
    ['How do leave days and public holidays work?', 'Connect Vacation Tracker in Settings → Days off by pasting your personal calendar link. Your approved leave and your location\'s public holidays come in on their own and refresh a few times a day. Those days have no reminders, and any work you do counts as overtime. You can also add a day off by hand.'],
    ['What counts as overtime?', `Anything tracked outside your working hours (${data.settings.workHours?.start || '08:00'}–${data.settings.workHours?.end || '17:00'}) or on days off. Lunch-time work is shown separately unless you choose to count it as overtime. Set your hours in Settings → Working hours.`],
    ['How does the ClickUp timesheet sync work?', 'Connect ClickUp in Settings with your personal API token and pick a default task (plus optional tasks per tool). Each session becomes a time entry on your timesheet. At the end of the day a notification offers "Send to ClickUp" or "Remind me later". You can also click Send to ClickUp on any day yourself. Sessions that were already sent are skipped.'],
    ['Where do the app logos come from?', "From the websites themselves: the first time you open a tracked site, its own icon is saved. Until then you'll see a coloured dot."],
    ['How do projects work?', 'Create a project per client or piece of work (Manage → Projects) and give it keywords. Any session whose name contains a keyword joins that project automatically, across all your tools. You can also move sessions by hand from the session list or the edit dialog. Projects show up on the Overview, stand-ups and reports, and each can have its own ClickUp task.'],
    ['How does the stand-up page help?', 'Reports → Stand-up writes "What did I do yesterday?" from your tracked time, grouped by project, skipping weekends and days off. Add today\'s plan (with one-click suggestions) and any blockers, then open Meeting view when it\'s your turn. With a Claude API key, "Rewrite with AI" turns it into natural sentences.'],
    ['Can I merge or split sessions?', 'Yes. Tick two or more sessions from the same day and click Merge. To split one, open its ⋯ menu and choose Split, then pick the time.'],
    ['How do I stop a page from counting?', 'In the popup, click "Don\'t count this page" while it\'s being tracked, or add addresses or title words in Settings → Pages not counted.'],
    ['Can I fix a wrong entry?', 'Open the ⋯ menu on any session to edit its name, tool and times, duplicate it or delete it. Deleting can be undone from the message that appears.'],
    ['What about time away from the computer?', 'Use "Add manually" on the Overview or Sessions page for calls, whiteboard sessions or anything outside your tracked tools.'],
    ['What if my computer sleeps or Chrome closes?', "The clock stops at the last moment Chrome was running. Tracking stays on, so it continues when you're back in a tracked tool."],
    ['Where is my data?', "In this Chrome profile on this computer (Chrome's extension storage), not in the cloud. Nothing is sent anywhere unless you connect ClickUp. Export CSV opens in Excel or Google Sheets; Settings → Data exports a full JSON backup you can import on another computer. Uninstalling the extension deletes the data, so export first."],
    ['How do I paste my time into ClickUp?', 'Click "Copy summary for ClickUp" to copy the sessions shown (or just the ones you have ticked) as a tidy list with times and totals, then paste it into a task, comment or doc.'],
  ];
  return (
    <section className="card" style={{ maxWidth: 760, padding: '8px 24px' }}>
      {faqs.map(([q, a], i) => (
        <div key={q} style={{ padding: '16px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
          <div style={{ fontWeight: 500 }}>{q}</div>
          <p className="muted" style={{ marginTop: 4 }}>
            {a}
          </p>
        </div>
      ))}
    </section>
  );
}
