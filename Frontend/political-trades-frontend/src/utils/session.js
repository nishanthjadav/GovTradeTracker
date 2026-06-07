export function getSessionId() {
  try {
    let id = localStorage.getItem("gtt_session_id");
    if (id) return id;
    // generate simple v4 UUID
    id = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (
      c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4
    ).toString(16));
    localStorage.setItem("gtt_session_id", id);
    return id;
  } catch (e) {
    // fallback
    let id = 'anon-' + Math.random().toString(36).slice(2,10);
    localStorage.setItem("gtt_session_id", id);
    return id;
  }
}
