/* Schach-Coach – Analyse-Kern (ohne DOM) */
const VAL={p:1,n:3,b:3,r:5,q:9,k:0};
const MATE_W=v=>v>0?100:0;
function winPct(cp){cp=Math.max(-1000,Math.min(1000,cp));return 50+50*(2/(1+Math.exp(-0.00368208*cp))-1)}
function moveAcc(drop){return Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*Math.max(0,drop))-3.1669))}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function npm(fen){let m=0;for(const c of fen.split(" ")[0]){const t=c.toLowerCase();if("nbrq".includes(t))m+=VAL[t]}return m}
function parseClocks(pgn){const out=[];const re=/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/g;let m;while((m=re.exec(pgn)))out.push(+m[1]*3600+ +m[2]*60+ +m[3]);return out}
function baseTime(tc){if(!tc||tc.includes("/"))return null;const b=parseFloat(tc.split("+")[0]);return isFinite(b)?b:null}
function openingFromUrl(u){if(!u)return null;const slug=(u.split("/openings/")[1]||"").split("?")[0];if(!slug)return null;
 const t=[];for(const x of slug.split("-")){if(/^\d/.test(x)||x==="")break;t.push(x)}if(!t.length)return null;
 const name=t.join(" ");const END=["Game","Defense","Opening","Attack","Gambit","System"];let fam=[];
 for(const x of t){fam.push(x);if(END.includes(x))break}if(fam.length===t.length&&!END.includes(fam[fam.length-1]))fam=t.slice(0,3);
 return{name,family:fam.join(" ")}}
function uciToMove(fen,uci){if(!uci||uci==="(none)")return null;const g=new Chess(fen);return g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"})}
// Bewertung -> Gewinn% aus Sicht Weiss
function whiteWin(fen,ev){const stm=fen.split(" ")[1];let w;if(ev.mate!=null)w=ev.mate>0?100:ev.mate<0?0:(stm==="w"?0:100);else w=winPct(ev.cp);return stm==="w"?w:100-w}
function terminalWin(g){if(g.in_checkmate())return g.turn()==="w"?0:100;return 50}
function classify(drop){return drop>=15?3:drop>=10?2:drop>=5?1:0}
const MARK=["","?!","?","??"];
/* analyzeGame: src = {sans|pgn, me, meta}, engine.eval(fen,{depth}) -> {best,cp,mate}; onProg(i,n) */
/* pvLine: UCI-Variante -> SAN mit Zugnummern, max. n Halbzüge (Standard 3 pro Seite) */
function pvLine(fen,uci,n=6){if(!uci||!uci.length)return"";const g=new Chess(fen);let num=+fen.split(" ")[5]||1;const out=[];
 for(const u of uci.slice(0,n)){const w=g.turn()==="w";const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||"q"});if(!m)break;
  if(w)out.push(num+". "+m.san);else{out.push(out.length?m.san:num+"… "+m.san);num++}}return out.join(" ")}
/* analyzeGame: deep = Tiefe für die Nachrechnung von Fehlern/Patzern (optional), engine.eval liefert optional pv (UCI-Liste) */
async function analyzeGame(src,engine,depth,onProg,deep){
 const g=new Chess();let hdr={};
 if(src.pgn){if(!g.load_pgn(src.pgn,{sloppy:true}))throw new Error("PGN nicht lesbar");hdr=g.header()}
 else{for(const s of src.sans)g.move(s,{sloppy:true})}
 const hist=g.history({verbose:true});const start=hdr.FEN||"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
 const b=new Chess(start);const fens=[b.fen()];for(const m of hist){b.move(m);fens.push(b.fen())}
 const W=[],best=[],mateFor=[],pvs=[];
 const evalAt=async(i,d)=>{const t=new Chess(fens[i]);
  if(t.game_over()){W[i]=terminalWin(t);best[i]=null;mateFor[i]=0;pvs[i]=null;return}
  const ev=await engine.eval(fens[i],{depth:d});W[i]=whiteWin(fens[i],ev);best[i]=ev.best;mateFor[i]=ev.mate||0;pvs[i]=ev.pv||(ev.best?[ev.best]:null)};
 for(let i=0;i<fens.length;i++){onProg&&onProg(i,fens.length);await evalAt(i,depth)}
 const dropAt=i=>{const m=hist[i],wb=m.color==="w"?W[i]:100-W[i],wa=m.color==="w"?W[i+1]:100-W[i+1];
  return best[i]&&best[i].slice(0,4)===m.from+m.to?0:Math.max(0,wb-wa)};
 // Fehler/Patzer tiefer nachrechnen (Horizont-Effekt): Stellung vor und nach dem Zug
 if(deep>depth){const re=new Set();for(let i=0;i<hist.length;i++)if(classify(dropAt(i))>=2){re.add(i);re.add(i+1)}
  const L=[...re].sort((a,b)=>a-b);for(let k=0;k<L.length;k++){onProg&&onProg(k,L.length,"deep");await evalAt(L[k],deep)}}
 const me=src.me;const clocks=src.pgn?parseClocks(src.pgn):[];const base=baseTime(hdr.TimeControl||src.meta&&src.meta.tc);
 const cls=[],accMe=[],accOp=[],ph={o:[],m:[],e:[]},mot={},cards=[];const ex=[];const add=(k,i)=>{mot[k]=(mot[k]||0)+1;ex.push({m:k,ply:i})};
 let flags={},moved=new Set(),castled=false,myN=0;
 for(let i=0;i<hist.length;i++){const m=hist[i],mover=m.color,isMe=mover===me;
  const wb=mover==="w"?W[i]:100-W[i];const drop=dropAt(i);
  const c=classify(drop);cls.push(c);(isMe?accMe:accOp).push(moveAcc(drop));if(!isMe)continue;
  myN++;const phase=myN<=10?"o":npm(fens[i+1])<=26?"e":"m";ph[phase].push(moveAcc(drop));
  if(c>=2){const bm=uciToMove(fens[i],best[i]);const reply=best[i+1]?uciToMove(fens[i+1],best[i+1]):null;let motif;
   if(mateFor[i]>0&&!(mateFor[i+1]<0))motif="Matt übersehen";
   else if(mateFor[i+1]>0)motif="Matt zugelassen";
   else if(reply&&reply.captured&&VAL[reply.captured]>=3&&VAL[reply.captured]>(m.captured?VAL[m.captured]:0))motif="Figur eingestellt";
   else if(bm&&bm.captured&&VAL[bm.captured]>=3&&!m.captured)motif="Schlagchance verpasst";
   else motif="Positionsfehler";
   add(motif,i);
   const clk=clocks[i];if(base&&clk!=null&&clk<Math.max(15,base*.1))add("Zeitnot",i);
   if(bm)cards.push({fen:fens[i],best:bm.san,played:m.san,motif,wb:Math.round(wb),ply:i,line:pvLine(fens[i],pvs[i])});}
  if(m.piece==="q"&&myN<=5&&!flags.q){flags.q=1;add("Dame zu früh",i)}
  if("nb".includes(m.piece)&&myN<=8&&!m.captured&&moved.has(m.from)&&!flags.d){flags.d=1;add("Figur doppelt gezogen",i)}
  moved.delete(m.from);moved.add(m.to);if(m.flags.includes("k")||m.flags.includes("q"))castled=true;
  if(myN===12&&!castled&&!flags.c){const k=new Chess(fens[i+1]).get(me==="w"?"e1":"e8");if(k&&k.type==="k"){flags.c=1;add("Nicht rochiert",i)}}}
 const r=hdr.Result||src.result||"*";const res=r==="1-0"?(me==="w"?1:0):r==="0-1"?(me==="b"?1:0):r==="1/2-1/2"?.5:(src.res??null);
 const op=openingFromUrl(hdr.ECOUrl);
 const phA={};for(const k in ph)phA[k]=ph[k].length?Math.round(mean(ph[k])):null;
 // Varianten nur rund um Ungenauigkeiten speichern (Speicherplatz): Bestfortsetzung vor dem Zug, Widerlegung danach
 const pv=fens.map((f,i)=>cls[i]>=1||(i>0&&cls[i-1]>=1)?pvLine(f,pvs[i])||null:null);
 return{sans:hist.map(m=>m.san),start:start,W:W.map(x=>Math.round(x)),best,cls,pv,me,res,
  acc:accMe.length?Math.round(mean(accMe)):null,accOpp:accOp.length?Math.round(mean(accOp)):null,ph:phA,mot,ex,cards,
  white:hdr.White||src.meta?.white||"",black:hdr.Black||src.meta?.black||"",wElo:+hdr.WhiteElo||null,bElo:+hdr.BlackElo||null,
  date:(hdr.UTCDate||hdr.Date||"").replace(/\./g,"-"),tc:hdr.TimeControl||"",opening:op?op.name:null,family:op?op.family:null,eco:hdr.ECO||null,link:hdr.Link||null}}
/* Aggregation */
function weaknesses(games){const rec=games.slice(-20);if(!rec.length)return[];const c={};for(const g of rec)for(const k in g.mot)c[k]=(c[k]||0)+g.mot[k];
 return Object.entries(c).map(([k,v])=>[k,v/rec.length]).sort((a,b)=>b[1]-a[1])}
function phaseAcc(games){const rec=games.slice(-20),o={};for(const k of["o","m","e"]){const v=rec.map(g=>g.ph[k]).filter(x=>x!=null);o[k]=v.length?Math.round(mean(v)):null}return o}
function openingStats(games){const o={w:{},b:{}};for(const g of games){if(!g.family||g.res==null)continue;const t=o[g.me][g.family]||(o[g.me][g.family]={n:0,pts:0,acc:[]});t.n++;t.pts+=g.res;if(g.acc!=null)t.acc.push(g.acc)}
 const f=x=>Object.entries(x).map(([k,v])=>({name:k,n:v.n,score:Math.round(100*v.pts/v.n),acc:v.acc.length?Math.round(mean(v.acc)):null})).sort((a,b)=>b.n-a.n);return{w:f(o.w),b:f(o.b)}}
if(typeof module!=="undefined")module.exports={analyzeGame,pvLine,baseTime,openingFromUrl,parseClocks,weaknesses,phaseAcc,openingStats,winPct,moveAcc,classify};
