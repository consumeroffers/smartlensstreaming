const API=window.STREAM_CONFIG?.API_URL||"";
const $=s=>document.querySelector(s);
const TOKEN_KEY="sls_admin_session";
let token=sessionStorage.getItem(TOKEN_KEY)||"", videos=[];
function makeNonce(){
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function apiRequest(data){return new Promise((resolve,reject)=>{
  if(!API || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(API.trim()))
    return reject(new Error("Google Apps Script API URL is missing or invalid. Open assets/config.js and paste the deployed Web App /exec URL."));
  const iframe=document.createElement("iframe"),form=document.createElement("form"),nonce=makeNonce();
  iframe.name="api_"+nonce;iframe.title="API response";iframe.style.display="none";
  form.method="POST";form.action=API.trim();form.target=iframe.name;form.style.display="none";
  const input=document.createElement("input");input.type="hidden";input.name="payload";
  input.value=JSON.stringify({...data,token,nonce});form.appendChild(input);
  let settled=false;
  const timer=setTimeout(()=>finish(new Error("Google Apps Script did not return a response. Most commonly the Web App is still deployed with an older Code.gs version, or the deployment is not accessible to Anyone. Deploy a NEW VERSION after updating backend/Code.gs, then try again.")),25000);
  function finish(err,val){
    if(settled)return;settled=true;clearTimeout(timer);
    window.removeEventListener("message",onMessage);
    form.remove();iframe.remove();
    err?reject(err):resolve(val);
  }
  // Apps Script HtmlService may wrap its returned HTML in a sandboxed frame.
  // Match the one-time nonce instead of requiring event.source to be the outer iframe.
  function onMessage(e){
    const msg=e.data;
    if(!msg || typeof msg!=="object" || msg.nonce!==nonce)return;
    const r=msg.result;
    if(!r || r.ok!==true)finish(new Error(r?.error || "Login request failed."));
    else finish(null,r);
  }
  window.addEventListener("message",onMessage);
  iframe.addEventListener("error",()=>finish(new Error("The hidden API frame could not load. Check the Apps Script Web App deployment URL and access setting.")));
  document.body.append(iframe,form);
  try{form.submit();}catch(err){finish(new Error("Could not send API request: "+err.message));}
});}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(s){const el=$("#toast");el.textContent=s;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800);}
function showLogin(){ $("#loginPanel").hidden=false;$("#dashboard").hidden=true;}
function showDashboard(){ $("#loginPanel").hidden=true;$("#dashboard").hidden=false;}
async function loadVideos(){const r=await apiRequest({action:"adminList"});videos=r.videos||[];$("#totalCount").textContent=videos.length;$("#publishedCount").textContent=videos.filter(v=>v.published).length;$("#draftCount").textContent=videos.filter(v=>!v.published).length;renderList();}
function renderList(){const root=$("#adminVideoList");root.innerHTML="";if(!videos.length){root.innerHTML='<div class="empty-state">No videos yet. Add your first video using the form.</div>';return;}
videos.forEach(v=>{const row=document.createElement("div");row.className="admin-video-row";row.innerHTML=`<img src="${esc(v.thumbnail)}" alt=""><div><h3>${esc(v.title)}</h3><p><span class="status-pill ${v.published?"":"draft"}">${v.published?"PUBLISHED":"UNPUBLISHED"}</span></p></div><div class="row-actions"><button class="tiny-btn" data-edit="${esc(v.id)}">Edit</button><button class="tiny-btn" data-pub="${esc(v.id)}" data-state="${!v.published}">${v.published?"Unpublish":"Publish"}</button><button class="tiny-btn danger" data-del="${esc(v.id)}">Delete</button></div>`;root.appendChild(row);});
root.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editVideo(videos.find(v=>v.id===b.dataset.edit)));
root.querySelectorAll("[data-pub]").forEach(b=>b.onclick=()=>togglePublish(b.dataset.pub,b.dataset.state==="true"));
root.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>deleteVideo(b.dataset.del));
}
function editVideo(v){if(!v)return;$("#videoId").value=v.id;$("#title").value=v.title;$("#thumbnail").value=v.thumbnail;$("#embedCode").value=`<iframe src="${v.embedUrl}" allowfullscreen></iframe>`;$("#description").value=v.description;$("#published").checked=v.published;$("#formHeading").textContent="Edit video";$("#saveBtn").innerHTML="Update video <span>→</span>";$("#cancelEdit").hidden=false;$("#videoForm").scrollIntoView({behavior:"smooth",block:"start"});}
function resetForm(){$("#videoForm").reset();$("#videoId").value="";$("#published").checked=true;$("#formHeading").textContent="Add a video";$("#saveBtn").innerHTML="Save video <span>→</span>";$("#cancelEdit").hidden=true;$("#formMessage").textContent="";}
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=$("#loginForm").querySelector('button[type="submit"]');
  $("#loginError").textContent="";
  btn.disabled=true;btn.textContent="Signing in…";
  try{
    const r=await apiRequest({action:"login",username:$("#username").value.trim(),password:$("#password").value});
    if(!r.token)throw new Error("Server response did not include a login token. Check the Apps Script deployment version.");
    token=r.token;sessionStorage.setItem(TOKEN_KEY,token);
    $("#password").value="";
    await loadVideos();
    showDashboard();
    toast("Login successful");
  }catch(err){
    token="";sessionStorage.removeItem(TOKEN_KEY);
    $("#loginError").textContent=err && err.message ? err.message : "Login failed. Check API URL and credentials.";
  }finally{
    btn.disabled=false;btn.innerHTML='Sign in securely <span>→</span>';
  }
});
$("#logoutBtn").onclick=()=>{token="";sessionStorage.removeItem(TOKEN_KEY);showLogin();};
$("#refreshBtn").onclick=()=>loadVideos().then(()=>toast("Library refreshed")).catch(e=>toast(e.message));
$("#cancelEdit").onclick=resetForm;
$("#videoForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("#videoId").value;const video={id,title:$("#title").value,thumbnail:$("#thumbnail").value,embedCode:$("#embedCode").value,description:$("#description").value,published:$("#published").checked};const btn=$("#saveBtn");btn.disabled=true;btn.textContent="Saving…";try{await apiRequest({action:id?"update":"create",video});resetForm();await loadVideos();toast(id?"Video updated successfully":"Video added successfully");}catch(err){$("#formMessage").textContent=err.message;}finally{btn.disabled=false;btn.innerHTML=id?"Update video <span>→</span>":"Save video <span>→</span>";}});
async function togglePublish(id,published){try{await apiRequest({action:"setPublished",id,published});await loadVideos();toast(published?"Video published":"Video unpublished");}catch(e){toast(e.message);}}
async function deleteVideo(id){const v=videos.find(x=>x.id===id);if(!v||!confirm(`Permanently delete "${v.title}"?`))return;try{await apiRequest({action:"delete",id});await loadVideos();toast("Video deleted");}catch(e){toast(e.message);}}
if(token){loadVideos().then(showDashboard).catch(()=>{token="";sessionStorage.removeItem(TOKEN_KEY);showLogin();});}else showLogin();
