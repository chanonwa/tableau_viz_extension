'use strict';

// Plays the entrance animations of the Combo and Radial charts together. Each extension runs in its own frame, so
// they share an animation clock over a BroadcastChannel (same site only): when one chart starts animating because
// its data changed, the others replay theirs from the same moment, and a chart whose new data arrives part way
// through joins in at the same point. Pages use the elapsed time as a negative CSS animation delay (--elapsed).
window.ChartSync = (function () {
  // ms, long enough to cover every chart's animation, label fade-in included
  const DURATION = 1000;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('chart-animation') : null;
  const listeners = [];
  // When the current shared animation started (epoch ms), so frames on the same computer agree on it
  let startTime = -Infinity;

  // Starts an animation, or joins the one in progress. share: tell the other charts to play along.
  // Returns the ms already elapsed, for --elapsed.
  function begin (share) {
    const now = Date.now();
    if (now - startTime >= DURATION) {
      startTime = now;
      if (share) channel?.postMessage({ time: startTime });
    }
    return now - startTime;
  }

  // callback() replays the chart's animation when another chart starts one
  function onPartnerStart (callback) {
    listeners.push(callback);
  }

  if (channel) {
    channel.onmessage = ({ data }) => {
      // Already animating, for example because the same parameter change reached this chart first
      if (Date.now() - startTime < DURATION) return;
      startTime = data.time;
      listeners.forEach(callback => callback());
    };
  }

  return { begin, onPartnerStart };
})();
