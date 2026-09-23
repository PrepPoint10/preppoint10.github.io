document.addEventListener("DOMContentLoaded", () => {  if (!window.supabase) {
    alert("Supabase library did not load. Please reload the page.");
    return;
  }

  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
    alert("Supabase configuration did not load.");
    return;
  }
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const BUCKET = "materials";

let resources = [];

const grid = document.getElementById("resourceGrid");
const searchInput = document.getElementById("searchInput");
const subjectFilter = document.getElementById("subjectFilter");
const typeFilter = document.getElementById("typeFilter");
const resultCount = document.getElementById("resultCount");
const emptyState = document.getElementById("emptyState");
const topLoader = document.getElementById("topLoader");                                                     
                                                     

function renderResources() {
  const q = searchInput.value.trim().toLowerCase();
  const s = subjectFilter.value, t = typeFilter.value;
  const filtered = resources.filter(r =>
    (!q || `${r.title} ${r.subject} ${r.type} ${r.description||""}`.toLowerCase().includes(q)) &&
    (s === "All Subjects" || r.subject === s) &&
    (t === "All Types" || r.type === t)
  );
  resultCount.textContent = `${filtered.length} material${filtered.length === 1 ? "" : "s"}`;
  grid.innerHTML = filtered.map(r => `
    <article class="resource-card">
      <span class="badge">${escapeHtml(r.type)}</span>
      <h3>${escapeHtml(r.title)}</h3>
      <p>${escapeHtml(r.description || "Educational material for Class 10.")}</p>
      <div class="meta"><span>${escapeHtml(r.subject)}</span><span>${new Date(r.created_at).toLocaleDateString()}</span></div>
      <button class="view-btn" onclick="window.open('${encodeURI(r.file_url)}','_blank')">Open / Download PDF →</button>
    </article>`).join("");
  emptyState.classList.toggle("hidden", filtered.length > 0);
}

function escapeHtml(value="") {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function loadResources() {
  topLoader.classList.remove("done");
  topLoader.classList.add("loading");

  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .order("created_at", {ascending:false});

  if (error) {
    grid.innerHTML = `<div class="panel">Could not load materials. Check your Supabase setup.</div>`;
  } else {
    resources = data || [];
    renderResources();
  }

  topLoader.classList.remove("loading");
  topLoader.classList.add("done");
}


[searchInput, subjectFilter, typeFilter].forEach(x => x.addEventListener("input", renderResources));

document.querySelectorAll(".subject-card").forEach(card => card.addEventListener("click", () => {
  subjectFilter.value = card.dataset.subject;
  document.getElementById("resources").scrollIntoView({behavior:"smooth"});
  renderResources();
}));

document.getElementById("menuBtn").addEventListener("click", () => {
  const n = document.getElementById("mainNav");
  n.style.display = n.style.display === "flex" ? "" : "flex";
});

async function updateAdminUI() {
  const { data: { session } } = await supabase.auth.getSession();
  document.getElementById("loginPanel").classList.toggle("hidden", !!session);
  document.getElementById("adminPanel").classList.toggle("hidden", !session);
  if (session) document.getElementById("adminEmail").textContent = session.user.email;
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const msg = document.getElementById("loginMsg");
  msg.textContent = "Signing in...";
  const { error } = await supabase.auth.signInWithPassword({
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value
  });
  msg.textContent = error ? error.message : "Signed in.";
  if (!error) updateAdminUI();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  updateAdminUI();

});
    document.getElementById("uploadForm").addEventListener("submit", async e => {
  e.preventDefault();

  const msg = document.getElementById("uploadMsg");
  const btn = document.getElementById("uploadBtn");
  const contentType = document.getElementById("contentType").value;
  const file = document.getElementById("file").files[0];
  const content = document.getElementById("content").value.trim();

  if (contentType === "pdf" || contentType === "image") {
    if (!file || (contentType === "pdf" && file.type !== "application/pdf") || (contentType === "image" && !file.type.startsWith("image/"))) {
      msg.textContent = "Please choose a PDF file.";
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      msg.textContent = "Maximum PDF size is 25 MB.";
      return;
    }
  }

  if (contentType === "text" && !content) {
    msg.textContent = "Please write some material.";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Publishing...";

  let fileUrl = null;
  let storagePath = null;

  if (contentType === "pdf" || contentType === "image") {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    storagePath = `${crypto.randomUUID()}-${safeName}`;

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (upload.error) {
      msg.textContent = upload.error.message;
      btn.disabled = false;
      return;
    }

    const { data: publicData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    fileUrl = publicData.publicUrl;
  }

  const row = {
    title: document.getElementById("title").value.trim(),
    subject: document.getElementById("subject").value,
    type: document.getElementById("type").value,
    description: document.getElementById("description").value.trim(),
    content: contentType === "text" ? content : null,
     file_url: fileUrl,
    storage_path: storagePath
  };

 const { data: { session }, error: sessionError } =
  await supabase.auth.getSession();

if (sessionError || !session) {
  msg.textContent = "Admin session missing. Please sign in again.";
  btn.disabled = false;
  return;
}

console.log("Authenticated user:", session.user.id);
console.log("JWT role:", session.user.role);

const insert = await supabase.from("materials").insert(row); 

  if (insert.error) {
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }

    msg.textContent = insert.error.message + " | JWT role: " + session.user.role;
    btn.disabled = false;
    return;
  }

  msg.textContent = "Published successfully!";
  e.target.reset();
  btn.disabled = false;
  await loadResources();
});

supabase.auth.onAuthStateChange(() => updateAdminUI());
document.getElementById("year").textContent = new Date().getFullYear();
loadResources();
updateAdminUI();
});
