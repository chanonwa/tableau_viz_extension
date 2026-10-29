'use strict';

// Plays the entrance animations of the Combo and Radial charts together. Each extension runs in its own frame, so
// they share an animation clock over a BroadcastChannel (same site only): when one chart starts animating because
// its data changed, the others replay theirs from the same moment, and a chart whose new data arrives part way
// through joins in at the same point. Pages use the elapsed time as a negative CSS animation delay (--elapsed); while
// a scheduled start is still ahead it is negative, which delays the animation and keeps the marks hidden until then.
window.ChartSync = (function () {
  // ms, long enough to cover every chart's animation, label fade-in included
  const DURATION = 1300;
  // ms a shared animation is scheduled ahead, so the other charts can draw their own new data (often on its way
  // from the same parameter change) before anything moves, instead of swapping it in part way through
  const LEAD = 150;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('chart-animation') : null;
  const listeners = [];
  // When the current shared animation started (epoch ms), so frames on the same computer agree on it
  let startTime = -Infinity;

  // Starts an animation, or joins the one in progress or scheduled. share: tell the other charts to play along.
  // Returns the ms already elapsed, for --elapsed (negative while the start is still ahead).
  function begin (share) {
    const now = Date.now();
    if (now - startTime >= DURATION) {
      startTime = share && channel ? now + LEAD : now;
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
