"use strict";
const $=s=>document.querySelector(s);
const TIP={"Figur eingestellt":"Blunder-Check vor jedem Zug: Ist die gezogene Figur danach angegriffen und ungedeckt? Hängt sonst etwas?",
 "Schlagchance verpasst":"Zuerst Schachs, Schlagzüge, Drohungen prüfen – kann ich Material gratis gewinnen?",
 "Matt übersehen":"Vor jedem Zug alle Schachgebote durchgehen – eines kann matt sein.",
 "Matt zugelassen":"Nach jedem Gegnerzug fragen: Was droht er? Grundreihe und f2/f7 im Blick behalten.",
 "Positionsfehler":"Nicht den ersten Zug spielen: 2–3 Kandidaten vergleichen und den Gegnerplan prüfen.",
 "Zeitnot":"Zeit einteilen: In ruhigen Stellungen schneller, bei Schlagabtausch und Taktik Zeit investieren.",
 "Dame zu früh":"Erst Springer und Läufer entwickeln, Dame frühestens ab Zug 6–8.",
 "Figur doppelt gezogen":"In der Eröffnung jede Figur einmal ziehen, Zentrum besetzen, rochieren.",
 "Nicht rochiert":"Bis ca. Zug 10 rochieren – König in Sicherheit, Turm ins Spiel."};
const PCH={k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
const LV={1:{skill:0,depth:3},2:{skill:4,depth:6},3:{skill:9,depth:8},4:{skill:15,depth:10},5:{skill:20,depth:12}};
const ymd=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>ymd(new Date());const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEY="schachcoach2";
const DEEP=18; // Tiefe für die Nachrechnung von Fehlern und Patzern
function load(){try{const r=localStorage.getItem(KEY);if(r)return Object.assign(def(),JSON.parse(r))}catch(e){}return def()}
function def(){return{user:"",per:5,depth:12,lastSync:0,games:[],queue:[],cards:[],days:{},level:3,seen:{}}}
const S=load();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){if(S.games.length>50){S.games.splice(0,20);save()}}}
function day(){const t=today();return S.days[t]||(S.days[t]={g:0,r:0,rev:0})}
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});

// ---------- Stockfish ----------
class Engine{constructor(){this.q=[];this.cur=null;this.last={};this.ok=false;
 try{this.w=new Worker("engine/stockfish-19-lite-single.js");this.w.onmessage=e=>this.line(String(e.data));this.w.onerror=()=>banner("Stockfish konnte nicht starten.");
  this.ready=new Promise(r=>this._r=r);["uci","setoption name Hash value 16","isready"].forEach(s=>this.w.postMessage(s))}catch(e){banner("Stockfish konnte nicht starten.")}}
 line(l){if(l==="readyok"&&this._r){this._r();this._r=null;this.ok=true;return}const c=this.cur;if(!c)return;
  if(l.startsWith("info")&&l.includes(" score ")){const m=l.match(/score (cp|mate) (-?\d+)/);if(m){const pv=l.match(/ pv (.+)$/);this.last=m[1]==="cp"?{cp:+m[2],mate:null}:{cp:0,mate:+m[2]};if(pv)this.last.pv=pv[1].trim().split(/\s+/)}}
  else if(l.startsWith("bestmove")){const r=Object.assign({},this.last,{best:l.split(" ")[1]});this.cur=null;c.res(r);this.next()}}
 eval(fen,o={}){return new Promise(res=>{const j={fen,o,res};o.prio?this.q.unshift(j):this.q.push(j);if(!this.cur)this.next()})}
 async next(){const j=this.q.shift();if(!j)return;this.cur=j;this.last={cp:0,mate:null};await this.ready;
  this.w.postMessage("setoption name Skill Level value "+(j.o.skill??20));this.w.postMessage("position fen "+j.fen);this.w.postMessage("go depth "+(j.o.depth||12))}}
const E=new Engine();

// ---------- Brett ----------
function drawBoard(id,g,orient,o){const el=$("#"+id);el.innerHTML="";const F="abcdefgh";let kchk=null;
 if(g.in_check())for(let r=1;r<=8;r++)for(const f of F){const p=g.get(f+r);if(p&&p.type==="k"&&p.color===g.turn())kchk=f+r}
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const sq=orient==="w"?F[c]+(8-r):F[7-c]+(r+1);const d=document.createElement("div");
  d.className="sq "+((F.indexOf(sq[0])+ +sq[1])%2?"l":"d");
  if(o.last&&(o.last.from===sq||o.last.to===sq))d.classList.add("last");if(o.sel===sq)d.classList.add("sel");if(kchk===sq)d.classList.add("chk");
  const p=g.get(sq);if(o.tg&&o.tg.includes(sq)){d.classList.add("tgt");if(p)d.classList.add("cap")}
  if(p){const s=document.createElement("span");s.className="pc "+p.color;s.textContent=PCH[p.type]+"\uFE0E";d.appendChild(s)}
  if(c===0){const e=document.createElement("span");e.className="coord r";e.textContent=sq[1];d.appendChild(e)}
  if(r===7){const e=document.createElement("span");e.className="coord f";e.textContent=sq[0];d.appendChild(e)}
  if(o.onClick)d.onclick=()=>o.onClick(sq);el.appendChild(d)}
 drawArrows(id.replace("board","arrows"),orient,o.arrows||[])}
function sqXY(sq,orient){const f="abcdefgh".indexOf(sq[0]),r=+sq[1];return orient==="w"?[f+.5,8-r+.5]:[7-f+.5,r-.5]}
function drawArrows(id,orient,arr){const svg=$("#"+id);if(!svg)return;svg.innerHTML=arr.map(a=>{const[x1,y1]=sqXY(a.from,orient),[x2,y2]=sqXY(a.to,orient);
 const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,ex=x2-ux*.32,ey=y2-uy*.32;
 return `<g opacity=".85"><line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${a.c}" stroke-width=".17" stroke-linecap="round"/><polygon points="${x2},${y2} ${ex-uy*.28},${ey+ux*.28} ${ex+uy*.28},${ey-ux*.28}" fill="${a.c}"/></g>`}).join("")}
const GREEN="#5f9a6b",GREY="#9a8a7f",RED="#cf6f68";
function pickMove(g,from,to){return g.moves({square:from,verbose:true}).find(x=>x.to===to&&(!x.promotion||x.promotion==="q"))}
function uciArrow(uci,c){return uci&&uci.length>=4?{from:uci.slice(0,2),to:uci.slice(2,4),c}:null}

// ---------- UI-Rahmen ----------
function banner(t){const b=$("#banner");b.textContent=t||"";b.classList.toggle("on",!!t)}
let VIEW="today";
function show(v){VIEW=v;document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
 document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="v-"+v));
 if(v==="today")renderDash();if(v==="review")renderReview();if(v==="puz"&&(!Z.c||Z.done))nextCard();if(v==="set")renderSet();if(v==="play")renderPlay()}
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>show(b.dataset.v));
function syncLabel(){const t=S.lastSync?new Date(S.lastSync):null;$("#sync").textContent=S.user?(S.user+(t?" · Sync "+t.toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"}):"")):"Kein Chess.com-Konto"}

// ---------- Chess.com ----------
async function getJSON(url){let last="";for(let i=0;i<4;i++){try{const r=await fetch(url,{cache:"no-store"});
  if(r.status===404)throw Object.assign(new Error("Benutzer nicht gefunden"),{fatal:true});
  if(r.ok)return await r.json();last="HTTP "+r.status;await sleep(r.status===429?4000*(i+1):1500*(i+1))}
 catch(e){if(e.fatal)throw e;last=e.message;await sleep(1500*(i+1))}}throw new Error("Chess.com nicht erreichbar ("+last+")")}
let syncing=false;
async function sync(force){if(!S.user||syncing||!navigator.onLine)return;if(!force&&Date.now()-S.lastSync<30*60e3)return;syncing=true;banner("Synchronisiere mit Chess.com …");
 try{const u=encodeURIComponent(S.user.toLowerCase());const arch=(await getJSON(`https://api.chess.com/pub/player/${u}/games/archives`)).archives||[];
  const known=new Set([...S.games.map(g=>g.id),...S.queue.map(q=>q.id)]);const fresh=[];
  for(let i=arch.length-1;i>=0&&i>=arch.length-3&&fresh.length<S.per;i--){const d=await getJSON(arch[i]);
   const gs=(d.games||[]).filter(g=>g.rules==="chess"&&g.pgn&&!known.has(g.url)).sort((a,b)=>b.end_time-a.end_time);
   for(const g of gs){if(fresh.length>=S.per)break;const me=g.white.username.toLowerCase()===S.user.toLowerCase()?"w":"b";
    fresh.push({id:g.url,src:"chesscom",pgn:g.pgn,me,end:g.end_time,tcl:g.time_class})}}
  fresh.sort((a,b)=>a.end-b.end);S.queue.push(...fresh);S.lastSync=Date.now();save();syncLabel();
  banner(fresh.length?fresh.length+" neue Partie(n) – Analyse startet":"");if(!fresh.length)setTimeout(()=>banner(""),100);processQueue()}
 catch(e){banner("Sync fehlgeschlagen: "+e.message)}finally{syncing=false}}

// ---------- Analyse-Warteschlange ----------
let working=false;
async function processQueue(){if(working)return;working=true;
 while(S.queue.length){const q=S.queue[0];const n=S.queue.length;
  try{const r=await analyzeGame(q,E,S.depth,(i,t,ph)=>banner(ph==="deep"?`Rechne Fehler tiefer nach (${n} in Warteschlange) · ${i+1}/${t}`:`Analysiere Partie (${n} in Warteschlange) · Stellung ${i+1}/${t}`),DEEP);
   const g=Object.assign(r,{id:q.id,src:q.src,tcl:q.tcl||null,end:q.end||Date.now()/1e3,lv:q.lv||null});
   if(!g.date)g.date=today();
   for(const c of r.cards)S.cards.push(Object.assign(c,{id:q.id+"#"+c.ply,gid:q.id,due:addDays(1),ivl:0}));delete g.cards;
   S.games=S.games.filter(x=>x.id!==g.id);S.games.push(g);S.games.sort((a,b)=>a.end-b.end);if(S.games.length>400)S.games.splice(0,S.games.length-400);
   if(S.cards.length>400)S.cards.splice(0,S.cards.length-400);
   if(q.src==="local")day().g++;}
  catch(e){console.warn(e)}
  S.queue.shift();save();if(VIEW==="today")renderDash();if(VIEW==="review")renderReview()}
 banner("");working=false}

// ---------- Heute ----------
function streak(){let n=0;const d=new Date();for(;;){const k=ymd(d),x=S.days[k];if(x&&(x.g||x.r||x.rev))n++;else if(n>0||k!==today())break;d.setDate(d.getDate()-1)}return n}
const dueCards=()=>S.cards.filter(c=>c.due<=today());
function exportText(){const g=S.games,rec=g.slice(-20),w=weaknesses(g),p=phaseAcc(g),o=openingStats(g);
 const W=rec.filter(x=>x.res===1).length,D=rec.filter(x=>x.res===.5).length,L=rec.filter(x=>x.res===0).length,acc=rec.filter(x=>x.acc!=null);
 const elo=[...g].reverse().find(x=>x.src==="chesscom");const myElo=elo?(elo.me==="w"?elo.wElo:elo.bElo):null;
 return `Schach-Coach Export ${today()} (Chess.com: ${S.user||"–"}, Elo ${myElo||"–"})
Letzte ${rec.length} Partien: ${W}S/${D}R/${L}N, Ø Genauigkeit ${acc.length?Math.round(acc.reduce((a,b)=>a+b.acc,0)/acc.length):"–"}%
Phasen: Eröffnung ${p.o??"–"}%, Mittelspiel ${p.m??"–"}%, Endspiel ${p.e??"–"}%
Fehler/Partie: ${w.map(([k,v])=>k+" "+v.toFixed(2)).join("; ")||"–"}
Eröffnungen Weiss: ${o.w.slice(0,4).map(x=>`${x.name} ${x.n}x ${x.score}%`).join("; ")||"–"}
Eröffnungen Schwarz: ${o.b.slice(0,4).map(x=>`${x.name} ${x.n}x ${x.score}%`).join("; ")||"–"}
Letzte Fehler:
`+S.cards.slice(-5).map(c=>`${c.fen} | gespielt ${c.played}, besser ${c.best} (${c.motif})`).join("\n")}
function renderDash(){const d=day(),due=dueCards().length,G=S.games,w=weaknesses(G),p=phaseAcc(G),o=openingStats(G),rec=G.slice(-20).filter(g=>g.acc!=null);
 const newest=G[G.length-1];const revDone=!newest||S.seen[newest.id];
 const plan=[[newest?`Neueste Partie im Review ansehen (${newest.white} – ${newest.black})`:"Chess.com-Konto im Setup eintragen",revDone&&!!newest],
  [due?`${Math.min(due,5)} Puzzles aus eigenen Fehlern`:"Keine Puzzles fällig",due===0],["1 Partie spielen (Chess.com oder hier)",d.g>0||G.some(g=>g.date===today())]];
 const top=w[0];
 const wH=w.length?w.slice(0,6).map(([k,v])=>`<div class="bar"><span>${k}</span><span class="tr"><i style="width:${Math.min(100,v*50)}%"></i></span><span>${v.toFixed(1)}</span></div><div class="tip">${TIP[k]||""}</div>`).join(""):'<p class="muted">Noch keine analysierten Partien.</p>';
 let spark='<p class="muted">Verlauf ab 2 Partien.</p>';
 if(rec.length>=2){const Wd=300,H=90,pts=rec.map((g,i)=>[i*(Wd-10)/(rec.length-1)+5,H-5-(g.acc/100)*(H-10)]);const y70=H-5-.7*(H-10);
  spark=`<svg viewBox="0 0 ${Wd} ${H}" style="width:100%;height:90px" preserveAspectRatio="none"><line x1="0" x2="${Wd}" y1="${y70}" y2="${y70}" stroke="var(--line)" stroke-dasharray="4 4"/><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts.map(q=>q.join(",")).join(" ")}"/>${pts.map((q,i)=>`<circle cx="${q[0]}" cy="${q[1]}" r="3.5" fill="${rec[i].res===1?"var(--good)":rec[i].res===0?"var(--bad)":"var(--warn)"}"/>`).join("")}</svg><p class="muted">Genauigkeit letzte ${rec.length} Partien · gestrichelt 70 %</p>`}
 const ph=[["Eröffnung","o"],["Mittelspiel","m"],["Endspiel","e"]].map(([n,k])=>`<div class="bar"><span>${n}</span><span class="tr"><i style="width:${p[k]??0}%"></i></span><span>${p[k]??"–"}</span></div>`).join("");
 const otab=(arr,lbl)=>arr.length?`<table><tr><th>${lbl}</th><th class="n">Partien</th><th class="n">Punkte</th><th class="n">Genau.</th></tr>${arr.slice(0,6).map(x=>`<tr><td>${x.name}</td><td class="n">${x.n}</td><td class="n" style="color:${x.n>=3&&x.score<40?"var(--bad)":x.n>=3&&x.score>=60?"var(--good)":"inherit"}">${x.score} %</td><td class="n">${x.acc??"–"}</td></tr>`).join("")}</table>`:"";
 $("#dash").innerHTML=`
 <section><h2>Heute</h2><div class="row" style="gap:26px"><div><div class="big">${streak()}</div><div class="muted">Tage in Folge</div></div><div><div class="big">${due}</div><div class="muted">Puzzles fällig</div></div><div><div class="big">${G.length}</div><div class="muted">Partien analysiert</div></div></div>
 <ul class="plan" style="margin-top:12px">${plan.map(([t,ok])=>`<li class="${ok?"done":""}">${t}</li>`).join("")}${top?`<li>Fokus: ${top[0]} – ${TIP[top[0]]||""}</li>`:""}</ul>
 ${S.user?`<div class="row" style="margin-top:10px"><button class="btn" id="dsync">Jetzt synchronisieren</button>${newest?'<button class="btn pri" id="dopen">Neueste Partie öffnen</button>':""}</div>`:'<div class="row" style="margin-top:10px"><button class="btn pri" id="dset">Chess.com verbinden</button></div>'}</section>
 <section><h2>Deine Schwachstellen</h2><p class="muted" style="margin-top:0">Fehler pro Partie, letzte 20 Partien</p>${wH}</section>
 <section><h2>Genauigkeit</h2>${ph}<div style="margin-top:12px">${spark}</div></section>
 <section><h2>Eröffnungen</h2>${otab(o.w,"Mit Weiss")}${o.b.length?'<div style="height:12px"></div>':""}${otab(o.b,"Mit Schwarz")}${!o.w.length&&!o.b.length?'<p class="muted">Erscheint mit Chess.com-Partien.</p>':'<p class="muted">Rot: unter 40 % bei mind. 3 Partien.</p>'}</section>`;
 const ds=$("#dsync");if(ds)ds.onclick=()=>sync(true);const dO=$("#dopen");if(dO)dO.onclick=()=>{R.id=newest.id;R.ply=null;show("review")};const dS=$("#dset");if(dS)dS.onclick=()=>show("set")}

// ---------- Review ----------
let R={id:null,ply:0};
function curGame(){return S.games.find(g=>g.id===R.id)}
function fensOf(g){const b=new Chess(g.start),f=[b.fen()],mv=[];for(const s of g.sans){const m=b.move(s,{sloppy:true});mv.push(m);f.push(b.fen())}return{f,mv}}
let RC=null;
function renderReview(){const list=[...S.games].reverse();
 $("#glist").innerHTML=list.length?list.map(g=>`<button class="gitem ${g.id===R.id?"on":""}" data-id="${encodeURIComponent(g.id)}"><span>${g.white} – ${g.black}</span><span class="res${g.res===1?1:g.res===0?0:""}">${g.res===1?"Sieg":g.res===0?"Niederlage":g.res===.5?"Remis":"–"}</span><span class="muted">${g.date||""} · ${g.opening||(g.src==="local"?"vs. Stockfish":"")}</span><span class="muted">${g.acc??"–"} %</span></button>`).join(""):'<p class="muted">Noch keine Partien. Chess.com im Setup verbinden oder eine Partie spielen.</p>';
 document.querySelectorAll(".gitem").forEach(b=>b.onclick=()=>{R.id=decodeURIComponent(b.dataset.id);R.ply=null;renderReview();window.scrollTo({top:0,behavior:"smooth"})});
 const g=curGame();if(!g){if(list[0]&&R.id===null){R.id=list[0].id;R.ply=null;return renderReview()}drawBoard("rboard",new Chess(),"w",{});return}
 if(!S.seen[g.id]){S.seen[g.id]=1;day().rev++;save()}
 if(!RC||RC.id!==g.id)RC=Object.assign({id:g.id},fensOf(g));
 if(R.ply==null){const i=g.cls.findIndex((c,k)=>c>=2&&RC.mv[k].color===g.me);R.ply=i>=0?i:0}
 R.ply=Math.max(0,Math.min(RC.f.length-1,R.ply));const p=R.ply;const fen=RC.f[p];const nextMv=RC.mv[p];
 const arrows=[];if(nextMv){arrows.push({from:nextMv.from,to:nextMv.to,c:GREY});if(g.best[p]&&g.best[p].slice(0,4)!==nextMv.from+nextMv.to)arrows.push(uciArrow(g.best[p],GREEN))}
 drawBoard("rboard",new Chess(fen),g.me,{last:p>0?{from:RC.mv[p-1].from,to:RC.mv[p-1].to}:null,arrows:arrows.filter(Boolean)});
 $("#rply").textContent=p===RC.f.length-1?"Endstellung":`Vor ${Math.floor(p/2)+1}${p%2?"…":"."} ${nextMv.san}`;
 $("#rtitle").textContent=`${g.white}${g.wElo?" ("+g.wElo+")":""} – ${g.black}${g.bElo?" ("+g.bElo+")":""}`;
 const motTxt=Object.entries(g.mot).map(([k,v])=>k+(v>1?" ×"+v:"")).join(", ")||"keine";
 let info=`Genauigkeit du ${g.acc??"–"} % · Gegner ${g.accOpp??"–"} %. Fehlerbilder: ${motTxt}.`;
 if(nextMv){const c=g.cls[p],mover=nextMv.color;const wb=mover==="w"?g.W[p]:100-g.W[p];
  if(c>0){let bs="";try{const t=new Chess(fen);const bm=t.move({from:g.best[p].slice(0,2),to:g.best[p].slice(2,4),promotion:g.best[p][4]||"q"});bs=bm?bm.san:""}catch(e){}
   info=`${["","Ungenauigkeit","Fehler","Patzer"][c]}: ${nextMv.san} (Gewinnchance ${Math.round(wb)} % → ${Math.round(mover==="w"?g.W[p+1]:100-g.W[p+1])} %). Grün: besser war ${bs}.`;
   if(g.pv&&g.pv[p])info+=`\nBeste Fortsetzung: ${g.pv[p]}`;if(g.pv&&g.pv[p+1])info+=`\nNach ${nextMv.san} folgt: ${g.pv[p+1]}`}
  else info+=` Grau: gespielter Zug${g.best[p]&&g.best[p].slice(0,4)!==nextMv.from+nextMv.to?", grün: Engine-Zug":""}.`}
 $("#rinfo").className="fb"+(nextMv&&g.cls[p]>=2?" bad":nextMv&&g.cls[p]===1?" warn":"");$("#rinfo").textContent=info;
 const mist=[];g.cls.forEach((c,k)=>{if(c>=2&&RC.mv[k].color===g.me)mist.push(k)});
 $("#rmist").innerHTML=mist.length?mist.map(k=>`<button data-k="${k}">${Math.floor(k/2)+1}${k%2?"…":"."} ${RC.mv[k].san}${["","?!","?","??"][g.cls[k]]}</button>`).join(""):'<p class="muted">Keine Fehler oder Patzer – stark.</p>';
 document.querySelectorAll("#rmist button").forEach(b=>b.onclick=()=>{R.ply=+b.dataset.k;renderReview()});
 let mh="";for(let i=0;i<RC.mv.length;i+=2){mh+=`<b>${i/2+1}.</b>`;for(const k of[i,i+1])mh+=RC.mv[k]?`<span data-k="${k+1}" class="c${g.cls[k]} ${p===k+1?"cur":""}">${RC.mv[k].san}${["","?!","?","??"][g.cls[k]]}</span>`:"<span></span>"}
 $("#rmoves").innerHTML=mh;document.querySelectorAll("#rmoves span[data-k]").forEach(s=>s.onclick=()=>{R.ply=+s.dataset.k;renderReview()});
 const cur=$("#rmoves .cur"),box=$("#rmoves");if(cur)box.scrollTop=Math.max(0,cur.offsetTop-box.offsetTop-60);
 drawGraph(g,p)}
function drawGraph(g,p){const n=g.W.length,x=i=>n>1?i*300/(n-1):0,y=w=>100-w;const pts=g.W.map((w,i)=>x(i)+","+y(w)).join(" ");
 let dots="";g.cls.forEach((c,k)=>{if(c>=2){const mine=RC.mv[k].color===g.me;dots+=`<circle cx="${x(k+1)}" cy="${y(g.W[k+1])}" r="${mine?3.2:2.2}" fill="${c===3?RED:"#d39a4c"}" opacity="${mine?1:.5}"/>`}});
 $("#rgraph").innerHTML=`<polygon points="0,100 ${pts} 300,100" fill="var(--sq-l)"/><line x1="0" x2="300" y1="50" y2="50" stroke="var(--line)"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><line x1="${x(p)}" x2="${x(p)}" y1="0" y2="100" stroke="var(--text)" stroke-width="1" vector-effect="non-scaling-stroke"/>${dots}`}
$("#rgraph").addEventListener("pointerdown",e=>{const g=curGame();if(!g)return;const r=e.currentTarget.getBoundingClientRect();R.ply=Math.round((e.clientX-r.left)/r.width*(g.W.length-1));renderReview()});
$("#rfirst").onclick=()=>{R.ply=0;renderReview()};$("#rprev").onclick=()=>{R.ply--;renderReview()};$("#rnext").onclick=()=>{R.ply++;renderReview()};$("#rlast").onclick=()=>{R.ply=1e9;renderReview()};
document.addEventListener("keydown",e=>{if(VIEW!=="review"||e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;if(e.key==="ArrowLeft"){R.ply--;renderReview()}if(e.key==="ArrowRight"){R.ply++;renderReview()}});

// ---------- Spielen ----------
let P=null;
function renderPlay(){if(!P){drawBoard("pboard",new Chess(),"w",{});return}
 const tg=P.sel?P.g.moves({square:P.sel,verbose:true}).map(m=>m.to):null;
 drawBoard("pboard",P.g,P.me,{last:P.last,sel:P.sel,tg,onClick:pSq,arrows:P.arrow?[P.arrow]:[]});
 const t=P.g.turn()===P.me;$("#pstatus").textContent=P.over?P.overText:P.busy?(t?"Prüfe deinen Zug …":"Stockfish denkt …"):(t?"Du bist am Zug":"Stockfish am Zug");
 const h=P.g.history();let mh="";for(let i=0;i<h.length;i+=2)mh+=`<b>${i/2+1}.</b><span class="c${P.cls[i]||0}">${h[i]}</span><span class="c${P.cls[i+1]||0}">${h[i+1]||""}</span>`;$("#pmoves").innerHTML=mh;$("#pmoves").scrollTop=1e6}
async function pNew(){let c=$("#pcolor").value;if(c==="r")c=Math.random()<.5?"w":"b";S.level=+$("#plevel").value;save();
 P={g:new Chess(),me:c,lv:S.level,sel:null,busy:false,over:false,last:null,cls:[],pre:null,arrow:null};$("#pfb").className="fb";$("#pfb").textContent=`Stufe ${P.lv}, du spielst ${c==="w"?"Weiss":"Schwarz"}.`;
renderPlay();if(c==="b")await engMove();else preEval()}
async function preEval(){if(!$("#pinstant").checked||!P||P.over)return;const fen=P.g.fen();P.preFen=fen;const ev=await E.eval(fen,{depth:10,prio:true});if(P&&P.preFen===fen)P.pre={fen,ev}}
function pSq(sq){if(!P||P.busy||P.over||P.g.turn()!==P.me)return;
 if(P.sel){const m=pickMove(P.g,P.sel,sq);if(m){P.sel=null;userMove(m);return}}const p=P.g.get(sq);P.sel=p&&p.color===P.me&&P.sel!==sq?sq:null;renderPlay()}
async function userMove(m){P.busy=true;P.arrow=null;const fenB=P.g.fen();P.g.move(m);P.last={from:m.from,to:m.to};renderPlay();
 if($("#pinstant").checked){let pre=P.pre&&P.pre.fen===fenB?P.pre.ev:await E.eval(fenB,{depth:10,prio:true});const wb=winOf(fenB,pre);
  let wa;const t=new Chess(P.g.fen());if(t.game_over())wa=t.in_checkmate()?100:50;else{const ev=await E.eval(P.g.fen(),{depth:10,prio:true});wa=100-winOf(P.g.fen(),ev)}
  const drop=pre.best&&pre.best.slice(0,4)===m.from+m.to?0:Math.max(0,wb-wa);const c=classify(drop);P.cls[P.g.history().length-1]=c;
  let bs="";try{bs=new Chess(fenB).move({from:pre.best.slice(0,2),to:pre.best.slice(2,4),promotion:pre.best[4]||"q"}).san}catch(e){}
  $("#pfb").className="fb "+(c>=2?"bad":c===1?"warn":"good");$("#pfb").textContent=c===0?"✓ Guter Zug.":`${["","?! Ungenau","? Fehler","?? Patzer"][c]} (${Math.round(wb)} % → ${Math.round(wa)} %). Besser war ${bs}.`;
  if(c>=1)P.arrow=uciArrow(pre.best,GREEN)}
 P.busy=false;if(pEnd())return;await engMove()}
function winOf(fen,ev){const stm=fen.split(" ")[1];let w=ev.mate!=null?(ev.mate>0?100:0):winPct(ev.cp);return w}
async function engMove(){P.busy=true;renderPlay();const lv=LV[P.lv];const ev=await E.eval(P.g.fen(),{depth:lv.depth,skill:lv.skill});
 const m=ev.best&&P.g.move({from:ev.best.slice(0,2),to:ev.best.slice(2,4),promotion:ev.best[4]||"q"});if(m)P.last={from:m.from,to:m.to};P.busy=false;renderPlay();if(!pEnd())preEval()}
function pEnd(){const g=P.g;if(!g.game_over())return false;let res=.5,t="Remis";if(g.in_checkmate()){res=g.turn()===P.me?0:1;t=res?"Matt – gewonnen!":"Matt – verloren."}finish(res,t);return true}
function finish(res,t){P.over=true;P.overText=t;const h=P.g.history();const mine=h.filter((_,i)=>(i%2===0)===(P.me==="w")).length;
 if(mine>=5){const id="local-"+Date.now();S.queue.push({id,src:"local",sans:h,me:P.me,res,lv:P.lv,end:Date.now()/1e3,meta:{white:P.me==="w"?"Du":"Stockfish "+P.lv,black:P.me==="b"?"Du":"Stockfish "+P.lv}});save();
  $("#pfb").className="fb";$("#pfb").textContent=t+" Die Partie wird analysiert und erscheint im Review.";processQueue()}else{$("#pfb").textContent=t+" (unter 5 Zügen – nicht gewertet)."}
 renderPlay()}
$("#pnew").onclick=pNew;$("#presign").onclick=()=>{if(P&&!P.over)finish(0,"Aufgegeben.")};

// ---------- Puzzles ----------
let Z={c:null};
function nextCard(){const d=dueCards();Z={c:d[0]||null,g:null,done:false,sel:null,arrow:null,last:null};
 if(!Z.c){$("#zstatus").textContent=S.cards.length?"Heute nichts mehr fällig":"Noch keine Fehlerstellungen";$("#zfb").className="fb";
  $("#zfb").textContent=S.cards.length?`${S.cards.length} Stellungen im Stapel, nächste am ${S.cards.map(c=>c.due).sort()[0]}.`:"Analysierte Partien liefern Stellungen ab dem Folgetag.";drawBoard("zboard",new Chess(),"w",{});return}
 Z.g=new Chess(Z.c.fen);$("#zstatus").textContent=`Finde den besten Zug für ${Z.g.turn()==="w"?"Weiss":"Schwarz"} · ${d.length} fällig`;
 $("#zfb").className="fb";$("#zfb").textContent=`In der Partie gespielt: ${Z.c.played} (${Z.c.motif}).`;zdraw()}
function zdraw(){if(!Z.g)return;const tg=Z.sel?Z.g.moves({square:Z.sel,verbose:true}).map(m=>m.to):null;drawBoard("zboard",Z.g,new Chess(Z.c.fen).turn(),{sel:Z.sel,tg,last:Z.last,arrows:Z.arrow?[Z.arrow]:[],onClick:zSq})}
function zSq(sq){if(!Z.c||Z.done||Z.busy)return;const me=new Chess(Z.c.fen).turn();if(Z.sel){const m=pickMove(Z.g,Z.sel,sq);if(m){Z.sel=null;zTry(m);return}}
 const p=Z.g.get(sq);Z.sel=p&&p.color===me&&Z.sel!==sq?sq:null;zdraw()}
async function zTry(m){Z.busy=true;Z.g.move(m);Z.last={from:m.from,to:m.to};zdraw();let ok=m.san===Z.c.best;
 if(!ok){$("#zfb").textContent="Stockfish prüft …";const t=new Chess(Z.g.fen());let wa;if(t.game_over())wa=t.in_checkmate()?100:50;else{const ev=await E.eval(Z.g.fen(),{depth:12,prio:true});wa=100-winOf(Z.g.fen(),ev)}ok=wa>=Z.c.wb-4}
 Z.busy=false;grade(ok,m.san)}
function grade(ok,san){Z.done=true;const c=Z.c;day().r++;
 if(ok){c.ivl=c.ivl?Math.round(c.ivl*2.6):1;c.due=addDays(c.ivl);$("#zfb").className="fb good";$("#zfb").textContent=`✓ ${san} – richtig${san!==c.best?" (gleichwertig zu "+c.best+")":""}. Wieder in ${c.ivl} Tag(en).`;
  if(c.ivl>60){S.cards=S.cards.filter(x=>x!==c);$("#zfb").textContent+=" Gelernt – entfernt."}}
 else{c.ivl=0;c.due=addDays(1);const g=new Chess(c.fen);const m=g.moves({verbose:true}).find(x=>x.san===c.best);Z.g=g;Z.last=null;Z.arrow=m?{from:m.from,to:m.to,c:GREEN}:null;
  $("#zfb").className="fb bad";$("#zfb").textContent=`${san?"✗ "+san+" reicht nicht.":"Aufgelöst."} Lösung: ${c.best}.${c.line?" Variante: "+c.line+".":""} ${TIP[c.motif]||""}`;zdraw()}save()}
$("#zsol").onclick=()=>{if(Z.c&&!Z.done&&!Z.busy)grade(false,"")};$("#znext").onclick=nextCard;
$("#zgame").onclick=()=>{if(!Z.c)return;const g=S.games.find(x=>x.id===Z.c.gid);if(!g)return;R.id=g.id;R.ply=Z.c.ply;show("review")};

// ---------- Setup ----------
function renderSet(){$("#suser").value=S.user;$("#sper").value=S.per;$("#sdepth").value=S.depth;
 let bytes=0;try{bytes=(localStorage.getItem(KEY)||"").length}catch(e){}$("#sinfo").textContent=`${S.games.length} Partien, ${S.cards.length} Puzzle-Stellungen, ${S.queue.length} in Warteschlange · ${(bytes/1024).toFixed(0)} KB lokal gespeichert`}
$("#ssave").onclick=()=>{const u=$("#suser").value.trim();if(u!==S.user){S.user=u;S.lastSync=0}S.per=+$("#sper").value;S.depth=+$("#sdepth").value;save();syncLabel();sync(true);show("today")};
$("#sper").onchange=()=>{S.per=+$("#sper").value;save()};$("#sdepth").onchange=()=>{S.depth=+$("#sdepth").value;save()};
$("#spgnadd").onclick=()=>{const pgn=$("#spgn").value.trim();if(!pgn)return;const t=new Chess();if(!t.load_pgn(pgn,{sloppy:true})){banner("PGN nicht lesbar.");return}
 const h=t.header();S.queue.push({id:h.Link||"pgn-"+Date.now(),src:"pgn",pgn,me:$("#spgncol").value,end:Date.now()/1e3});save();$("#spgn").value="";processQueue();show("today")};
$("#sexp").onclick=async()=>{const t=exportText(),ta=$("#sexpt");ta.value=t;ta.hidden=false;try{await navigator.clipboard.writeText(t);$("#sexp").textContent="Kopiert"}catch(e){ta.select()}};
$("#sreset").onclick=()=>{if(confirm("Alle Partien, Statistiken und Puzzles löschen?")){const u=S.user;Object.assign(S,def(),{user:u});save();renderSet()}};

// ---------- Start ----------
$("#plevel").value=S.level;syncLabel();renderDash();
if(S.queue.length)processQueue();sync(false);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){sync(false);if(S.queue.length)processQueue()}});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
