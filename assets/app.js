const API = window.STREAM_CONFIG?.API_URL || "";
const $ = s => document.querySelector(s);
const grid = $("#videoGrid"), statusEl=$("#status");
$("#year").textContent = new Date().getFullYear();
function apiRequest(data) {
  return new Promise((resolve,reject)=>{
    if(!API || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API)) return reject(new Error("Set a valid Apps Script API_URL in assets/config.js."));
    const iframe=document.createElement("iframe"), form=document.createElement("form"), nonce=crypto.randomUUID();
    iframe.name="api_"+nonce; iframe.hidden=true; form.method="POST"; form.action=API; form.target=iframe.name; form.hidden=true;
    const input=document.createElement("input"); input.name="payload"; input.value=JSON.stringify({...data,nonce}); form.appendChild(input);
    const timer=setTimeout(()=>finish(new Error("The server did not respond. Check your Apps Script deployment.")),25000);
    function finish(err,value){clearTimeout(timer);window.removeEventListener("message",onMessage);form.remove();iframe.remove();err?reject(err):resolve(value);}
    function onMessage(event){if(!event.data||typeof event.data!=="object"||event.data.nonce!==nonce)return;const r=event.data.result;if(!r||r.ok!==true)finish(new Error(r?.error||"Request failed."));else finish(null,r);}
    window.addEventListener("message",onMessage);document.body.append(iframe,form);form.submit();
  });
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
let videos=[];
function render(items){
  grid.innerHTML="";
  if(!items.length){grid.innerHTML='<div class="empty-state"><div style="font-size:28px;margin-bottom:10px">✦</div><strong>No videos found</strong><p>Try another search, or check back soon.</p></div>';return;}
  items.forEach(v=>{
    const card=document.createElement("article");card.className="video-card";card.tabIndex=0;card.setAttribute("role","button");card.setAttribute("aria-label","Play "+v.title);
    card.innerHTML=`<div class="thumb-wrap"><img loading="lazy" src="${escapeHtml(v.thumbnail)}" alt="${escapeHtml(v.title)}"><div class="thumb-overlay"><span class="thumb-play">▶</span></div></div><div class="video-meta"><h3>${escapeHtml(v.title)}</h3><p>${escapeHtml(v.description||"Ready to watch. Press play to start streaming.")}</p></div>`;
    const play=()=>openPlayer(v);card.addEventListener("click",play);card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();play();}});grid.appendChild(card);
  });
}
function openPlayer(v){const frame=$("#playerFrame");frame.innerHTML="";const iframe=document.createElement("iframe");iframe.src=v.embedUrl;iframe.title=v.title;iframe.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";iframe.allowFullscreen=true;iframe.referrerPolicy="strict-origin-when-cross-origin";frame.appendChild(iframe);$("#playerTitle").textContent=v.title;$("#playerDescription").textContent=v.description||"";$("#playerModal").classList.add("open");$("#playerModal").setAttribute("aria-hidden","false");document.body.style.overflow="hidden";}
function closePlayer(){const modal=$("#playerModal");modal.classList.remove("open");modal.setAttribute("aria-hidden","true");$("#playerFrame").innerHTML="";document.body.style.overflow="";}
document.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click",closePlayer));document.addEventListener("keydown",e=>{if(e.key==="Escape")closePlayer();});
function filter(){const q=$("#searchInput").value.trim().toLowerCase();render(videos.filter(v=>(v.title+" "+v.description).toLowerCase().includes(q)));}
$("#searchInput").addEventListener("input",filter);$("#searchFocus").addEventListener("click",()=>{$("#searchInput").focus();$("#library").scrollIntoView({behavior:"smooth"});});
(async()=>{try{const r=await apiRequest({action:"publicList"});videos=r.videos||[];statusEl.textContent=videos.length?`${videos.length} ${videos.length===1?"video":"videos"} available`:"The library is ready for its first video.";render(videos);}catch(e){statusEl.textContent=e.message;grid.innerHTML='<div class="empty-state">Unable to load the video library. Please try again later.</div>';}})();

// Responsive search and category controls
const searchBox = document.querySelector(".yt-search");
const searchToggle = document.querySelector("#searchFocus");
const menuToggle = document.querySelector("#menuToggle");
if (searchToggle && searchBox) searchToggle.addEventListener("click", () => {
  searchBox.classList.toggle("search-open");
  document.querySelector("#searchInput").focus();
});
if (menuToggle) menuToggle.addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("sidebar-open"));
document.querySelectorAll(".category-chip").forEach(chip => chip.addEventListener("click", () => {
  document.querySelectorAll(".category-chip").forEach(x => x.classList.remove("active"));
  chip.classList.add("active");
  const q = document.querySelector("#searchInput").value.trim().toLowerCase();
  let list = videos.filter(v => (v.title+" "+v.description).toLowerCase().includes(q));
  if (chip.dataset.filter === "latest") list = [...list].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  render(list);
}));
