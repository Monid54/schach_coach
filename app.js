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
function def(){return{user:"",per:5,depth:12,lastSync:0,games:[],queue:[],cards:[],days:{},level:3,seen:{},newDay:15}}
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
function show(v){VIEW=v;if(v!=="puz")AHEAD=false;document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
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
// Neue Karten (noch nie geübt) nur bis zum Tageslimit, Wiederholungen immer
const isNew=c=>!c.rev&&!c.ivl;const byDue=(a,b)=>a.due<b.due?-1:a.due>b.due?1:0;
function dueCards(){const t=today(),due=S.cards.filter(c=>c.due<=t);const nw=due.filter(isNew).sort(byDue);
 return due.filter(c=>!isNew(c)).concat(nw.slice(0,Math.max(0,S.newDay-(day().nw||0))))}
// Vorausüben: alles noch nicht Fällige, heute nicht schon Geübte, früheste zuerst
function aheadCards(){const d=new Set(dueCards()),t=today();return S.cards.filter(c=>!d.has(c)&&c.last!==t).sort(byDue)}
const fmtD=s=>s.split("-").reverse().join(".");
let AHEAD=false;
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
// ---------- Icons (SF-Symbols-Stil, keine Emoji) ----------
const IC={check:'<svg viewBox="0 0 24 24" class="ic"><path d="M6 12.5l4 4 8-9"/></svg>',
 play:'<svg viewBox="0 0 24 24" class="ic f"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
 prev:'<svg viewBox="0 0 24 24" class="ic"><path d="M15 5l-7 7 7 7"/></svg>',next:'<svg viewBox="0 0 24 24" class="ic"><path d="M9 5l7 7-7 7"/></svg>',
 first:'<svg viewBox="0 0 24 24" class="ic"><path d="M17 5l-7 7 7 7M7 5v14"/></svg>',last:'<svg viewBox="0 0 24 24" class="ic"><path d="M7 5l7 7-7 7M17 5v14"/></svg>',
 info:'<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r=".7" class="dot"/></svg>',
 x:'<svg viewBox="0 0 24 24" class="ic"><path d="M7 7l10 10M17 7L7 17"/></svg>',chev:'<svg viewBox="0 0 24 24" class="ic chev"><path d="M9 5l7 7-7 7"/></svg>',
 plus:'<svg viewBox="0 0 24 24" class="ic"><path d="M12 6v12M6 12h12"/></svg>',minus:'<svg viewBox="0 0 24 24" class="ic"><path d="M6 12h12"/></svg>',
 replay:'<svg viewBox="0 0 24 24" class="ic"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>'};
// Ausführliche Erklärung der Fehlerbilder (wie erkannt, was dahintersteckt)
const DESC={"Figur eingestellt":"Nach deinem Zug konnte der Gegner eine Leichtfigur, einen Turm oder die Dame schlagen, die mehr wert war als das, was du selbst gerade geschlagen hast. Meist steht die gezogene Figur ungedeckt auf einem angegriffenen Feld, oder dein Zug hat eine andere Figur oder eine Deckung aufgegeben.",
 "Schlagchance verpasst":"Die Engine hätte hier Material gewonnen (mindestens eine Leichtfigur), du hast stattdessen nicht geschlagen. Häufig hängt nach dem letzten Gegnerzug eine Figur, oder eine einfache Taktik wie Gabel, Fesselung oder Spiess gewinnt etwas.",
 "Matt übersehen":"Du hattest ein erzwungenes Matt, hast es aber nicht gespielt und danach nicht mehr erzwingen können.",
 "Matt zugelassen":"Nach deinem Zug konnte der Gegner Matt erzwingen. Typisch sind eine schwache Grundreihe, eine offene Diagonale zum König oder ein übersehenes Schach.",
 "Positionsfehler":"Dein Zug kostete mindestens 10 Prozentpunkte Gewinnchance, ohne dass sofort Material verloren ging oder ein Matt im Spiel war. Dahinter stecken meist falsch platzierte Figuren, ein ungünstiger Abtausch, eine neue Bauernschwäche oder ein Plan des Gegners, dessen Folgen erst einige Züge später sichtbar werden. Im Beispiel zeigt «Gespielt» die Folge laut Engine, «Besser» den stärkeren Plan.",
 "Zeitnot":"Ein Fehler oder Patzer passierte, als weniger als 10 % deiner Startzeit (mindestens 15 Sekunden) übrig waren.",
 "Dame zu früh":"Du hast die Dame in deinen ersten 5 Zügen gezogen. Eine früh entwickelte Dame wird mit Tempo von gegnerischen Figuren angegriffen und bremst deine eigene Entwicklung.",
 "Figur doppelt gezogen":"In den ersten 8 Zügen hast du einen Springer oder Läufer ein zweites Mal gezogen, ohne dabei zu schlagen. Das kostet Entwicklungszeit, die dem Gegner zugutekommt.",
 "Nicht rochiert":"Nach 12 Zügen stand dein König noch auf dem Ausgangsfeld. Ein König in der Mitte wird zum Angriffsziel, sobald Linien geöffnet werden."};
const daysAgo=t=>{const d=Math.round((Date.now()/1e3-t)/86400);return d<=0?"heute":d===1?"gestern":`vor ${d} Tagen`};
const FC={};const fensC=g=>FC[g.id]||(FC[g.id]=fensOf(g));
const sideAt=(g,k)=>(g.start.split(" ")[1]==="w")===(k%2===0)?"w":"b";
const moveNo=(g,k)=>{const st=g.start.split(" "),w=st[1]==="w";return(+st[5]||1)+Math.floor((k+(w?0:1))/2)};
const plyLbl=(g,k)=>`${moveNo(g,k)}${sideAt(g,k)==="w"?".":"…"} ${g.sans[k]}`;
const uciSan=(fen,u)=>{try{return u?new Chess(fen).move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||"q"}).san:null}catch(e){return null}};
function examples(m,n=3){const out=[],seen=new Set(),push=(g,ply)=>{const k=g.id+"#"+ply;if(!seen.has(k)&&g.sans[ply]){seen.add(k);out.push({g,ply})}};
 for(const g of[...S.games].reverse()){for(const e of g.ex||[])if(e.m===m&&out.length<n)push(g,e.ply);if(out.length>=n)return out}
 for(const c of[...S.cards].reverse()){if(out.length>=n)break;if(c.motif!==m)continue;const g=S.games.find(x=>x.id===c.gid);if(g)push(g,c.ply)}return out}
// ---------- Sheet (Bottom Sheet) mit Brett-Simulation ----------
let SIM={t:null};
function openSheet(title,html){clearInterval(SIM.t);$("#shtitle").textContent=title;$("#shbody").innerHTML=html;$("#sheet").hidden=false;$("#sheet .sheet-card").scrollTop=0;document.body.classList.add("noscroll")}
function closeSheet(){clearInterval(SIM.t);$("#sheet").hidden=true;document.body.classList.remove("noscroll")}
$("#sheet .sheet-bg").onclick=closeSheet;$("#shclose").onclick=closeSheet;$("#shclose").innerHTML=IC.x;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#sheet").hidden)closeSheet()});
const simHTML=(vars,auto)=>`${vars.length>1?`<div class="seg" id="sseg">${vars.map((v,i)=>`<button data-i="${i}">${v.label}</button>`).join("")}</div>`:""}
 <div class="bwrap sbw"><div id="sboard" class="board"></div><svg class="arrows" id="sarrows" viewBox="0 0 8 8"></svg></div>
 <div class="seq" id="sseq"></div><p class="muted" id="snote"></p>
 <div class="row">${auto?`<button class="btn ib" id="sreplay" aria-label="Neu starten">${IC.replay}</button>`:`<button class="btn ib" id="sfirst" aria-label="Anfang">${IC.first}</button><button class="btn ib" id="sprev" aria-label="Zurück">${IC.prev}</button><button class="btn ib" id="snext" aria-label="Vor">${IC.next}</button>`}</div>`;
function simWire(vars,auto){const go=i=>{simStart(vars,i,auto);document.querySelectorAll("#sseg button").forEach(b=>b.classList.toggle("on",+b.dataset.i===i))};
 document.querySelectorAll("#sseg button").forEach(b=>b.onclick=()=>go(+b.dataset.i));
 const st=d=>{if(!SIM.mv)return;SIM.k=Math.max(0,Math.min(SIM.mv.length,d==="first"?0:SIM.k+d));simDraw()};
 if(auto)$("#sreplay").onclick=()=>go(SIM.i||0);else{$("#sfirst").onclick=()=>st("first");$("#sprev").onclick=()=>st(-1);$("#snext").onclick=()=>st(1)}
 go(0)}
function simStart(vars,i,auto){clearInterval(SIM.t);const v=vars[i],c=new Chess(v.fen),fens=[v.fen],mv=[];
 for(const x of v.sans){const m=c.move(x,{sloppy:true});if(!m)break;mv.push(m);fens.push(c.fen())}
 SIM={vars,i,fens,mv,k:0,auto,t:null,pause:0};simDraw();
 if(auto)SIM.t=setInterval(()=>{if($("#sheet").hidden)return clearInterval(SIM.t);if(SIM.k<SIM.mv.length)SIM.k++;else if(++SIM.pause>2){SIM.k=0;SIM.pause=0}simDraw()},1100)}
function simDraw(){const s=SIM,v=s.vars[s.i],k=s.k,nx=s.mv[k];
 const arrows=k===0&&v.arrows?v.arrows:nx&&!s.auto?[{from:nx.from,to:nx.to,c:v.color||GREEN}]:[];
 drawBoard("sboard",new Chess(s.fens[k]),v.orient||"w",{last:k>0?{from:s.mv[k-1].from,to:s.mv[k-1].to}:null,arrows:arrows.filter(Boolean)});
 const st=v.fen.split(" ");let num=+st[5]||1,w=st[1]==="w";
 $("#sseq").innerHTML=s.mv.map((m,i)=>{const lbl=w?`${num}. ${m.san}`:i===0?`${num}… ${m.san}`:m.san;if(!w)num++;w=!w;return`<span class="${i<k?"done":i===k&&!s.auto?"nx":""}">${lbl}</span>`}).join("");
 $("#snote").textContent=v.note||""}
// Beispiel eines Fehlerbilds: Gespielt (mit Folge) / Besser
function openExample(g,ply,m){const F=fensC(g),fen=F.f[ply],played=F.mv[ply],bestS=uciSan(fen,g.best[ply]);
 const viaEngine=!!(g.pv&&g.pv[ply+1]),after=viaEngine?sanList(g.pv[ply+1]):g.sans.slice(ply+1,ply+5);
 const better=bestS&&bestS!==played.san;
 const arrows=[{from:played.from,to:played.to,c:RED}];if(better)arrows.push(uciArrow(g.best[ply],GREEN));
 const vars=[{label:"Gespielt",fen,sans:[played.san,...after].slice(0,7),color:RED,orient:g.me,arrows,
  note:`Rot: dein Zug ${played.san}${better?`, grün: besser ${bestS}`:""}. Danach ${viaEngine?"die Folge laut Engine":"der Partieverlauf"}.`}];
 if(better){const bl=g.pv&&g.pv[ply]?sanList(g.pv[ply]):[bestS];vars.push({label:"Besser",fen,sans:bl.slice(0,6),color:GREEN,orient:g.me,note:"Grün: die stärkere Fortsetzung laut Engine."})}
 const opp=g.me==="w"?g.black:g.white;
 openSheet(m,`<p class="muted" style="margin:0">Partie gegen ${esc(opp)}${g.date?" · "+fmtD(g.date):""} · ${plyLbl(g,ply)}</p>${simHTML(vars,false)}<div class="row"><button class="btn" id="sreview">In Review öffnen</button></div>`);
 simWire(vars,false);$("#sreview").onclick=()=>{closeSheet();R.id=g.id;R.ply=ply;R.v=null;show("review")}}
function openAccInfo(){openSheet("So wird Genauigkeit berechnet",`<div class="doc">
 <p>Stockfish bewertet jede Stellung der Partie. Die Bewertung in Hundertstel-Bauern (cp) wird in eine <b>Gewinnchance</b> aus Sicht der ziehenden Seite umgerechnet:</p>
 <p class="fx">Gewinnchance = 50 + 50 · (2 / (1 + e<sup>−0.00368 · cp</sup>) − 1)</p>
 <p>Pro Zug zählt der <b>Verlust</b>: Gewinnchance vor dem Zug minus nach dem Zug. Spielst du den Engine-Zug, ist der Verlust 0. Daraus folgt die <b>Zuggenauigkeit</b>:</p>
 <p class="fx">Genauigkeit = 103.17 · e<sup>−0.04354 · Verlust</sup> − 3.17</p>
 <p>begrenzt auf 0–100 %. Ohne Verlust ergibt das 100 %, bei 10 Punkten Verlust rund 64 %, bei 20 Punkten rund 40 %.</p>
 <p><b>Partie-Genauigkeit</b> ist der Mittelwert über alle deine Züge. Phasen: <b>Eröffnung</b> sind deine ersten 10 Züge, <b>Endspiel</b> beginnt, sobald höchstens 26 Punkte an Figuren auf dem Brett sind (ohne Bauern und Könige; Springer und Läufer 3, Turm 5, Dame 9). Alles dazwischen ist <b>Mittelspiel</b>. Angezeigt wird jeweils der Durchschnitt der letzten 20 Partien.</p>
 <p><b>Einstufung</b> nach Verlust: ab 5 Punkten Ungenauigkeit (?!), ab 10 Fehler (?), ab 15 Patzer (??).</p>
 <p class="muted">Die Formeln stammen von Lichess und sind öffentlich dokumentiert. Chess.com verwendet ein eigenes, nicht veröffentlichtes Verfahren (CAPS), daher weichen die Werte ab. Lichess mittelt zudem gewichtet, hier wird einfach gemittelt.</p></div>`)}
function openOpening(fam,col){const o=OPENINGS[fam],mine=S.games.filter(g=>g.family===fam&&g.me===col);
 const sans=o?o.m:(mine[mine.length-1]?.sans||[]).slice(0,8);const st=openingStats(S.games)[col].find(x=>x.name===fam);
 const vars=[{fen:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",sans,orient:col,note:o?"Hauptlinie, läuft in Schleife.":"Zugfolge aus deiner letzten Partie mit dieser Eröffnung."}];
 const li=(arr,cls,ic)=>`<ul class="pros">${arr.map(t=>`<li><span class="pi ${cls}">${ic}</span><span>${t}</span></li>`).join("")}</ul>`;
 openSheet(o?o.n:fam,`${o&&o.n!==fam?`<p class="muted" style="margin:0">${esc(fam)}</p>`:""}<p>${o?o.d:"Für diese Eröffnung ist noch keine Beschreibung hinterlegt."}</p>${simHTML(vars,true)}
  ${o?`<h2>Vorteile</h2>${li(o.p,"good",IC.plus)}<h2>Nachteile</h2>${li(o.c,"bad",IC.minus)}<h2>Typischer Elo-Bereich</h2><p style="margin-top:4px">${o.e}<br><span class="muted">Einschätzung, keine Statistik.</span></p>`:""}
  ${st?`<h2>Deine Bilanz mit ${col==="w"?"Weiss":"Schwarz"}</h2><p style="margin-top:4px">${st.n} Partien · ${st.score} % Punkte · Genauigkeit ${st.acc??"–"} %</p>`:""}`);simWire(vars,true)}
function openOpMistakes(fam,col){const gs=S.games.filter(g=>g.family===fam&&g.me===col).reverse();let tot=0,early=0;const mc={};
 const rows=gs.map(g=>{const ks=[];g.cls.forEach((c,k)=>{if(c>=2&&sideAt(g,k)===g.me)ks.push(k)});tot+=ks.length;
  const opp=g.me==="w"?g.black:g.white,rs=g.res===1?["S","win"]:g.res===0?["N","loss"]:g.res===.5?["R","draw"]:["–",""];
  const items=ks.map(k=>{const mn=moveNo(g,k),ph=mn<=10?"Eröffnung":"";if(mn<=10)early++;const mo=(g.ex||[]).filter(e=>e.ply===k).map(e=>e.m);mo.forEach(x=>mc[x]=(mc[x]||0)+1);
   return`<button class="mi" data-g="${encodeURIComponent(g.id)}" data-k="${k}"><b>${plyLbl(g,k)}${MARK[g.cls[k]]}</b><span>${[mo.join(", ")||(g.cls[k]===3?"Patzer":"Fehler"),ph].filter(Boolean).join(" · ")}</span>${IC.chev}</button>`}).join("");
  return`<div class="og"><div class="ogh"><span class="rb ${rs[1]}">${rs[0]}</span><span class="gm"><span class="gn">${esc(opp)}</span><span class="gs">${g.date?fmtD(g.date):""} · Genauigkeit ${g.acc??"–"} %</span></span></div>${items||'<p class="muted" style="margin:6px 0 0">Keine Fehler oder Patzer.</p>'}</div>`}).join("");
 const top=Object.entries(mc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ×${v}`).join(", ");
 openSheet(`Deine Fehler: ${(OPENINGS[fam]||{}).n||fam}`,`<p class="muted" style="margin:0">Mit ${col==="w"?"Weiss":"Schwarz"} · ${gs.length} ${gs.length===1?"Partie":"Partien"}</p>
  <div class="fb" style="margin:12px 0">${tot} Fehler und Patzer, davon ${early} in den ersten 10 Zügen.${top?`\nHäufigste Fehlerbilder: ${top}`:""}</div>${rows}`);
 document.querySelectorAll("#shbody .mi").forEach(b=>b.onclick=()=>{closeSheet();R.id=decodeURIComponent(b.dataset.g);R.ply=+b.dataset.k;R.v=null;show("review")})}
const WOPEN=new Set();
function renderDash(){const d=day(),due=dueCards().length,G=S.games,w=weaknesses(G),p=phaseAcc(G),o=openingStats(G),rec=G.slice(-20).filter(g=>g.acc!=null);
 const newest=G[G.length-1];const revDone=!newest||S.seen[newest.id];
 const plan=[[newest?`Neueste Partie im Review ansehen (${esc(newest.white)} – ${esc(newest.black)})`:"Chess.com-Konto im Setup eintragen",revDone&&!!newest],
  [due?`${Math.min(due,5)} Puzzles aus eigenen Fehlern lösen`:"Puzzles für heute erledigt",due===0],["1 Partie spielen (Chess.com oder hier)",d.g>0||G.some(g=>g.date===today())]];
 const top=w[0];
 const wH=w.length?w.slice(0,6).map(([k,v])=>{const op=WOPEN.has(k),ex=op?examples(k):[];return`<div class="wk${op?" open":""}" data-k="${esc(k)}"><button class="wkh" aria-expanded="${op}"><span>${k}</span><span class="tr"><i style="width:${Math.min(100,v*50)}%"></i></span><span class="n">${v.toFixed(1)}</span>${IC.chev}</button>
  <div class="wkb"${op?"":" hidden"}><p>${DESC[k]||""}</p><p class="tipb"><b>Tipp:</b> ${TIP[k]||""}</p>
  ${ex.length?`<h2>Aktuelle Beispiele</h2>${ex.map((e,i)=>`<button class="mi" data-i="${i}"><b>${plyLbl(e.g,e.ply)}</b><span>gegen ${esc(e.g.me==="w"?e.g.black:e.g.white)}${e.g.date?" · "+fmtD(e.g.date).slice(0,6):""}</span>${IC.chev}</button>`).join("")}`:'<p class="muted">Noch keine Beispielstellung gespeichert. Neu analysierte Partien liefern Beispiele.</p>'}</div></div>`}).join("")
  +'<p class="muted" style="margin:10px 0 0">Zahl = durchschnittliche Anzahl pro Partie in den letzten 20 Partien. Antippen für Details.</p>':'<p class="muted">Noch keine analysierten Partien.</p>';
 let spark='<p class="muted">Verlauf ab 2 Partien.</p>';
 if(rec.length>=2){const Wd=320,H=120,L=36,Rr=10,T=8,B=24,n=rec.length,lo=Math.max(0,Math.min(40,Math.min(...rec.map(g=>g.acc))-10)),x=i=>L+i*(Wd-L-Rr)/(n-1),y=a=>T+(1-(a-lo)/(100-lo))*(H-T-B);
  const pts=rec.map((g,i)=>[x(i),y(g.acc)]);
  spark=`<svg viewBox="0 0 ${Wd} ${H}" class="spark">${[100,70,40].filter(v=>v>=lo).map(v=>`<line x1="${L}" x2="${Wd-Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"${v===70?' stroke-dasharray="4 4"':""}/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v} %</text>`).join("")}
  <polyline fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" points="${pts.map(q=>q.join(",")).join(" ")}"/>${pts.map((q,i)=>`<circle cx="${q[0]}" cy="${q[1]}" r="4" fill="${rec[i].res===1?"var(--good)":rec[i].res===0?"var(--bad)":"var(--warn)"}" stroke="var(--surface)" stroke-width="1.5"/>`).join("")}
  <text x="${L}" y="${H-6}" text-anchor="start">${daysAgo(rec[0].end)}</text><text x="${Wd-Rr}" y="${H-6}" text-anchor="end">${daysAgo(rec[n-1].end)}</text></svg>
  <div class="legend"><span><i style="background:var(--good)"></i>Sieg</span><span><i style="background:var(--bad)"></i>Niederlage</span><span><i style="background:var(--warn)"></i>Remis</span></div>
  <p class="muted" style="margin:4px 0 0">Jeder Punkt ist eine Partie: Höhe = deine Genauigkeit, Farbe = Ergebnis. Letzte ${n} Partien.</p>`}
 const ph=[["Eröffnung","o"],["Mittelspiel","m"],["Endspiel","e"]].map(([n,k])=>`<div class="bar"><span>${n}</span><span class="tr"><i style="width:${p[k]??0}%"></i></span><span>${p[k]??"–"}</span></div>`).join("");
 const cell=(x,col,v,st)=>`<td class="n"><button class="om" data-op="${esc(x.name)}" data-c="${col}"${st?` style="${st}"`:""}>${v}</button></td>`;
 const otab=(arr,lbl,col)=>arr.length?`<table class="otab"><tr><th>${lbl}</th><th class="n">Partien</th><th class="n">Punkte</th><th class="n">Genau.</th></tr>${arr.slice(0,6).map(x=>`<tr><td><button class="lnk" data-op="${esc(x.name)}" data-c="${col}">${esc((OPENINGS[x.name]||{}).n||x.name)}</button></td>${cell(x,col,x.n)}${cell(x,col,x.score+" %",x.n>=3&&x.score<40?"color:var(--bad)":x.n>=3&&x.score>=60?"color:var(--good)":"")}${cell(x,col,x.acc??"–")}</tr>`).join("")}</table>`:"";
 $("#dash").innerHTML=`
 <section><h2>Heute</h2><div class="row" style="gap:26px"><div><div class="big">${streak()}</div><div class="muted">Tage in Folge</div></div><div><div class="big">${due}</div><div class="muted">Puzzles fällig</div></div><div><div class="big">${G.length}</div><div class="muted">Partien analysiert</div></div></div>
 <ul class="checks">${plan.map(([t,ok])=>`<li class="${ok?"ok":""}"><span class="cbox">${ok?IC.check:""}</span><span>${t}</span></li>`).join("")}</ul>
 ${top?`<div class="focus"><b>Fokus: ${top[0]}</b>\n${TIP[top[0]]||""}</div>`:""}
 ${S.user?`<div class="row" style="margin-top:12px"><button class="btn" id="dsync">Jetzt synchronisieren</button>${newest?'<button class="btn pri" id="dopen">Neueste Partie öffnen</button>':""}</div>`:'<div class="row" style="margin-top:12px"><button class="btn pri" id="dset">Chess.com verbinden</button></div>'}</section>
 <section><h2>Deine Schwachstellen</h2>${wH}</section>
 <section><div class="sh"><h2>Genauigkeit</h2><button class="infob" id="dacc" aria-label="Wie wird Genauigkeit berechnet?">${IC.info}</button></div>${ph}<div style="margin-top:14px">${spark}</div></section>
 <section><h2>Eröffnungen</h2>${otab(o.w,"Mit Weiss","w")}${o.b.length?'<div style="height:12px"></div>':""}${otab(o.b,"Mit Schwarz","b")}${!o.w.length&&!o.b.length?'<p class="muted">Erscheint mit Chess.com-Partien.</p>':'<p class="muted">Name antippen für Erklärung und Hauptlinie, Zahlen antippen für deine Fehler. Rot: unter 40 % Punkte bei mind. 3 Partien.</p>'}</section>`;
 const ds=$("#dsync");if(ds)ds.onclick=()=>sync(true);const dO=$("#dopen");if(dO)dO.onclick=()=>{R.id=newest.id;R.ply=null;R.v=null;show("review")};const dS=$("#dset");if(dS)dS.onclick=()=>show("set");
 $("#dacc").onclick=openAccInfo;
 document.querySelectorAll("#dash .wk").forEach(el=>{const k=el.dataset.k;el.querySelector(".wkh").onclick=()=>{WOPEN.has(k)?WOPEN.delete(k):WOPEN.add(k);renderDash()};
  const ex=WOPEN.has(k)?examples(k):[];el.querySelectorAll(".mi").forEach(b=>b.onclick=()=>{const e=ex[+b.dataset.i];openExample(e.g,e.ply,k)})});
 document.querySelectorAll("#dash .lnk").forEach(b=>b.onclick=()=>openOpening(b.dataset.op,b.dataset.c));
 document.querySelectorAll("#dash .om").forEach(b=>b.onclick=()=>openOpMistakes(b.dataset.op,b.dataset.c))}

// ---------- Review ----------
let R={id:null,ply:0,v:null,pgn:false,f:{c:null,r:null,t:null}};
function curGame(){return S.games.find(g=>g.id===R.id)}
function fensOf(g){const b=new Chess(g.start),f=[b.fen()],mv=[];for(const s of g.sans){const m=b.move(s,{sloppy:true});mv.push(m);f.push(b.fen())}return{f,mv}}
let RC=null;
const esc=t=>String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
// Filter: Farbe, Ergebnis und Bedenkzeit kombinierbar, innerhalb einer Gruppe nur eine Auswahl
const GF=[["all","Alle"],["c:w","Weiss"],["c:b","Schwarz"],["t:600","10 min"],["t:180","3 min"],["t:60","1 min"],["r:1","Sieg"],["r:0","Niederlage"]];
function gFilter(g){const f=R.f;return(!f.c||g.me===f.c)&&(f.r==null||g.res===+f.r)&&(!f.t||baseTime(g.tc)===+f.t)}
function tcLabel(g){const b=baseTime(g.tc);if(!b)return g.src==="local"?"vs. Stockfish":"";const inc=(g.tc||"").split("+")[1];return(b>=60?Math.round(b/60)+" min":b+" s")+(inc&&inc!=="0"?" +"+inc:"")}
function renderList(){const all=[...S.games].reverse(),list=all.filter(gFilter),f=R.f;
 $("#gfilter").innerHTML=GF.map(([k,l])=>{const on=k==="all"?!f.c&&f.r==null&&!f.t:f[k[0]]===k.slice(2);return`<button class="chip${on?" on":""}" data-k="${k}">${l}</button>`}).join("");
 $("#gfilter").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{const k=b.dataset.k;if(k==="all")R.f={c:null,r:null,t:null};else{const g=k[0],v=k.slice(2);R.f[g]=R.f[g]===v?null:v}renderList()});
 $("#gcount").textContent=all.length?`${list.length} von ${all.length}`:"";
 $("#glist").innerHTML=list.length?list.map(g=>{const opp=g.me==="w"?g.black:g.white,oe=g.me==="w"?g.bElo:g.wElo;
  const rs=g.res===1?["S","win"]:g.res===0?["N","loss"]:g.res===.5?["R","draw"]:["–",""];
  const meta=[`<i class="pcol ${g.me}"></i>${g.me==="w"?"Weiss":"Schwarz"}`,tcLabel(g),g.date?fmtD(g.date).slice(0,6):"",esc(g.opening||"")].filter(Boolean).join(" · ");
  return`<button class="gitem${g.id===R.id?" on":""}" data-id="${encodeURIComponent(g.id)}"><span class="rb ${rs[1]}">${rs[0]}</span><span class="gm"><span class="gn">${esc(opp)}${oe?` <span class="muted">${oe}</span>`:""}</span><span class="gs">${meta}</span></span><span class="ga">${g.acc??"–"}<small> %</small></span></button>`}).join("")
  :`<p class="muted" style="padding:12px 16px;margin:0">${all.length?"Keine Partie passt zum Filter.":"Noch keine Partien. Chess.com im Setup verbinden oder eine Partie spielen."}</p>`;
 $("#glist").querySelectorAll(".gitem").forEach(b=>b.onclick=()=>{R.id=decodeURIComponent(b.dataset.id);R.ply=null;R.v=null;renderReview();window.scrollTo({top:0,behavior:"smooth"})})}
// Variante (max. 6 Halbzüge) zum Durchspielen
const sanList=t=>t?t.split(" ").filter(x=>x&&!/^\d+[.…]/.test(x)):[];
function startVar(fen,line,kind,after){const c=new Chess(fen),fens=[fen],mv=[];for(const x of sanList(line).slice(0,6)){const m=c.move(x,{sloppy:true});if(!m)break;mv.push(m);fens.push(c.fen())}
 if(mv.length){R.v={fens,mv,k:0,kind,after};renderReview()}}
function step(d){if(R.v)R.v.k=d==="first"?0:d==="last"?1e9:R.v.k+d;else R.ply=d==="first"?0:d==="last"?1e9:R.ply+d;renderReview()}
function renderReview(){renderList();
 const list=[...S.games].reverse();const g=curGame();if(!g){if(list[0]&&R.id===null){R.id=list[0].id;R.ply=null;return renderReview()}drawBoard("rboard",new Chess(),"w",{});return}
 if(!S.seen[g.id]){S.seen[g.id]=1;day().rev++;save()}
 if(!RC||RC.id!==g.id)RC=Object.assign({id:g.id},fensOf(g));
 if(R.ply==null){const i=g.cls.findIndex((c,k)=>c>=2&&RC.mv[k].color===g.me);R.ply=i>=0?i:0}
 R.ply=Math.max(0,Math.min(RC.f.length-1,R.ply));const p=R.ply;const fen=RC.f[p];const nextMv=RC.mv[p];
 $("#rtitle").textContent=`${g.white}${g.wElo?" ("+g.wElo+")":""} – ${g.black}${g.bElo?" ("+g.bElo+")":""}`;
 const mist=[];g.cls.forEach((c,k)=>{if(c>=2&&RC.mv[k].color===g.me)mist.push(k)});
 $("#rmist").innerHTML=mist.length?mist.map(k=>`<button data-k="${k}"${k===p&&!R.v?' class="on"':""}>${Math.floor(k/2)+1}${k%2?"…":"."} ${RC.mv[k].san}${MARK[g.cls[k]]}</button>`).join(""):'<p class="muted">Keine Fehler oder Patzer – stark.</p>';
 $("#rmist").querySelectorAll("button").forEach(b=>b.onclick=()=>{R.ply=+b.dataset.k;R.v=null;renderReview()});
 $("#rpgn").textContent=R.pgn?"PGN ausblenden":"PGN";$("#rmoves").hidden=!R.pgn;
 if(R.pgn){let mh="";for(let i=0;i<RC.mv.length;i+=2){mh+=`<b>${i/2+1}.</b>`;for(const k of[i,i+1])mh+=RC.mv[k]?`<span data-k="${k+1}" class="c${g.cls[k]} ${p===k+1&&!R.v?"cur":""}">${RC.mv[k].san}${MARK[g.cls[k]]}</span>`:"<span></span>"}
  $("#rmoves").innerHTML=mh;$("#rmoves").querySelectorAll("span[data-k]").forEach(x=>x.onclick=()=>{R.ply=+x.dataset.k;R.v=null;renderReview()});
  const cur=$("#rmoves .cur"),box=$("#rmoves");if(cur)box.scrollTop=Math.max(0,cur.offsetTop-box.offsetTop-60)}
 drawGraph(g,p);
 if(R.v){const v=R.v;v.k=Math.max(0,Math.min(v.mv.length,v.k));const k=v.k,nx=v.mv[k];
  drawBoard("rboard",new Chess(v.fens[k]),g.me,{last:k>0?{from:v.mv[k-1].from,to:v.mv[k-1].to}:null,arrows:nx?[{from:nx.from,to:nx.to,c:v.kind==="best"?GREEN:RED}]:[]});
  $("#rply").textContent=`Variante · Zug ${k} von ${v.mv.length}`;
  $("#rinfo").className="fb "+(v.kind==="best"?"good":"bad");
  $("#rinfo").innerHTML=`<b>${v.kind==="best"?"Beste Fortsetzung":"Was nach "+esc(v.after)+" droht"}</b><div class="seq">${v.mv.map((m,i)=>`<span class="${i<k?"done":i===k?"nx":""}">${m.san}</span>`).join("")}</div><span class="muted">${k<v.mv.length?"Mit dem Pfeil nach rechts den nächsten Zug ausführen.":"Ende der Variante."}</span><div class="row"><button class="btn" id="rvback">Zurück zur Partie</button></div>`;
  $("#rvback").onclick=()=>{R.v=null;renderReview()};return}
 const arrows=[];if(nextMv){arrows.push({from:nextMv.from,to:nextMv.to,c:GREY});if(g.best[p]&&g.best[p].slice(0,4)!==nextMv.from+nextMv.to)arrows.push(uciArrow(g.best[p],GREEN))}
 drawBoard("rboard",new Chess(fen),g.me,{last:p>0?{from:RC.mv[p-1].from,to:RC.mv[p-1].to}:null,arrows:arrows.filter(Boolean)});
 $("#rply").textContent=p===RC.f.length-1?"Endstellung":`Vor ${Math.floor(p/2)+1}${p%2?"…":"."} ${nextMv.san}`;
 const motTxt=Object.entries(g.mot).map(([k,v])=>k+(v>1?" ×"+v:"")).join(", ")||"keine";
 let info=`Genauigkeit: du ${g.acc??"–"} %, Gegner ${g.accOpp??"–"} %\nFehlerbilder: ${esc(motTxt)}`;
 if(nextMv){const c=g.cls[p],mover=nextMv.color;const wb=mover==="w"?g.W[p]:100-g.W[p],wa=mover==="w"?g.W[p+1]:100-g.W[p+1];
  if(c>0){let bs="";try{const t=new Chess(fen);const bm=t.move({from:g.best[p].slice(0,2),to:g.best[p].slice(2,4),promotion:g.best[p][4]||"q"});bs=bm?bm.san:""}catch(e){}
   info=`<b>${["","Ungenauigkeit","Fehler","Patzer"][c]}: ${nextMv.san}</b>\nGewinnchance ${Math.round(wb)} % → ${Math.round(wa)} %. Besser war <b>${bs}</b> (grüner Pfeil).`;
   const b1=g.pv&&g.pv[p],b2=g.pv&&g.pv[p+1];
   if(b1||b2)info+=`<div class="row">${b1?'<button class="btn" id="rvbest">'+IC.play+'Beste Fortsetzung</button>':""}${b2?`<button class="btn" id="rvthreat">${IC.play}Was nach ${nextMv.san} droht</button>`:""}</div>`}
  else info+=`\nGrau: gespielter Zug${g.best[p]&&g.best[p].slice(0,4)!==nextMv.from+nextMv.to?", grün: Engine-Zug":""}.`}
 $("#rinfo").className="fb"+(nextMv&&g.cls[p]>=2?" bad":nextMv&&g.cls[p]===1?" warn":"");$("#rinfo").innerHTML=info;
 if($("#rvbest"))$("#rvbest").onclick=()=>startVar(fen,g.pv[p],"best");
 if($("#rvthreat"))$("#rvthreat").onclick=()=>startVar(RC.f[p+1],g.pv[p+1],"threat",nextMv.san)}
function drawGraph(g,p){const n=g.W.length,x=i=>n>1?i*300/(n-1):0,y=w=>100-w;const pts=g.W.map((w,i)=>x(i)+","+y(w)).join(" ");
 let dots="";g.cls.forEach((c,k)=>{if(c>=2){const mine=RC.mv[k].color===g.me;dots+=`<circle cx="${x(k+1)}" cy="${y(g.W[k+1])}" r="${mine?3.2:2.2}" fill="${c===3?RED:"#d39a4c"}" opacity="${mine?1:.5}"/>`}});
 $("#rgraph").innerHTML=`<polygon points="0,100 ${pts} 300,100" fill="var(--sq-l)"/><line x1="0" x2="300" y1="50" y2="50" stroke="var(--line)"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><line x1="${x(p)}" x2="${x(p)}" y1="0" y2="100" stroke="var(--text)" stroke-width="1" vector-effect="non-scaling-stroke"/>${dots}`}
$("#rfirst").onclick=()=>step("first");$("#rprev").onclick=()=>step(-1);$("#rnext").onclick=()=>step(1);$("#rlast").onclick=()=>step("last");$("#rpgn").onclick=()=>{R.pgn=!R.pgn;renderReview()};
document.addEventListener("keydown",e=>{if(VIEW!=="review"||e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;if(e.key==="ArrowLeft")step(-1);if(e.key==="ArrowRight")step(1)});

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
  $("#pfb").className="fb "+(c>=2?"bad":c===1?"warn":"good");$("#pfb").textContent=c===0?"Guter Zug.":`${["","?! Ungenau","? Fehler","?? Patzer"][c]} (${Math.round(wb)} % → ${Math.round(wa)} %). Besser war ${bs}.`;
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
function nextCard(){let d=dueCards(),ahead=false;if(!d.length&&AHEAD){d=aheadCards();ahead=true}
 Z={c:d[0]||null,g:null,done:false,sel:null,arrow:null,last:null};const rest=aheadCards();$("#zahead").hidden=!!Z.c||!rest.length;
 if(!Z.c){$("#zstatus").textContent=S.cards.length?"Heute nichts mehr fällig":"Noch keine Fehlerstellungen";$("#zfb").className="fb";
  const t=today(),wait=S.cards.filter(c=>isNew(c)&&c.due<=t).length,fut=S.cards.filter(c=>c.due>t).map(c=>c.due).sort()[0];
  $("#zfb").textContent=S.cards.length?`${S.cards.length} Stellungen im Stapel.${wait?` ${wait} neue warten (Tageslimit ${S.newDay}).`:""}${fut?` Nächste fällig am ${fmtD(fut)}.`:""}${rest.length?" Mit «Trotzdem üben» kannst du vorausarbeiten.":""}`:"Analysierte Partien liefern Stellungen ab dem Folgetag.";drawBoard("zboard",new Chess(),"w",{});return}
 Z.g=new Chess(Z.c.fen);$("#zstatus").textContent=`Finde den besten Zug für ${Z.g.turn()==="w"?"Weiss":"Schwarz"} · ${ahead?`vorausüben, ${d.length} übrig`:`${d.length} fällig`}`;
 $("#zfb").className="fb";$("#zfb").textContent=`In der Partie gespielt: ${Z.c.played} (${Z.c.motif}).`;zdraw()}
function zdraw(){if(!Z.g)return;const tg=Z.sel?Z.g.moves({square:Z.sel,verbose:true}).map(m=>m.to):null;drawBoard("zboard",Z.g,new Chess(Z.c.fen).turn(),{sel:Z.sel,tg,last:Z.last,arrows:Z.arrow?[Z.arrow]:[],onClick:zSq})}
function zSq(sq){if(!Z.c||Z.done||Z.busy)return;const me=new Chess(Z.c.fen).turn();if(Z.sel){const m=pickMove(Z.g,Z.sel,sq);if(m){Z.sel=null;zTry(m);return}}
 const p=Z.g.get(sq);Z.sel=p&&p.color===me&&Z.sel!==sq?sq:null;zdraw()}
async function zTry(m){Z.busy=true;Z.g.move(m);Z.last={from:m.from,to:m.to};zdraw();let ok=m.san===Z.c.best;
 if(!ok){$("#zfb").textContent="Stockfish prüft …";const t=new Chess(Z.g.fen());let wa;if(t.game_over())wa=t.in_checkmate()?100:50;else{const ev=await E.eval(Z.g.fen(),{depth:12,prio:true});wa=100-winOf(Z.g.fen(),ev)}ok=wa>=Z.c.wb-4}
 Z.busy=false;grade(ok,m.san)}
function grade(ok,san){Z.done=true;const c=Z.c;const dd=day();dd.r++;if(isNew(c))dd.nw=(dd.nw||0)+1;c.rev=(c.rev||0)+1;c.last=today();
 if(ok){c.ivl=c.ivl?Math.round(c.ivl*2.6):1;c.due=addDays(c.ivl);$("#zfb").className="fb good";$("#zfb").textContent=`Richtig: ${san}${san!==c.best?" (gleichwertig zu "+c.best+")":""}. Wieder in ${c.ivl} Tag(en).`;
  if(c.ivl>60){S.cards=S.cards.filter(x=>x!==c);$("#zfb").textContent+=" Gelernt – entfernt."}}
 else{c.ivl=0;c.due=addDays(1);const g=new Chess(c.fen);const m=g.moves({verbose:true}).find(x=>x.san===c.best);Z.g=g;Z.last=null;Z.arrow=m?{from:m.from,to:m.to,c:GREEN}:null;
  $("#zfb").className="fb bad";$("#zfb").textContent=`${san?san+" reicht nicht.":"Aufgelöst."} Lösung: ${c.best}.${c.line?" Variante: "+c.line+".":""} ${TIP[c.motif]||""}`;zdraw()}save()}
$("#zsol").onclick=()=>{if(Z.c&&!Z.done&&!Z.busy)grade(false,"")};$("#znext").onclick=nextCard;$("#zahead").onclick=()=>{AHEAD=true;nextCard()};
$("#zgame").onclick=()=>{if(!Z.c)return;const g=S.games.find(x=>x.id===Z.c.gid);if(!g)return;R.id=g.id;R.ply=Z.c.ply;show("review")};

// ---------- Setup ----------
function renderSet(){$("#suser").value=S.user;$("#sper").value=S.per;$("#sdepth").value=S.depth;$("#snew").value=S.newDay;
 let bytes=0;try{bytes=(localStorage.getItem(KEY)||"").length}catch(e){}$("#sinfo").textContent=`${S.games.length} Partien, ${S.cards.length} Puzzle-Stellungen, ${S.queue.length} in Warteschlange · ${(bytes/1024).toFixed(0)} KB lokal gespeichert`}
$("#ssave").onclick=()=>{const u=$("#suser").value.trim();if(u!==S.user){S.user=u;S.lastSync=0}S.per=+$("#sper").value;S.depth=+$("#sdepth").value;save();syncLabel();sync(true);show("today")};
$("#sper").onchange=()=>{S.per=+$("#sper").value;save()};$("#sdepth").onchange=()=>{S.depth=+$("#sdepth").value;save()};$("#snew").onchange=()=>{S.newDay=+$("#snew").value;save()};
$("#spgnadd").onclick=()=>{const pgn=$("#spgn").value.trim();if(!pgn)return;const t=new Chess();if(!t.load_pgn(pgn,{sloppy:true})){banner("PGN nicht lesbar.");return}
 const h=t.header();S.queue.push({id:h.Link||"pgn-"+Date.now(),src:"pgn",pgn,me:$("#spgncol").value,end:Date.now()/1e3});save();$("#spgn").value="";processQueue();show("today")};
$("#sexp").onclick=async()=>{const t=exportText(),ta=$("#sexpt");ta.value=t;ta.hidden=false;try{await navigator.clipboard.writeText(t);$("#sexp").textContent="Kopiert"}catch(e){ta.select()}};
$("#sreset").onclick=()=>{if(confirm("Alle Partien, Statistiken und Puzzles löschen?")){const u=S.user;Object.assign(S,def(),{user:u});save();renderSet()}};

// ---------- Start ----------
$("#plevel").value=S.level;syncLabel();renderDash();
if(S.queue.length)processQueue();sync(false);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){sync(false);if(S.queue.length)processQueue()}});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
