// Tevalovalo Bingo Caller — v6 (Server-verified licensing: Netlify Functions + Blobs)
// Clean working script.js with unlock fix and robust wiring

// ---------- DOM Refs ----------
const gate = document.getElementById('licenseGate');
const codeInput = document.getElementById('codeInput');
const verifyBtn = document.getElementById('verifyBtn');
const helpBtn = document.getElementById('helpBtn');
const gateMsg = document.getElementById('gateMsg');

const grid = document.getElementById('grid');
const currentEl = document.getElementById('currentCall');
const lastFiveEl = document.getElementById('lastFive');
const historyEl = document.getElementById('history');

const startBtn = document.getElementById('startBtn');
const nextBtn  = document.getElementById('nextBtn');
const undoBtn  = document.getElementById('undoBtn');
const resetBtn = document.getElementById('resetBtn');
const fsBtn    = document.getElementById('fsBtn');
const lockBtn  = document.getElementById('lockBtn');
const unlockBtn = document.getElementById('unlockBtn');
const lockOverlay = document.getElementById('lockOverlay');

const speakToggle = document.getElementById('speakToggle');
const soundToggle = document.getElementById('soundToggle');
const autoSeconds = document.getElementById('autoSeconds');
const autoToggle  = document.getElementById('autoToggle');

const themeSelect = document.getElementById('themeSelect');
const downloadPngBtn = document.getElementById('downloadPngBtn');

const ding = document.getElementById('ding');
const exportCanvas = document.getElementById('exportCanvas');
const ctx = exportCanvas.getContext('2d');

// ---------- State ----------
let pool = [];
let called = [];
let autoTimer = null;
let isLocked = false;
let pinCode = "";

const THEME_CLASSES = ['theme-classic','theme-neon','theme-pastel','theme-contrast','theme-ocean'];
const THEME_COLORS = {
  'theme-classic': {bg:'#0f172a', card:'#0b1220', ink:'#e2e8f0', ok:'#22c55e', okInk:'#052e10', outline:'#1e293b', title:'Tevalovalo Bingo Caller — Board Witness'},
  'theme-neon':    {bg:'#0a0a0f', card:'#0b0b19', ink:'#e7e7ff', ok:'#22d3ee', okInk:'#03141a', outline:'#2a2a4a', title:'Tevalovalo Bingo Caller — Neon Board'},
  'theme-pastel':  {bg:'#faf7ff', card:'#ffffff', ink:'#1f2937', ok:'#86efac', okInk:'#0b3d1a', outline:'#e5e7eb', title:'Tevalovalo Bingo Caller — Pastel Board'},
  'theme-contrast':{bg:'#ffffff', card:'#ffffff', ink:'#111827', ok:'#111827', okInk:'#ffffff', outline:'#111827', title:'Tevalovalo Bingo Caller — High Contrast Board'},
  'theme-ocean':   {bg:'#042f2e', card:'#074952', ink:'#e6fffb', ok:'#34d399', okInk:'#052e1a', outline:'#065f5b', title:'Tevalovalo Bingo Caller — Ocean Board'},
};

// ---------- Licensing helpers ----------
function getDeviceId(){
  let id = localStorage.getItem('bingo_device_id');
  if (!id){
    id = crypto.getRandomValues(new Uint32Array(4)).join('-');
    localStorage.setItem('bingo_device_id', id);
  }
  return id;
}
function hasLicense(){ return localStorage.getItem('bingo_license_ok') === 'yes'; }
function grantLicense(){ localStorage.setItem('bingo_license_ok','yes'); }

async function callLicenseAPI(payload){
  const res = await fetch('/.netlify/functions/license', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Network error');
  return await res.json();
}

async function verifyLicense(){
  gateMsg.textContent = '';
  const code = codeInput.value.trim().toUpperCase();
  if(!code){ gateMsg.textContent = 'Enter your access code.'; return; }
  const deviceId = getDeviceId();
  verifyBtn.disabled = true;
  try{
    const out = await callLicenseAPI({ action:'activate', code, deviceId });
    if(out.ok){
      grantLicense();
      // ensure the board is usable right away
      isLocked = false;
      lockOverlay.hidden = true;
      gate.style.display = 'none';
    } else {
      gateMsg.textContent = out.reason === 'already_used' ? 'Code already used on a different device.' : 'Invalid code.';
    }
  } catch(e){
    gateMsg.textContent = 'Server error. Try again.';
  } finally {
    verifyBtn.disabled = false;
  }
}

helpBtn.addEventListener('click', ()=>{
  alert('Enter the access code you received after purchase. It unlocks this device only.');
});
verifyBtn.addEventListener('click', verifyLicense);
codeInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') verifyLicense(); });

if(!hasLicense()){
  gate.style.display = 'flex';
} else {
  gate.style.display = 'none';
  // If already licensed, make sure we are not locked
  isLocked = false;
  lockOverlay.hidden = true;
}

// ---------- App logic ----------
function applyTheme(cls){
  const body = document.body;
  THEME_CLASSES.forEach(c=>body.classList.remove(c));
  body.classList.add(cls);
}
function pickRandomTheme(){ return THEME_CLASSES[Math.floor(Math.random()*THEME_CLASSES.length)]; }

function renderGrid(){
  grid.innerHTML='';
  for(let n=1;n<=90;n++){
    const b=document.createElement('div');
    b.className='cell'+(called.includes(n)?' called':'');
    b.textContent=n;
    grid.appendChild(b);
  }
}

function speakNumber(n){
  try{
    if(!speakToggle.checked) return;
    const msg=new SpeechSynthesisUtterance(String(n));
    msg.rate=.95; msg.pitch=1;
    speechSynthesis.cancel();
    speechSynthesis.speak(msg);
  }catch{}
}

function playSound(){ if(!soundToggle.checked) return; ding.currentTime=0; ding.play().catch(()=>{}); }

function updateUI(){
  currentEl.textContent = called.length ? called[called.length-1] : '—';
  const last5 = called.slice(-5);
  lastFiveEl.textContent = 'Last 5: ' + (last5.length ? last5.join(', ') : '—');
  historyEl.innerHTML = '';
  called.forEach(n => { const tag=document.createElement('span'); tag.className='tag'; tag.textContent=n; historyEl.appendChild(tag); });

  nextBtn.disabled = pool.length === 0 || isLocked;
  undoBtn.disabled = called.length === 0 || isLocked;
  resetBtn.disabled = (called.length === 0 && pool.length === 0) || isLocked;
  autoToggle.disabled = (pool.length === 0 && autoTimer === null) || isLocked;
  themeSelect.disabled = isLocked;
  startBtn.disabled = isLocked && pool.length>0;
  lockBtn.textContent = isLocked ? 'Locked' : 'Lock';
}

function startGame(){
  // always start unlocked
  isLocked = false;
  lockOverlay.hidden = true;

  const val = themeSelect.value;
  const chosen = (val === 'random') ? pickRandomTheme() : val;
  applyTheme(chosen);
  pool = Array.from({length:90}, (_,i)=>i+1);
  called = [];
  shuffle(pool);
  renderGrid();
  updateUI();
  nextBtn.disabled = false;
  resetBtn.disabled = false;
}

function nextCall(){
  if(pool.length===0 || isLocked) return;
  const n=pool.pop();
  called.push(n);
  renderGrid();
  playSound();
  speakNumber(n);
  updateUI();
}

function undoLast(){
  if(!called.length || isLocked) return;
  const n=called.pop();
  pool.push(n);
  renderGrid();
  updateUI();
}

function resetAll(){
  if(isLocked) return;
  stopAuto();
  pool=[]; called=[];
  renderGrid();
  updateUI();
  currentEl.textContent='—';
  lastFiveEl.textContent='Last 5: —';
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

function toggleAuto(){
  if(autoTimer){ stopAuto(); return; }
  if(isLocked) return;
  const s=Math.max(2, Math.min(60, parseInt(autoSeconds.value||'6',10)));
  autoSeconds.value=s;
  autoTimer=setInterval(()=>{
    if(pool.length===0||isLocked){ stopAuto(); return; }
    nextCall();
  }, s*1000);
  updateUI();
}

function stopAuto(){
  if(autoTimer){ clearInterval(autoTimer); autoTimer=null; updateUI(); }
}

function lockBoard(){
  let p=prompt('Set a 4-digit PIN to unlock (optional). Leave blank for no PIN:');
  if(p===null) return;
  p=(p||'').trim();
  if(p && !/^\d{4}$/.test(p)){ alert('PIN must be 4 digits.'); return; }
  pinCode=p;
  isLocked=true;
  stopAuto();
  lockOverlay.hidden=false;
  updateUI();
}

function unlockBoard(){
  if(!isLocked) return;
  if(pinCode){
    const entry=prompt('Enter PIN:');
    if(entry!==pinCode){ alert('Incorrect PIN.'); return; }
  }
  isLocked=false;
  lockOverlay.hidden=true;
  updateUI();
}

// ---------- PNG Export ----------
function getCurrentThemeClass(){ return THEME_CLASSES.find(cls=>document.body.classList.contains(cls))||'theme-classic'; }
function hexToRgb(hex){ const m=hex.replace('#',''); const b=parseInt(m,16); if(m.length===6){ return [(b>>16)&255,(b>>8)&255,b&255]; } return [0,0,0]; }
function mix(a,b,t){ const A=hexToRgb(a), B=hexToRgb(b); const r=Math.round(A[0]*(1-t)+B[0]*t), g=Math.round(A[1]*(1-t)+B[1]*t), bl=Math.round(A[2]*(1-t)+B[2]*t); return `rgb(${r},${g},${bl})`; }
function roundRect(ctx,x,y,w,h,r,fill,stroke){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.stroke(); }
function wrapText(ctx, text, x, y, maxWidth, lineHeight){ const words=text.split(' '); let line=''; for(let n=0;n<words.length;n++){ const testLine=line+words[n]+' '; const metrics=ctx.measureText(testLine); if(metrics.width>maxWidth && n>0){ ctx.fillText(line, x, y); line=words[n]+' '; y+=lineHeight; } else { line=testLine; } } ctx.fillText(line, x, y); }

function downloadBoardPNG(){
  const theme=getCurrentThemeClass();
  const colors=THEME_COLORS[theme]||THEME_COLORS['theme-classic'];
  const W=exportCanvas.width, H=exportCanvas.height;

  ctx.fillStyle=colors.bg; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=colors.ink; ctx.font='bold 36px system-ui, Segoe UI, Roboto'; ctx.fillText(colors.title, 40, 60);
  const ts=new Date().toLocaleString(); ctx.font='16px system-ui, Segoe UI, Roboto'; ctx.fillStyle=mix(colors.ink, colors.bg, .4); ctx.fillText('Generated: '+ts, 40, 90);
  const last5=called.slice(-5); ctx.fillStyle=colors.ink; ctx.font='20px system-ui, Segoe UI, Roboto'; ctx.fillText('Last 5: ' + (last5.length?last5.join(', '):'—'), 40, 120);

  const gx=40, gy=150, cols=10, rows=9, cellW=120, cellH=80; const radius=(theme==='theme-neon')?40:(theme==='theme-contrast'?8:16); const stroke=colors.outline;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const n=r*10+c+1; const x=gx+c*cellW, y=gy+r*cellH; const isCalled=called.includes(n);
      roundRect(ctx,x,y,cellW-8,cellH-8,radius,isCalled?colors.ok:colors.card, stroke);
      ctx.font='bold 28px system-ui, Segoe UI, Roboto'; ctx.fillStyle=isCalled?colors.okInk:colors.ink; const text=String(n); const tw=ctx.measureText(text).width;
      ctx.fillText(text, x+(cellW-8)/2 - tw/2, y+(cellH-8)/2 + 10);
    }
  }

  ctx.fillStyle = mix(colors.ink, colors.bg, .4); ctx.font='16px system-ui, Segoe UI, Roboto';
  const list='Called: ' + (called.length?called.join(', '):'—'); wrapText(ctx, list, 40, gy+rows*cellH + 30, W-80, 22);

  const url=exportCanvas.toDataURL('image/png');
  const a=document.createElement('a'); a.href=url; a.download='bingo-board.png'; a.click();
  setTimeout(()=>URL.revokeObjectURL?.(url),500);
}

// ---------- Wire up ----------
startBtn.addEventListener('click', startGame);
nextBtn.addEventListener('click', nextCall);
undoBtn.addEventListener('click', undoLast);
resetBtn.addEventListener('click', resetAll);
autoToggle.addEventListener('click', ()=>{ if(autoTimer){ stopAuto(); } else { toggleAuto(); } });
fsBtn.addEventListener('click', ()=>{ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
lockBtn.addEventListener('click', lockBoard);
unlockBtn.addEventListener('click', unlockBoard);
downloadPngBtn.addEventListener('click', downloadBoardPNG);

// init
renderGrid();
updateUI();

