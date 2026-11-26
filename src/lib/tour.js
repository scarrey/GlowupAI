import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// Guided product tour. Elements are targeted by [data-tour="..."] attributes
// placed on the sidebar nav and dashboard cards. Safe to call anywhere — steps
// whose element isn't on the page are skipped by driver.js.

const steps = [
  {
    popover: {
      title: '✨ Welcome to Glow-Up Advisor',
      description:
        'Your AI skincare companion. Let me give you a 30-second tour of what you can do here.',
    },
  },
  {
    element: '[data-tour="nav-skin-analysis"]',
    popover: {
      title: '📸 AI Skin Analysis',
      description:
        'Upload a selfie and our computer-vision model scores your acne, redness, dark spots, texture and hydration — and tracks your progress over time.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav-chat"]',
    popover: {
      title: '💬 Chat with your Advisor',
      description:
        'Ask anything about skincare. The AI remembers your conversation and answers using verified dermatology sources, with citations.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="profile-card"]',
    popover: {
      title: '🧴 Your Skin Profile',
      description: 'Everything is personalized to your skin type, concerns and goals shown here.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="daily-tip"]',
    popover: {
      title: '🌿 AI Daily Tip',
      description: 'A fresh tip each day, generated from your real sleep, water and progress data.',
      side: 'left',
    },
  },
  {
    element: '[data-tour="insights"]',
    popover: {
      title: '📊 Your Insights',
      description:
        'We run correlation analysis on your own data to surface patterns — like how your sleep affects your skin.',
      side: 'top',
    },
  },
  {
    element: '[data-tour="weekly-report"]',
    popover: {
      title: '📄 Weekly AI Report',
      description: 'Generate a summary of your week: what improved, what declined, and next-week tips.',
      side: 'top',
    },
  },
  {
    element: '[data-tour="wellness"]',
    popover: {
      title: '💧 Track your wellness',
      description: 'Log water and sleep daily. The more you track, the smarter your insights get.',
      side: 'top',
    },
  },
  {
    popover: {
      title: "🎉 You're all set!",
      description:
        'Start by uploading a photo or building your routine. You can replay this tour anytime from the “Take a tour” button.',
    },
  },
];

export const TOUR_FLAG = 'glowup_tour_done';

export function createTour() {
  return driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: 'Finish',
    popoverClass: 'glowup-tour',
    steps,
  });
}

export function startTour() {
  const d = createTour();
  d.drive();
  try {
    localStorage.setItem(TOUR_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function maybeAutoStartTour(delay = 900) {
  let seen = false;
  try {
    seen = localStorage.getItem(TOUR_FLAG) === '1';
  } catch {
    seen = false;
  }
  if (seen) return;
  setTimeout(() => startTour(), delay);
}
