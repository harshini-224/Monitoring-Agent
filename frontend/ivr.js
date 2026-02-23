document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const ivrTwilioStatus = document.getElementById("ivrTwilioStatus");
  const ivrTwilioSub = document.getElementById("ivrTwilioSub");
  const ivrRetryQueue = document.getElementById("ivrRetryQueue");
  const ivrRetryNote = document.getElementById("ivrRetryNote");
  const schedulerRunning = document.getElementById("schedulerRunning");
  const schedulerUpdated = document.getElementById("schedulerUpdated");
  const schedulerDelayed = document.getElementById("schedulerDelayed");
  const schedulerDelayedNote = document.getElementById("schedulerDelayedNote");

  try {
    const res = await window.authFetch(`${backend}/reports/system`);
    if (!res.ok) return;
    const data = await res.json();
    if (ivrTwilioStatus) ivrTwilioStatus.textContent = data.twilio_status || "Operational";
    if (ivrTwilioSub) {
      ivrTwilioSub.textContent = data.twilio_checked_at
        ? `Last check ${window.formatTime(data.twilio_checked_at)}`
        : "Last check just now";
    }
    if (ivrRetryQueue) ivrRetryQueue.textContent = data.retry_queue_size ?? data.queue_size ?? "--";
    if (ivrRetryNote) {
      const queue = Number(data.retry_queue_size ?? data.queue_size ?? 0);
      if (queue >= 20) ivrRetryNote.textContent = "Queue overload - service impact risk";
      else if (queue >= 10) ivrRetryNote.textContent = "Queue building - attention required";
      else ivrRetryNote.textContent = "Within normal range";
    }
    if (schedulerRunning) schedulerRunning.textContent = data.scheduler_running ?? "--";
    if (schedulerDelayed) schedulerDelayed.textContent = data.scheduler_delayed ?? "--";
    if (schedulerUpdated) {
      schedulerUpdated.textContent = data.scheduler_last_success
        ? `Last success ${window.formatTime(data.scheduler_last_success)}`
        : "No recent runs";
    }
    if (schedulerDelayedNote) {
      const delayed = Number(data.scheduler_delayed ?? 0);
      schedulerDelayedNote.textContent = delayed ? "Review scheduler queue" : "Within SLA tolerance";
    }
  } catch (err) {
    console.error(err);
  }
});
