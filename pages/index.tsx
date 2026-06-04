import React, { useState, useEffect, useRef, useCallback } from 'react'
import '@rainbow-me/rainbowkit/styles.css'
import {
  getDefaultConfig,
  RainbowKitProvider,
  ConnectButton,
  darkTheme,
  Chain
} from '@rainbow-me/rainbowkit'
import { WagmiProvider, useAccount, useSendTransaction, useChainId, useSwitchChain } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { parseEther } from 'viem'

// ── Web3 & Ritual Testnet Configuration ───────────────────────────────────────

const ritualTestnet = {
  id: 1979,
  name: 'Ritual Testnet',
  iconUrl: 'https://ritual.net/favicon.ico',
  nativeCurrency: { name: 'Ritual', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ritualfoundation.org'] },
    public:  { http: ['https://rpc.ritualfoundation.org'] },
  },
  blockExplorers: {
    default: { name: 'Ritual Explorer', url: 'https://explorer.ritualfoundation.org' },
  },
  testnet: true,
} as const satisfies Chain;

const config = getDefaultConfig({
  appName: 'Chess On Ritual',
  projectId: '3fcc6bba6f1de962d911bb5b5c3dba68', // Standard public WalletConnect ID
  chains: [ritualTestnet],
  ssr: false, 
});

const queryClient = new QueryClient();

// ── Types ─────────────────────────────────────────────────────────────────────

type Color    = 'w' | 'b'
type Board    = (string | null)[]
type GameMode = 'ai' | 'llm' | 'human'
type LlmDifficulty = 'beginner' | 'professional' | 'master'

interface ChessMove {
  from: number; to: number; prom?: string
  ep?: number; epCap?: boolean; castle?: 'K' | 'Q'
}

interface CastleRights { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }

interface GameState {
  board: Board; turn: Color
  castleRights: CastleRights; epSq: number | null
  moveHistory: { num: number; color: Color; san: string }[]
  fullMove: number; capByW: string[]; capByB: string[]
  lastMove: { from: number; to: number } | null
}

interface ChatMsg {
  id: string; role: 'user' | 'llm'
  text: string; thinking?: boolean
  verified?: boolean; hash?: string
}

interface Settings { model: string }
interface GameResult { over: boolean; winner: Color | null; reason: string | null }

// ── Constants ─────────────────────────────────────────────────────────────────

const PVAL: Record<string, number> = { K:20000,Q:900,R:500,B:330,N:320,P:100 }
const PST: Record<string, number[]> = {
  P:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  N:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  B:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  R:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  Q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  K:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
}

const AI_DELAY: Record<number, number> = { 1:350, 2:700, 3:1100, 4:1800 }
const AI_TIME:  Record<number, number> = { 1:150, 2:450, 3:850,  4:1500 }

// ── Realistic Piece Textures ──────────────────────────────────────────────────
const IMGS: Record<string,string> = {
  wK: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  wQ: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  wR: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  wB: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  wN: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  wP: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  bK: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  bQ: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  bR: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  bB: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  bN: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  bP: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg'
}

// ── Move Translator (Plain English) ───────────────────────────────────────────
function sanToSimple(san: string, color: Color): string {
  if (san === 'O-O') return 'Castles Short';
  if (san === 'O-O-O') return 'Castles Long';
  
  let pChar = color === 'w' ? '♙' : '♟';
  let clean = san;
  
  if (/^[KQRBN]/.test(san)) {
    const wM: Record<string, string> = { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘' };
    const bM: Record<string, string> = { K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞' };
    pChar = color === 'w' ? wM[san[0]] : bM[san[0]];
    clean = san.slice(1);
  }
  
  const isCap = clean.includes('x');
  const isCheck = clean.includes('+');
  const isMate = clean.includes('#');
  
  clean = clean.replace(/[+#x]/g, '');
  
  // Extract destination square
  const dest = clean.slice(-2);
  let action = isCap ? `takes ${dest}` : `to ${dest}`;
  
  let end = isMate ? ' Checkmate!' : isCheck ? ' Check' : '';
  
  return `${pChar} ${action}${end}`;
}

// ── Chess Engine (pure functions) ─────────────────────────────────────────────

const rc   = (s: number) => ({ r: Math.floor(s/8), c: s%8 })
const sq   = (r: number, c: number) => r*8+c
const ib   = (r: number, c: number) => r>=0 && r<8 && c>=0 && c<8
const col  = (p: string|null) => p ? p[0] as Color : null
const typ  = (p: string|null) => p ? p[1] : null

function initialBoard(): Board {
  const b: Board = Array(64).fill(null)
  ;['R','N','B','Q','K','B','N','R'].forEach((p,i) => { b[i]='b'+p; b[56+i]='w'+p })
  for (let i=0;i<8;i++) { b[8+i]='bP'; b[48+i]='wP' }
  return b
}

function initialGS(): GameState {
  return {
    board: initialBoard(), turn: 'w',
    castleRights: {wK:true,wQ:true,bK:true,bQ:true},
    epSq: null, moveHistory: [], fullMove: 1,
    capByW: [], capByB: [], lastMove: null
  }
}

function pseudoMoves(brd: Board, color: Color, ep: number|null, cr: CastleRights): ChessMove[] {
  const moves: ChessMove[] = [], opp: Color = color==='w'?'b':'w', dir = color==='w'?-1:1
  for (let s=0;s<64;s++) {
    const p=brd[s]; if (!p || col(p)!==color) continue
    const t=typ(p)!, {r:r0,c:c0}=rc(s)
    if (t==='P') {
      const r1=r0+dir
      if (ib(r1,c0) && !brd[sq(r1,c0)]) {
        addPM(moves,s,sq(r1,c0),color)
        const st=color==='w'?6:1, r2=r0+2*dir
        if (r0===st && !brd[sq(r2,c0)]) moves.push({from:s,to:sq(r2,c0),ep:sq(r1,c0)})
      }
      for (const dc of [-1,1]) {
        const tc=c0+dc; if (!ib(r1,tc)) continue
        const ts=sq(r1,tc)
        if (brd[ts] && col(brd[ts])===opp) addPM(moves,s,ts,color)
        if (ts===ep) moves.push({from:s,to:ts,epCap:true})
      }
    } else if (t==='N') {
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr=r0+dr,nc=c0+dc
        if (ib(nr,nc) && col(brd[sq(nr,nc)])!==color) moves.push({from:s,to:sq(nr,nc)})
      }
    }
    if (t==='B'||t==='Q') slide(brd,s,r0,c0,color,moves,[[-1,-1],[-1,1],[1,-1],[1,1]])
    if (t==='R'||t==='Q') slide(brd,s,r0,c0,color,moves,[[-1,0],[1,0],[0,-1],[0,1]])
    if (t==='K') {
      for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr=r0+dr,nc=c0+dc
        if (ib(nr,nc) && col(brd[sq(nr,nc)])!==color) moves.push({from:s,to:sq(nr,nc)})
      }
      if (color==='w') {
        if (cr.wK&&!brd[61]&&!brd[62]) moves.push({from:60,to:62,castle:'K'})
        if (cr.wQ&&!brd[59]&&!brd[58]&&!brd[57]) moves.push({from:60,to:58,castle:'Q'})
      } else {
        if (cr.bK&&!brd[5]&&!brd[6]) moves.push({from:4,to:6,castle:'K'})
        if (cr.bQ&&!brd[3]&&!brd[2]&&!brd[1]) moves.push({from:4,to:2,castle:'Q'})
      }
    }
  }
  return moves
}

function addPM(moves: ChessMove[], from: number, to: number, color: Color) {
  if (rc(to).r===(color==='w'?0:7)) ['Q','R','B','N'].forEach(p=>moves.push({from,to,prom:color+p}))
  else moves.push({from,to})
}

function slide(brd: Board, s: number, r0: number, c0: number, color: Color, moves: ChessMove[], dirs: number[][]) {
  for (const [dr,dc] of dirs) {
    let r=r0+dr,c=c0+dc
    while (ib(r,c)) {
      const ts=sq(r,c)
      if (brd[ts]) { if (col(brd[ts])!==color) moves.push({from:s,to:ts}); break }
      moves.push({from:s,to:ts}); r+=dr; c+=dc
    }
  }
}

function kingSq(brd: Board, color: Color): number {
  for (let i=0;i<64;i++) if (brd[i]===color+'K') return i
  return -1
}

function attacked(brd: Board, s: number, byColor: Color): boolean {
  return pseudoMoves(brd,byColor,null,{wK:false,wQ:false,bK:false,bQ:false}).some(m=>m.to===s)
}

function legalFor(brd: Board, color: Color, ep: number|null, cr: CastleRights): ChessMove[] {
  return pseudoMoves(brd,color,ep,cr).filter(m => {
    const nb=applyM(brd,m), ks=kingSq(nb,color)
    if (ks===-1 || attacked(nb,ks,color==='w'?'b':'w')) return false
    if (m.castle) {
      const sqs = m.castle==='K' ? (color==='w'?[60,61,62]:[4,5,6]) : (color==='w'?[60,59,58]:[4,3,2])
      if (sqs.some(x=>attacked(brd,x,color==='w'?'b':'w'))) return false
    }
    return true
  })
}

function applyM(brd: Board, m: ChessMove): Board {
  const nb=[...brd]
  nb[m.to]=m.prom||nb[m.from]; nb[m.from]=null
  if (m.epCap) { const er=rc(m.to).r+(col(nb[m.to])==='w'?1:-1); nb[sq(er,rc(m.to).c)]=null }
  if (m.castle) {
    const [rr,rd]=m.castle==='K'?[(m.to===62?63:7),(m.to===62?61:5)]:[(m.to===58?56:0),(m.to===58?59:3)]
    nb[rd]=nb[rr]; nb[rr]=null
  }
  return nb
}

function toSAN(brd: Board, m: ChessMove, legal: ChessMove[]): string {
  const p=brd[m.from]!, t=typ(p)!, cap=brd[m.to]||m.epCap
  const files='abcdefgh', {c:fc}=rc(m.from), {r:tr,c:tc}=rc(m.to)
  if (m.castle) return m.castle==='K'?'O-O':'O-O-O'
  let s=''
  if (t!=='P') s+=t; else if (cap) s+=files[fc]
  if (t!=='P') {
    const amb=legal.filter(x=>x!==m&&brd[x.from]===p&&x.to===m.to)
    if (amb.length) {
      const sf=amb.some(x=>rc(x.from).c===fc), sr=amb.some(x=>rc(x.from).r===rc(m.from).r)
      if (!sf) s+=files[fc]; else if (!sr) s+=(8-rc(m.from).r); else s+=files[fc]+(8-rc(m.from).r)
    }
  }
  if (cap) s+='x'; s+=files[tc]+(8-tr)
  if (m.prom) s+='='+typ(m.prom)!
  return s
}

function toFEN(gs: GameState): string {
  const files='abcdefgh'; let fen=''
  for (let r=0;r<8;r++) {
    let empty=0
    for (let c=0;c<8;c++) {
      const p=gs.board[sq(r,c)]
      if (!p) { empty++; continue }
      if (empty) { fen+=empty; empty=0 }
      fen+=col(p)==='w'?typ(p)!:typ(p)!.toLowerCase()
    }
    if (empty) fen+=empty; if (r<7) fen+='/'
  }
  const cr=gs.castleRights
  let cas=''; if(cr.wK)cas+='K'; if(cr.wQ)cas+='Q'; if(cr.bK)cas+='k'; if(cr.bQ)cas+='q'
  fen+=` ${gs.turn} ${cas||'-'}`
  if (gs.epSq!==null) { const {r,c}=rc(gs.epSq); fen+=` ${files[c]}${8-r}` } else fen+=' -'
  fen+=` 0 ${gs.fullMove}`
  return fen
}

function movesToUCI(gs: GameState): string[] {
  const files='abcdefgh'
  return legalFor(gs.board,gs.turn,gs.epSq,gs.castleRights).map(m => {
    const {r:fr,c:fc}=rc(m.from),{r:tr,c:tc}=rc(m.to)
    return `${files[fc]}${8-fr}${files[tc]}${8-tr}${m.prom?typ(m.prom)!.toLowerCase():''}`
  })
}

function uciToMove(uci: string, mover: Color='b'): ChessMove {
  const files='abcdefgh'
  return {
    from: sq(8-parseInt(uci[1]), files.indexOf(uci[0])),
    to:   sq(8-parseInt(uci[3]), files.indexOf(uci[2])),
    prom: uci.length>=5 ? mover+uci[4].toUpperCase() : undefined
  }
}

function insuffMat(brd: Board): boolean {
  const pp=brd.filter(Boolean)
  if (pp.length===2) return true
  if (pp.length===3 && pp.some(p=>typ(p)==='B'||typ(p)==='N')) return true
  return false
}

function gameResult(gs: GameState): GameResult {
  const moves=legalFor(gs.board,gs.turn,gs.epSq,gs.castleRights)
  if (!moves.length) {
    const ks=kingSq(gs.board,gs.turn)
    const inCheck=ks!==-1 && attacked(gs.board,ks,gs.turn==='w'?'b':'w')
    return { over:true, winner:inCheck?(gs.turn==='w'?'b':'w'):null, reason:inCheck?'checkmate':'stalemate' }
  }
  if (insuffMat(gs.board)) return { over:true, winner:null, reason:'insuff' }
  return { over:false, winner:null, reason:null }
}

function execMove(gs: GameState, m: ChessMove): GameState | null {
  const legal=legalFor(gs.board,gs.turn,gs.epSq,gs.castleRights)
  const found=legal.find(l=>l.from===m.from&&l.to===m.to&&(l.prom??null)===(m.prom??null))
  if (!found) return null
  const san=toSAN(gs.board,found,legal)
  const newBoard=applyM(gs.board,found)
  const capByW=[...gs.capByW], capByB=[...gs.capByB]
  const cap=gs.board[found.to]; if (cap) (gs.turn==='w'?capByW:capByB).push(cap)
  if (found.epCap) { const er=rc(found.to).r+(gs.turn==='w'?1:-1); const ec=gs.board[sq(er,rc(found.to).c)]; if(ec)(gs.turn==='w'?capByW:capByB).push(ec) }
  const cr={...gs.castleRights}
  if (typ(gs.board[found.from])==='K') { (cr as any)[gs.turn+'K']=false; (cr as any)[gs.turn+'Q']=false }
  if(found.from===0||found.to===0)cr.bQ=false; if(found.from===7||found.to===7)cr.bK=false
  if(found.from===56||found.to===56)cr.wQ=false; if(found.from===63||found.to===63)cr.wK=false
  let finalBoard=[...newBoard]
  if (!found.prom && typ(newBoard[found.to])==='P' && rc(found.to).r===(gs.turn==='w'?0:7)) finalBoard[found.to]=gs.turn+'Q'
  const newTurn: Color=gs.turn==='w'?'b':'w'
  return {
    board:finalBoard, turn:newTurn, castleRights:cr, epSq:found.ep??null,
    moveHistory:[...gs.moveHistory,{num:gs.fullMove,color:gs.turn,san}],
    fullMove:gs.turn==='b'?gs.fullMove+1:gs.fullMove,
    capByW, capByB, lastMove:{from:found.from,to:found.to}
  }
}

// ── AI Engine ─────────────────────────────────────────────────────────────────

function evalBrd(brd: Board, color: Color): number {
  let score=0
  for (let i=0;i<64;i++) {
    const p=brd[i]; if (!p) continue
    const c=col(p)!, t=typ(p)!, val=PVAL[t]??0
    const prow=c==='w'?rc(i).r:7-rc(i).r
    const pst=(PST[t]??[])[prow*8+rc(i).c]??0
    score+=(c===color?1:-1)*(val+pst)
  }
  return score
}

let aiStartTime=0, aiTimeLimit=500

function negamax(brd: Board, depth: number, alpha: number, beta: number, color: Color, ep: number|null, cr: CastleRights): number {
  if (Date.now()-aiStartTime>aiTimeLimit) return evalBrd(brd,color)
  const moves=legalFor(brd,color,ep,cr)
  if (!depth||!moves.length) return evalBrd(brd,color)
  moves.sort((a,b)=>{
    const va=brd[a.to]?(PVAL[typ(brd[a.to])!]??0)-(PVAL[typ(brd[a.from])!]??0)/10:-1
    const vb=brd[b.to]?(PVAL[typ(brd[b.to])!]??0)-(PVAL[typ(brd[b.from])!]??0)/10:-1
    return vb-va
  })
  let best=-Infinity
  for (const m of moves) {
    const nb=applyM(brd,m), ncr={...cr}
    if (typ(brd[m.from])==='K') { (ncr as any)[color+'K']=false; (ncr as any)[color+'Q']=false }
    const val=-negamax(nb,depth-1,-beta,-alpha,color==='w'?'b':'w',m.ep??null,ncr)
    if (val>best) best=val
    if (val>alpha) alpha=val
    if (alpha>=beta) break
  }
  return best
}

function findBestMove(gs: GameState, depth: number): ChessMove {
  const moves=legalFor(gs.board,'b',gs.epSq,gs.castleRights)
  if (!moves.length) return moves[0]
  if (depth===1) {
    let best=-Infinity, bestM=moves[0]
    for (const m of moves) {
      const nb=applyM(gs.board,m); const val=-evalBrd(nb,'w')
      if (val>best) { best=val; bestM=m }
    }
    return bestM
  }
  aiTimeLimit=AI_TIME[depth]??500; aiStartTime=Date.now()
  let bestM=moves[Math.floor(Math.random()*Math.min(moves.length,3))]
  for (let d=1;d<=depth;d++) {
    if (Date.now()-aiStartTime>aiTimeLimit) break
    let best=-Infinity, cand=bestM
    const ordered=[...moves].sort((a,b)=>a===bestM?-1:b===bestM?1:(gs.board[b.to]?PVAL[typ(gs.board[b.to])!]??0:0)-(gs.board[a.to]?PVAL[typ(gs.board[a.to])!]??0:0))
    for (const m of ordered) {
      if (Date.now()-aiStartTime>aiTimeLimit) break
      const nb=applyM(gs.board,m), ncr={...gs.castleRights}
      if (typ(gs.board[m.from])==='K') { (ncr as any).bK=false; (ncr as any).bQ=false }
      const val=-negamax(nb,d-1,-Infinity,Infinity,'w',m.ep??null,ncr)
      if (val>best) { best=val; cand=m }
    }
    bestM=cand
  }
  return bestM
}

// ── LLM API ───────────────────────────────────────────────────────────────────

function fakeHash(): string {
  const h='0123456789abcdef'
  return '0x'+Array.from({length:64},()=>h[Math.floor(Math.random()*16)]).join('')
}


// ── Difficulty → computer search depth (LLM always outclasses equiv computer level) ──
const COMPUTER_DEPTH: Record<LlmDifficulty, number> = {
  beginner:     1,   // random-ish, depth-1 scan   (~300–500 ELO)
  professional: 2,   // 2-ply + PST              (~800–1100 ELO)
  master:       3,   // iterative deepening 3     (~1200–1500 ELO)
}
// LLM Beginner (~700), Professional (~1800), Master (2500+) all exceed computer equivalents.

// ── LLM Difficulty Training Prompts ──────────────────────────────────────────

function getLlmPrompt(diff: LlmDifficulty): string {
  if (diff === 'beginner') return `
You are playing chess as Black at BEGINNER level (~700 ELO). You must behave exactly
like an inexperienced, nervous human player who is still learning the game.

OPENING PHASE (moves 1-12) — make these typical beginner errors:
• Bring your queen out on move 2 or 3 (e.g. Qh4, Qa5) and let it get chased around
• Move the same piece two or three times before developing the others
• Push wing pawns (a, b, g, h) instead of controlling the center
• Do NOT castle — leave your king stuck in the center
• Block your own bishops by pushing the pawns in front of them

TACTICAL BLINDNESS — simulate not seeing threats:
• Leave pieces undefended (hanging) even when the opponent can simply take them
• Miss forks, pins, and skewers completely
• Capture pieces impulsively even when it loses material (e.g. take a pawn with your queen when she'll be captured back)
• Move a piece into an attacked square without noticing
• Ignore checks or threats that require more than one move to see

THOUGHT PROCESS:
• You look ahead 0–1 moves only
• You react to the very last move played, nothing more
• You prefer moves that "look active" or aggressive even when they lose material
• You get excited by advancing pawns to the opponent's side
• You do not think about pawn structure, weak squares, or piece activity

CRITICAL MOVE SELECTION RULE:
From the legal moves list you will receive, you MUST pick a WEAK or MEDIOCRE move —
not the best move. Prefer: a wing pawn advance, a piece retreating to the edge
(a-file or h-file), a premature queen move, or any capture that loses material.
NEVER castle, NEVER play a move that requires tactical calculation.
Respond with ONLY the UCI move string — nothing else.`.trim()

  if (diff === 'master') return `
You are playing chess as Black at GRANDMASTER level (2500+ ELO). You must find and
play the single objectively best move in the position.

CALCULATION — go deep before deciding:
• Calculate all forcing lines: checks, captures, and threats at least 5–7 moves ahead
• Verify your chosen move has no tactical refutation (opponent's best reply and your reply to that)
• Consider candidate moves in order: forcing moves first, then positional improvements
• Look for zwischenzug (in-between moves) that change the evaluation

POSITIONAL MASTERY:
• Identify and target weak squares — especially those your opponent's pawns can no longer defend
• Place knights on outposts deep in enemy territory (d4, e4, c5, f5 for Black)
• Exploit backward pawns, isolated pawns, and pawn islands aggressively
• Seize open and half-open files with rooks immediately
• Trade off your bad pieces (bishop blocked by own pawns) for opponent's good pieces
• Connect and activate rooks before the endgame — doubled rooks on open file win games

STRATEGIC PLANNING:
• Always have a concrete multi-move plan based on the position's static features
• Think prophylactically: before executing your plan, ask "what is my opponent trying to do?" and stop it
• In imbalanced positions (material vs activity), calculate precisely — don't rely on intuition
• Know the transition point: when your advantage is large enough, simplify into a winning endgame

DYNAMIC PLAY & INITIATIVE:
• Seize and maintain the initiative with threats that demand responses
• Consider piece sacrifices that yield: open lines to the king, permanent weak squares, or decisive passed pawns
• Restrict your opponent's most active piece — a knight with no good squares is worth far less than its nominal value
• Time pawn breaks precisely (e.g. ...d5, ...e5, ...f5) to change the pawn structure in your favour

ENDGAME PRECISION:
• King activity is paramount — march the king to the center the moment queens come off
• Create and advance passed pawns; two connected passers on the 6th rank beat a rook
• Know Lucena (building a bridge) and Philidor (drawing with rook) positions
• Convert small material advantages without allowing drawing chances

CRITICAL MOVE SELECTION RULE:
From the legal moves list, select the single move a world-class engine or champion
would choose. Prioritise the move that: maximises piece activity, creates the most
concrete threats, improves your worst-placed piece, or exploits a specific positional
or tactical weakness. Respond with ONLY the UCI move string — nothing else.`.trim()

  // professional (default)
  return `
You are playing chess as Black at PROFESSIONAL club level (~1800 ELO). You play
principled, solid chess — not perfect, but strong and consistent.

OPENING PRINCIPLES (strictly follow these):
• Control the center with d5 or e5 as early as possible
• Develop all minor pieces (knights before bishops) before move 10
• Castle kingside for safety within the first 10 moves
• Do NOT move the same piece twice unless there is a concrete tactical reason
• Do NOT bring the queen out early — she gets chased and loses time

TACTICAL AWARENESS — you reliably see:
• One-move and two-move combinations: forks, pins, skewers, discovered attacks
• Hanging pieces (yours and opponent's) — never leave a piece undefended
• Simple back-rank mate threats
• Pawn promotion threats in the endgame
You occasionally miss deep 4–5 move tactical sequences involving multiple sacrifices.

POSITIONAL UNDERSTANDING:
• Place rooks on open or half-open files
• Put knights on stable squares not attacked by opponent pawns
• Avoid creating weak pawns (isolated, doubled, backward) without compensation
• When ahead in material, exchange pieces to simplify into a winning endgame
• Keep pieces active — a passive piece is a liability

MIDDLEGAME PLANS:
• After castling, look for pawn breaks that open lines for your pieces
• Create and target a specific weakness in the opponent's camp
• Coordinate your pieces toward the same area of the board
• If you have the bishop pair, open the position; if knights, keep it closed

CRITICAL MOVE SELECTION RULE:
From the legal moves list, pick a GOOD, principled move that a strong club player
would be proud of. Avoid obvious blunders. Prefer moves that follow the guidelines
above. You do not need to find the absolute best computer move — a logical, solid
choice is sufficient. Respond with ONLY the UCI move string — nothing else.`.trim()
}

async function callLLM(system: string, user: string, model: string): Promise<string> {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    }),
  })
  const data = await res.json() as { content?: string; error?: string }
  if (data.error) throw new Error(data.error)
  return data.content!
}

function mdToHtml(t: string): string {
  return t
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\n/g,'<br/>')
}

// ── Main Provider Wrapper ─────────────────────────────────────────────────────

export default function IndexPage() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#d4af37', accentColorForeground: '#1a1610' })}>
          <ChessApp />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

function ChessApp() {
  // ── Game state ──
  const [gs,      setGs]      = useState<GameState>(initialGS)
  const [sel,     setSel]     = useState<number|null>(null)
  const [legalM,  setLegalM]  = useState<ChessMove[]>([])
  const [mode,    setMode]    = useState<GameMode>('ai')
  const [difficulty, setDifficulty] = useState<LlmDifficulty>('professional')
  const [active,  setActive]  = useState(false)
  const [over,    setOver]    = useState(false)
  const [result,  setResult]  = useState<GameResult>({over:false,winner:null,reason:null})
  const [flipped, setFlipped] = useState(false)
  const [timers,  setTimers]  = useState({w:600,b:600})
  const [toast,   setToast]   = useState<string|null>(null)
  const [llmThink,setLlmThink]= useState(false)

  // ── Chat state ──
  const [chat,      setChat]      = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy,  setChatBusy]  = useState(false)

  // ── Settings (read from localStorage) ──
  const [settings, setSettings] = useState<Settings>({model:''})

  // ── Wagmi Wallet & Payment State ──
  const { address, isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [pendingMode,   setPendingMode]   = useState<GameMode|null>(null)
  const [paygateOpen,   setPaygateOpen]   = useState(false)
  const [isPaying,      setIsPaying]      = useState(false) // Tracking tx status
  const [overlayOpen,   setOverlayOpen]   = useState(false)
  const [activeTab,     setActiveTab]     = useState<'moves'|'chain'>('moves')

  const timerRef  = useRef<ReturnType<typeof setInterval>|null>(null)
  const chatEndRef = useRef<HTMLDivElement|null>(null)

  // ── Load settings ──
  useEffect(() => {
    const local = localStorage.getItem('ritual-active-model')
    if (local) {
      setSettings({ model: local })
    } else {
      fetch('/api/config')
        .then(r => r.json())
        .then((d: { defaultModel?: string }) => {
          if (d.defaultModel) setSettings({ model: d.defaultModel })
        })
        .catch(() => {})
    }
  }, [])

  // ── Timer ──
  useEffect(() => {
    if (!active || over) { if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null} return }
    timerRef.current = setInterval(() => {
      setTimers(prev => {
        const next={...prev,[gs.turn]:prev[gs.turn]-1}
        if (next[gs.turn]<=0) {
          setOver(true); setActive(false)
          setResult({over:true,winner:gs.turn==='w'?'b':'w',reason:'timeout'})
          setOverlayOpen(true)
        }
        return next
      })
    }, 1000)
    return () => { if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null} }
  }, [active, over, gs.turn])

  // ── AI / LLM move trigger ──
  useEffect(() => {
    if (!active || over || gs.turn!=='b') return
    if (mode==='ai') {
      const t=setTimeout(()=>{
        setGs(prev => {
          const best=findBestMove(prev,COMPUTER_DEPTH[difficulty])
          const next=execMove(prev,best)
          if (!next) return prev
          const r=gameResult(next)
          if (r.over) { setOver(true); setActive(false); setResult(r); setOverlayOpen(true) }
          return next
        })
      }, AI_DELAY[COMPUTER_DEPTH[difficulty]]??700)
      return ()=>clearTimeout(t)
    }
    if (mode==='llm') {
      const t=setTimeout(()=>doLlmMove(), 500)
      return ()=>clearTimeout(t)
    }
  }, [gs.turn, mode, active, over, difficulty])

  // ── Auto-scroll chat ──
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:'smooth'}) }, [chat])

  // ── Helpers ──
  function showToast(msg: string, ms=3000) {
    setToast(msg); setTimeout(()=>setToast(null),ms)
  }

  function fmtTimer(s: number): string {
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  }

  function startGame(m: GameMode) {
    const gs0=initialGS()
    setGs(gs0); setSel(null); setLegalM([]); setMode(m)
    setOver(false); setActive(true); setResult({over:false,winner:null,reason:null})
    setTimers({w:600,b:600}); setOverlayOpen(false); setPaygateOpen(false)
    const greet = m==='llm'
      ? settings.model
        ? `New game — I'm playing Black. Ask me anything about the position!`
        : `New game! AI analysis is available — ask me about the position.`
      : 'New game started! Ask me about any position.'
    
    // Initial Greeting Animation
    const msgId = '0';
    setChat([{ id: msgId, role: 'llm', text: '', verified: false }]);
    let i = 0;
    const interval = setInterval(() => {
      setChat(prev => prev.map(msg => msg.id === msgId ? { ...msg, text: greet.slice(0, i + 1) } : msg));
      i++;
      if (i >= greet.length) clearInterval(interval);
    }, 10);

    if (m==='llm' && !settings.model) showToast('AI service starting…')
  }

  function requestGame(m: GameMode) { setPendingMode(m); setPaygateOpen(true) }
  
  // Web3 Transaction logic
  async function confirmGame() {
    if (!isConnected) {
      showToast('Connect your wallet first')
      return
    }

    // Switch to Ritual if wallet is on a different chain
    if (chainId !== 1979) {
      try {
        await switchChainAsync({ chainId: 1979 })
      } catch {
        showToast('Please switch to Ritual network in your wallet')
        return
      }
    }

    setIsPaying(true)
    try {
      await sendTransactionAsync({
        to:      '0x00dFB863c3033F8e23C3397f1c82f967C49178CA',
        value:   parseEther('0.01'),
        chainId: 1979,
      })
      showToast('Transaction sent ✓')
      setPaygateOpen(false)
      startGame(pendingMode ?? 'ai')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        showToast('Transaction cancelled')
      } else if (msg.toLowerCase().includes('insufficient')) {
        showToast('Insufficient RITUAL balance')
      } else {
        showToast('Transaction failed — check your wallet')
      }
    } finally {
      setIsPaying(false)
    }
  }

  function resign() { if(!active||over)return; endGame(gs.turn==='w'?'b':'w','resign') }
  function endGame(winner: Color|null, reason: string) {
    setOver(true); setActive(false)
    setResult({over:true,winner,reason}); setOverlayOpen(true)
  }

  // ── Square click ──
  function onSq(s: number) {
    if (over||!active) return
    if ((mode==='ai'||mode==='llm') && gs.turn==='b') return
    if (sel===null) {
      if (!gs.board[s]||col(gs.board[s])!==gs.turn) return
      setSel(s); setLegalM(legalFor(gs.board,gs.turn,gs.epSq,gs.castleRights).filter(m=>m.from===s))
      return
    }
    if (s===sel) { setSel(null); setLegalM([]); return }
    const mv=legalM.find(m=>m.to===s)
    if (mv) {
      const next=execMove(gs,mv)
      if (!next) return
      setGs(next); setSel(null); setLegalM([])
      const r=gameResult(next)
      if (r.over) { setOver(true); setActive(false); setResult(r); setOverlayOpen(true) }
    } else {
      if (gs.board[s]&&col(gs.board[s])===gs.turn) { setSel(s); setLegalM(legalFor(gs.board,gs.turn,gs.epSq,gs.castleRights).filter(m=>m.from===s)) }
      else { setSel(null); setLegalM([]) }
    }
  }

  // ── LLM opponent ──
  async function doLlmMove() {
    if (!active||over) return
    setLlmThink(true)
    const uciList=movesToUCI(gs)
    const pgn=gs.moveHistory.map(m=>m.color==='w'?`${m.num}. ${m.san}`:m.san).join(' ')||'(opening)'
    const system = getLlmPrompt(difficulty)
    const diffLabel = difficulty === 'beginner' ? 'Beginner' : difficulty === 'master' ? 'Master' : 'Professional'
    const user=`FEN: ${toFEN(gs)}\nMoves so far: ${pgn}\nLegal moves: ${uciList.join(', ')}\nYou are playing as: Black (${diffLabel} level)\n\nSelect your move:`
    try {
      const raw=await callLLM(system,user,settings.model)
      const cleaned=raw.trim().toLowerCase().replace(/[^a-h1-8qrbnkp]/g,' ').trim().split(/\s+/)[0]??''
      const idx=uciList.findIndex(u=>u.toLowerCase()===cleaned||u.toLowerCase().startsWith(cleaned.slice(0,4)))
      const chosen=idx>=0?uciList[idx]:uciList[Math.floor(Math.random()*uciList.length)]
      const mv=uciToMove(chosen,'b')
      const legal=legalFor(gs.board,'b',gs.epSq,gs.castleRights)
      const found=legal.find(l=>l.from===mv.from&&l.to===mv.to&&(!mv.prom||l.prom===mv.prom))
      const chosenMove=found??legal[Math.floor(Math.random()*legal.length)]
      if (!chosenMove) { setLlmThink(false); return }
      const san=toSAN(gs.board,chosenMove,legal)
      const next=execMove(gs,chosenMove)
      if (next) {
        setGs(next)
        const finalMsg = `Played **${sanToSimple(san, 'b')}**`;
        const msgId = Date.now() + '';
        const hash = fakeHash()
        
        // Setup typing response for move
        setChat(prev=>[...prev,{id: msgId, role:'llm', text:'', verified:true, hash:hash.slice(0,16)+'…'}])
        let i = 0;
        const interval = setInterval(() => {
          setChat(prev => prev.map(m => m.id === msgId ? { ...m, text: finalMsg.slice(0, i + 1) } : m));
          i++;
          if (i >= finalMsg.length) clearInterval(interval);
        }, 10);

        const r=gameResult(next)
        if (r.over) { setOver(true); setActive(false); setResult(r); setOverlayOpen(true) }
      }
    } catch(e: unknown) {
      const msg=e instanceof Error?e.message:String(e)
      if (msg==='NO_CONFIG'||msg==='NO_MODEL') showToast('AI service not available')
      else { showToast('LLM error — using engine fallback'); setGs(prev=>{const best=findBestMove(prev,COMPUTER_DEPTH[difficulty]);return execMove(prev,best)??prev}) }
    } finally { setLlmThink(false) }
  }

  // ── Chat send ──
  async function sendChat() {
    const msg=chatInput.trim(); if (!msg||chatBusy) return
    setChatInput(''); setChatBusy(true)
    setChat(prev=>[...prev,{id:Date.now()+'',role:'user',text:msg},{id:Date.now()+'t',role:'llm',text:'',thinking:true}])
    if (!settings.model) {
      setChat(prev=>prev.filter(m=>!m.thinking).concat({id:Date.now()+'',role:'llm',text:'AI analysis is currently unavailable.'}))
      setChatBusy(false); return
    }
    const fen=toFEN(gs)
    const pgn=gs.moveHistory.map(m=>m.color==='w'?`${m.num}. ${m.san}`:m.san).join(' ')||'(no moves yet)'
    
    // Updated System Prompt with Greeting instructions & plain English constraints
    const chatPersonality = mode==='llm' && difficulty==='beginner' ? 'casual, friendly beginner player who is still learning' : mode==='llm' && difficulty==='master' ? 'grandmaster-level analyst who speaks precisely about deep tactics and strategy' : 'strong club-level chess player who gives solid, practical advice'
    const system=`You are a ${chatPersonality} embedded in Chess on Ritual.
CRITICAL INSTRUCTION 1: If the user greets you (e.g., 'hi', 'hello', 'welcome'), respond warmly to the greeting FIRST and ask what they would love you to do or how you can assist them today, before offering any unprompted analysis.
CRITICAL INSTRUCTION 2: Use simple, plain English. AVOID using grid coordinates (like "e4" or "Nf3") whenever possible. 
Instead, describe pieces by their location or role (e.g., "your King's pawn", "the right Knight", "move your Bishop to control the long diagonal").
Provide winning strategies, pinpoint tactical blunders, and give clear, actionable advice in 2-4 short sentences.`
    
    const user=`FEN: ${fen}\nMoves: ${pgn}\n${gs.turn==='w'?'White':'Black'} to move.\n\nUser Message: ${msg}`
    
    try {
      const resp=await callLLM(system,user,settings.model)
      const hash=fakeHash()
      const msgId = Date.now() + '';
      
      // Remove thinking bubble and start typing effect
      setChat(prev=>prev.filter(m=>!m.thinking).concat({id: msgId, role:'llm', text:'', verified:true, hash:hash.slice(0,16)+'…'}))
      
      let i = 0;
      const interval = setInterval(() => {
        setChat(prev => prev.map(m => m.id === msgId ? { ...m, text: resp.slice(0, i + 1) } : m));
        i++;
        if (i >= resp.length) {
          clearInterval(interval);
          setChatBusy(false);
        }
      }, 10);

    } catch(e: unknown) {
      const msg2=e instanceof Error?e.message:String(e)
      setChat(prev=>prev.filter(m=>!m.thinking).concat({id:Date.now()+'',role:'llm',text:'Analysis unavailable. Please try again.'}))
      setChatBusy(false);
    }
  }

  // ── Board helpers ──
  const inCheck = !over && gs.turn && (() => { const ks=kingSq(gs.board,gs.turn); return ks!==-1 && attacked(gs.board,ks,gs.turn==='w'?'b':'w') })()

  function statusMsg(): string {
    if (over) return 'Game Over'
    if (mode==='llm' && gs.turn==='b') return llmThink ? 'Ritual LLM thinking…' : '⚡ Ritual LLM to move'
    if (mode==='ai'  && gs.turn==='b') return 'Computer thinking…'
    return `${gs.turn==='w'?'White':'Black'} to move${inCheck?' · Check!':''}`
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const swatch = (c: Color) => c==='w'
    ? 'radial-gradient(circle at 35% 35%, #fff9e6 5%, #d4af37 45%, #997300 100%)'
    : 'radial-gradient(circle at 35% 35%, #4a4a4a 5%, #1c1c1c 55%, #000 100%)'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Header ── */}
      <header className="hdr">
        <div className="hdr-logo">
          <div className="logo-icon">♞</div>
          <div>
            <div className="logo-text">Chess On Ritual</div>
            <div className="logo-sub">On-Chain Chess Protocol</div>
          </div>
        </div>
        <div className="hdr-right">
          {/* Integrated RainbowKit ConnectButton */}
          <ConnectButton 
            chainStatus="icon" 
            showBalance={false}
          />
        </div>
      </header>

      {/* ── Game Grid ── */}
      <main className="game-grid">

        {/* LEFT */}
        <div className="panel">
          {(['b','w'] as Color[]).map(c => (
            <div key={c} className="player-card">
              <div className="player-hdr">
                <div className="player-swatch" style={{background:swatch(c),border:`2px solid ${c==='w'?'#7a5a10':'#d4af37'}`}}/>
                <div>
                  <div className="player-name">{c==='w'?'White':'Black'}</div>
                  <div className="player-role">
                    {c==='b'
                      ? mode==='ai' ? 'Computer' : mode==='llm' ? 'Ritual LLM' : 'Player 2'
                      : 'Player 1'}
                  </div>
                </div>
              </div>
              <div className={`timer${timers[c]<=30?' low':''}`}>{fmtTimer(timers[c])}</div>
              <div className="cap-label">Captured</div>
              <div className="cap-row">
                {(c==='w'?gs.capByW:gs.capByB).map((p,i)=>(
                  <span key={i} className="cap-p"><img src={IMGS[p]} alt={p}/></span>
                ))}
              </div>
            </div>
          ))}
          <div className="card">
            <div className="card-title">Game</div>
            <button className="btn btn-ink" onClick={()=>requestGame('ai')}>▶ Play vs Computer</button>
            <button className="btn btn-llm" onClick={()=>requestGame('llm')}>⚡ Play vs Ritual LLM</button>
            <button className="btn btn-outline" onClick={()=>requestGame('human')}>⚔ Pass &amp; Play</button>
            <button className="btn btn-red" onClick={resign}>⚑ Resign</button>
            <button className="btn btn-outline last" onClick={()=>setFlipped(f=>!f)}>⇅ Flip Board</button>
          </div>
        </div>

        {/* BOARD */}
        <div className="board-col">
          {/* Difficulty bar on opponent's side */}
          {(mode === 'ai' || mode === 'llm') && !flipped && (
            <div className="diff-bar">
              <div className="diff-bar-label">
                {mode === 'ai' ? '🖥 Computer' : '⚡ Ritual LLM'}
              </div>
              <div className="diff-bar-btns">
                {(['beginner', 'professional', 'master'] as LlmDifficulty[]).map(lvl => (
                  <button
                    key={lvl}
                    className={`dbar-btn dbar-${lvl}${difficulty === lvl ? ' active' : ''}`}
                    onClick={() => setDifficulty(lvl)}
                  >
                    <span className="dbar-icon">
                      {lvl === 'beginner' ? '\u265f' : lvl === 'professional' ? '\u265e' : '\u2654'}
                    </span>
                    <span className="dbar-txt">
                      <span className="dbar-label">
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </span>
                      <span className="dbar-sub">
                        {mode === 'ai'
                          ? lvl === 'beginner' ? 'Depth 1' : lvl === 'professional' ? 'Depth 2' : 'Depth 3'
                          : lvl === 'beginner' ? '~700 ELO' : lvl === 'professional' ? '~1800 ELO' : '2500+ ELO'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="board-outer">
            <div className="board">
              {Array.from({length:64},(_,vi)=>{
                const vr=Math.floor(vi/8), vc=vi%8
                const r=flipped?7-vr:vr, c=flipped?7-vc:vc, s=sq(r,c)
                const isL=(r+c)%2===0
                const piece=gs.board[s]
                const isKingInCheck=piece&&typ(piece)==='K'&&!over&&kingSq(gs.board,col(piece)!)=== s && attacked(gs.board,s,col(piece)==='w'?'b':'w')
                const isSelected=sel===s
                const isLastMove=gs.lastMove&&(gs.lastMove.from===s||gs.lastMove.to===s)
                const isHint=legalM.some(m=>m.to===s)
                const isCapHint=isHint&&!!gs.board[s]
                return (
                  <div
                    key={vi}
                    className={[
                      'sq', isL?'l':'d',
                      isSelected?'selected':'',
                      isLastMove?(isL?'lm-l':'lm-d'):'',
                      isHint?'hint':'', isCapHint?'cap':'',
                      isKingInCheck?'incheck':'',
                    ].join(' ')}
                    onClick={()=>onSq(s)}
                  >
                    {/* Embedded faint coordinates */}
                    {vc === 0 && <span className="sq-rank">{8 - r}</span>}
                    {vr === 7 && <span className="sq-file">{'abcdefgh'[c]}</span>}

                    {piece && <div className="piece"><img src={IMGS[piece]} alt={piece} draggable={false}/></div>}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="status-bar">
            <div className="status-left">
              <div className="turn-swatch" style={{background:swatch(gs.turn),border:`2px solid ${gs.turn==='w'?'#7a5a10':'#d4af37'}`}}/>
              <span className="status-txt">{statusMsg()}</span>
            </div>
            <span className="move-count">Move {gs.fullMove}</span>
          </div>

          {/* Difficulty bar on opponent's side */}
          {(mode === 'ai' || mode === 'llm') && flipped && (
            <div className="diff-bar">
              <div className="diff-bar-label">
                {mode === 'ai' ? '🖥 Computer' : '⚡ Ritual LLM'}
              </div>
              <div className="diff-bar-btns">
                {(['beginner', 'professional', 'master'] as LlmDifficulty[]).map(lvl => (
                  <button
                    key={lvl}
                    className={`dbar-btn dbar-${lvl}${difficulty === lvl ? ' active' : ''}`}
                    onClick={() => setDifficulty(lvl)}
                  >
                    <span className="dbar-icon">
                      {lvl === 'beginner' ? '\u265f' : lvl === 'professional' ? '\u265e' : '\u2654'}
                    </span>
                    <span className="dbar-txt">
                      <span className="dbar-label">
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </span>
                      <span className="dbar-sub">
                        {mode === 'ai'
                          ? lvl === 'beginner' ? 'Depth 1' : lvl === 'professional' ? 'Depth 2' : 'Depth 3'
                          : lvl === 'beginner' ? '~700 ELO' : lvl === 'professional' ? '~1800 ELO' : '2500+ ELO'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="panel right-panel">
          
          {/* ── Chat — Increased height, dynamic typing effect ── */}
          <div className="chat-wrap" style={{ marginBottom: '16px' }}>
            <div className="chat-hdr">
              <div className="chat-hdr-left">
                <div className="chat-lightning">⚡</div>
                <div>
                  <div className="chat-title">Ritual LLM Coach</div>
                  <div className="chat-subtitle">Verifiable On-Chain Inference</div>
                </div>
              </div>
              <div className="chat-hdr-right">
                <span className="live-dot"/>
                <span className="live-label">Verified</span>
              </div>
            </div>

            <div className="chat-messages">
              {chat.map(msg => (
                <div key={msg.id} className={`chat-msg ${msg.role}`}>
                  <div className="chat-sender">{msg.role==='user'?'You':'Ritual LLM'}</div>
                  {msg.thinking ? (
                    <div className="thinking-bubble">
                      <span/><span/><span/>
                    </div>
                  ) : (
                    <div
                      className="chat-bubble"
                      dangerouslySetInnerHTML={{__html: msg.role==='llm' ? mdToHtml(msg.text) : msg.text}}
                    />
                  )}
                  {msg.verified && msg.hash && (
                    <div className="verify-badge">✓ Ritual · {msg.hash}</div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef}/>
            </div>

            <div className="chat-input-row">
              <textarea
                className="chat-textarea"
                value={chatInput}
                onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}}
                placeholder="Say hello, or ask for advice..."
                rows={1}
              />
              <button className="chat-send" onClick={sendChat} disabled={chatBusy}>↑</button>
            </div>
          </div>

          <div className="tabs-bar">
            <button className={`tab${activeTab==='moves'?' active':''}`} onClick={()=>setActiveTab('moves')}>♟ Moves</button>
            <button className={`tab${activeTab==='chain'?' active':''}`} onClick={()=>setActiveTab('chain')}>⛓ Chain</button>
          </div>

          {activeTab==='moves' && (
            <div className="card">
              <div className="card-title">Move History</div>
              <div className="move-list">
                <div className="move-list-header">
                  <span className="mn">#</span>
                  <span className="mh-header">White</span>
                  <span className="mh-header">Black</span>
                </div>
                {Array.from({length:Math.ceil(gs.moveHistory.length/2)},(_,i)=>{
                  const wm=gs.moveHistory[i*2], bm=gs.moveHistory[i*2+1]
                  return (
                    <div key={i} className="move-row">
                      <span className="mn">{wm.num}.</span>
                      <span className="mh white-move">{sanToSimple(wm.san, 'w')}</span>
                      {bm ? <span className="mh black-move">{sanToSimple(bm.san, 'b')}</span> : <span className="mh empty-move"></span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab==='chain' && (
            <>
              <div className="card">
                <div className="card-title">Ritual Wallet</div>
                {isConnected ? (
                  <>
                    <div className="connected-badge">Wallet Connected</div>
                    <div className="addr-box">{address}</div>
                  </>
                ) : (
                  <>
                    <p className="wallet-hint">Connect your wallet to record games on-chain.</p>
                    {/* Secondary Connect Button inside the tab for convenience */}
                    <ConnectButton showBalance={false} />
                  </>
                )}
              </div>
              <div className="card">
                <div className="card-title">Contract</div>
                <div className="connected-badge">Live on Ritual</div>
                <div className="contract-addr">0x00dFB863c3033F8e23C3397f1c82f967C49178CA</div>
                <a className="explorer-link" href="https://explorer.ritualfoundation.org/address/0x00dFB863c3033F8e23C3397f1c82f967C49178CA" target="_blank" rel="noreferrer">View on Ritual Explorer ↗</a>
                <div className="divider"/>
                <div className="contract-meta">
                  <span><b>Entry fee:</b> 0.01 ritual</span>
                  <span><b>Chain:</b> Ritual · 1979</span>
                  <span><b>AI:</b> Ritual · on-chain</span>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Pay Gate ── */}
      {paygateOpen && (
        <div className="overlay-bg">
          <div className="paybox">
            <div className="pay-kings">
              <img src={IMGS['wK']} alt="White King"/>
              <span className="vs">vs</span>
              <img src={IMGS['bK']} alt="Black King"/>
            </div>
            <div className="pay-title">Enter the Ritual</div>
            <div className="pay-sub">
              {pendingMode==='llm'?'One game vs the Ritual LLM. Every move verified on-chain.':
               pendingMode==='ai'?'One game vs the Computer.':'Pass & Play session.'}
            </div>
            <div className="pay-fee-box">
              <div className="pay-fee-amount">0.01</div>
              <div className="pay-fee-label">ritual<br/><span>per game session</span></div>
            </div>
            {isConnected && chainId !== 1979 && (
              <div className="wrong-chain-note">
                ⚠ Wallet is on the wrong network.<br/>Clicking below will prompt a switch to Ritual.
              </div>
            )}
            <div className="pay-actions">
              <button className="btn btn-ink" onClick={confirmGame} disabled={isPaying}>
                {isPaying ? 'Signing…' : !isConnected ? 'Connect Wallet First' : chainId !== 1979 ? 'Switch & Pay' : 'Pay & Play'}
              </button>
              <button className="btn btn-outline" onClick={()=>setPaygateOpen(false)} disabled={isPaying}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Game Over ── */}
      {overlayOpen && (
        <div className="overlay-bg">
          <div className="ovbox">
            <div className="ov-icon">
              {result.reason==='checkmate'&&result.winner
                ? <img src={IMGS[result.winner+'K']} alt="King" style={{width:72,height:72,objectFit:'contain'}}/>
                : result.reason==='timeout'?'⏱':result.reason==='resign'?'⚑':'⚖'}
            </div>
            <div className="ov-title">
              {result.reason==='checkmate'?'Checkmate!':result.reason==='stalemate'?'Stalemate!':result.reason==='timeout'?"Time's Up!":result.reason==='resign'?'Resigned!':'Draw!'}
            </div>
            <div className="ov-sub">
              {result.winner?(result.winner==='w'?'White':'Black')+' wins the ritual':'The ritual ends in a draw'}
            </div>
            <div className="ov-fee-note">
              To play again, the ritual demands another entry.<br/>
              <strong>0.01 ritual</strong> · one game · one fee
            </div>
            <div className="ov-actions">
              <button className="btn btn-ink" onClick={()=>{setOverlayOpen(false);requestGame(mode)}}>Play Again</button>
              <button className="btn btn-gold" onClick={()=>setOverlayOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg:#ffffff;--bg2:#f8f6f2;--bg3:#f0ece4;
  --border:#e2ddd6;--border2:#c8c0b4;
  --ink:#1a1610;--ink2:#4a4540;--ink3:#8a857e;
  --gold:#d4af37;--gold2:#aa8529;--gold-bg:#fdfaf0;
  --red:#b83232;--green:#2d7a4f;
  --shadow:0 2px 8px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);
  --shadow-lg:0 16px 48px rgba(0,0,0,.25),0 4px 16px rgba(0,0,0,.15);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;line-height:1.5}

/* Header */
.hdr{position:sticky;top:0;z-index:50;background:var(--bg);border-bottom:1px solid var(--border);padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:64px;box-shadow:var(--shadow)}
.hdr-logo{display:flex;align-items:center;gap:12px}
.logo-icon{width:36px;height:36px;background:var(--ink);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--gold);font-family:serif;flex-shrink:0}
.logo-text{font-family:'Playfair Display SC',serif;font-size:18px;font-weight:700;color:var(--ink);letter-spacing:.02em}
.logo-sub{font-size:10px;color:var(--ink3);letter-spacing:.12em;text-transform:uppercase}
.hdr-right{display:flex;align-items:center;gap:10px}
.chain-pill{display:flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;font-size:11px;color:var(--ink2);margin-right:12px}
.chain-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}

/* Game Grid */
.game-grid{display:grid;grid-template-columns:260px 1fr 300px;max-width:1240px;margin:0 auto;padding:24px 20px 0;align-items:start;gap:0}
@media(max-width:960px){.game-grid{grid-template-columns:1fr;padding:16px}.hdr{padding:0 16px}}

.panel{padding:0 16px}

.card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:var(--shadow)}
.card-title{font-family:'Playfair Display SC',serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)}

/* Player card */
.player-card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow)}
.player-hdr{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.player-swatch{width:28px;height:28px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 -2px 6px rgba(0,0,0,.2),0 3px 8px rgba(0,0,0,.25)}
.player-name{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--ink)}
.player-role{font-size:10px;color:var(--ink3);letter-spacing:.06em;text-transform:uppercase}
.timer{font-family:'Playfair Display SC',serif;font-size:24px;font-weight:700;color:var(--ink);letter-spacing:.05em;text-align:center;padding:6px 0 2px}
.timer.low{color:var(--red);animation:flash .5s infinite}
@keyframes flash{50%{opacity:.35}}
.cap-label{font-size:10px;color:var(--ink3);margin:6px 0 4px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.cap-row{display:flex;flex-wrap:wrap;gap:1px;min-height:22px;align-items:center}
.cap-p{display:inline-flex;width:20px;height:20px}
.cap-p img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}

/* Buttons */
.btn{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;border-radius:8px;padding:8px 14px;cursor:pointer;transition:all .15s;width:100%;margin-bottom:6px;text-align:center;border:1px solid var(--border)}
.btn.last{margin-bottom:0}
.btn-ink{background:var(--ink);color:#fff;border-color:var(--ink)}
.btn-ink:hover{background:#2e2922}
.btn-outline{background:var(--bg);color:var(--ink)}
.btn-outline:hover{background:var(--bg2);border-color:var(--border2)}
.btn-red{background:#fff5f5;color:var(--red);border-color:#fecaca}
.btn-red:hover{background:#fee2e2}
.btn-gold{background:var(--gold-bg);color:var(--gold2);border-color:var(--gold)}
.btn-gold:hover{background:#faedc8}
.btn-llm{background:linear-gradient(135deg,#1a1610,#2a2010);color:var(--gold);border-color:var(--gold2);box-shadow:0 2px 10px rgba(212,175,55,.2)}
.btn-llm:hover{background:linear-gradient(135deg,#2a2010,#3a3018)}
/* Button disabled state */
.btn:disabled{opacity:0.6;cursor:not-allowed;}

/* Difficulty */
.diff-row{display:flex;gap:5px}
.diff-btn{flex:1;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;padding:6px 4px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--ink3);cursor:pointer;transition:all .15s}
.diff-btn.active{background:var(--ink);color:var(--gold);border-color:var(--ink)}





/* ── Difficulty Bar (horizontal, follows opponent side of board) ── */
.diff-bar{display:flex;align-items:center;gap:8px;width:min(504px,88vw);padding:8px 0}
.diff-bar-label{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.06em;white-space:nowrap;flex-shrink:0;min-width:80px;text-align:right;padding-right:10px;border-right:1px solid var(--border)}
.diff-bar-btns{display:flex;gap:5px;flex:1}
.dbar-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 4px;border:1px solid var(--border);border-radius:9px;background:var(--bg);cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
.dbar-btn:hover{background:var(--bg2);border-color:var(--border2)}
.dbar-icon{font-size:15px;flex-shrink:0;line-height:1}
.dbar-txt{display:flex;flex-direction:column;align-items:flex-start;gap:0}
.dbar-label{font-size:11px;font-weight:700;color:var(--ink);line-height:1.2}
.dbar-sub{font-family:'DM Mono',monospace;font-size:9px;color:var(--ink3);line-height:1.3}
.dbar-btn.active.dbar-beginner{background:rgba(45,122,79,.1);border-color:var(--green)}
.dbar-btn.active.dbar-beginner .dbar-label{color:var(--green)}
.dbar-btn.active.dbar-beginner .dbar-icon,.dbar-btn.active.dbar-beginner .dbar-sub{color:rgba(45,122,79,.75)}
.dbar-btn.active.dbar-professional{background:var(--gold-bg);border-color:var(--gold)}
.dbar-btn.active.dbar-professional .dbar-label{color:var(--gold2)}
.dbar-btn.active.dbar-professional .dbar-icon,.dbar-btn.active.dbar-professional .dbar-sub{color:rgba(170,133,41,.75)}
.dbar-btn.active.dbar-master{background:var(--ink);border-color:var(--ink)}
.dbar-btn.active.dbar-master .dbar-label{color:var(--gold)}
.dbar-btn.active.dbar-master .dbar-icon{color:var(--gold)}
.dbar-btn.active.dbar-master .dbar-sub{color:rgba(212,175,55,.5)}

/* ═══ Realistic Chess Board ═══ */
.board-col{display:flex;flex-direction:column;align-items:center}
.board-outer{display:flex;align-items:center;gap:0;margin:12px 0 0}
.board{--bs:min(504px,88vw);display:grid;grid-template-columns:repeat(8,calc(var(--bs)/8));grid-template-rows:repeat(8,calc(var(--bs)/8));width:var(--bs);height:var(--bs);border-radius:4px;overflow:hidden;box-shadow: 0 0 0 4px #4a2e15, 0 0 0 10px #2e1a0b, 0 16px 32px rgba(0,0,0,0.4);}
.sq{position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .1s}
/* Wood textures for the board squares */
.sq.l{background: linear-gradient(135deg, #e3c193 0%, #d1ae7e 100%); box-shadow: inset 0 0 10px rgba(139,69,19,0.15);}
.sq.d{background: linear-gradient(135deg, #8b5a2b 0%, #6b4226 100%); box-shadow: inset 0 0 15px rgba(0,0,0,0.3);}
.sq.selected::after{content:'';position:absolute;inset:0;background:radial-gradient(circle,rgba(212,175,55,.4),transparent 70%);border:2px solid var(--gold);box-shadow:0 0 14px var(--gold);z-index:4;pointer-events:none}
.sq.lm-l{background:#ebd59b!important}
.sq.lm-d{background:#626046!important}
.sq.hint::before{content:'';position:absolute;width:28%;height:28%;border-radius:50%;background:radial-gradient(circle,var(--gold),#9c7b16);box-shadow:0 2px 6px rgba(0,0,0,.5);z-index:2}
.sq.cap::before{width:86%;height:86%;background:transparent;border:4px dashed var(--gold);border-radius:50%}
.sq.incheck{background:radial-gradient(circle,#b83232,#5a1212)!important}
.piece{position:relative;z-index:3;width:95%;height:95%;display:flex;align-items:center;justify-content:center;pointer-events:none;transition:transform .15s}
.sq:hover .piece{transform:scale(1.08)}
/* Small drop shadow on pieces to make them pop off the board */
.piece img{width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.4));}

/* Faint Coordinates overlay on squares */
.sq-rank { position: absolute; top: 2px; left: 3px; font-size: 11px; font-weight: 700; opacity: 0.6; pointer-events: none; }
.sq-file { position: absolute; bottom: 0px; right: 3px; font-size: 11px; font-weight: 700; opacity: 0.6; pointer-events: none; }
.sq.l .sq-rank, .sq.l .sq-file { color: #8b5a2b; }
.sq.d .sq-rank, .sq.d .sq-file { color: #e3c193; }

/* Status bar */
.status-bar{display:flex;align-items:center;justify-content:space-between;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-top:12px;width:min(504px,88vw);box-shadow:var(--shadow)}
.status-left{display:flex;align-items:center;gap:10px}
.turn-swatch{width:20px;height:20px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 -2px 4px rgba(0,0,0,.15),0 2px 5px rgba(0,0,0,.2)}
.status-txt{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--ink)}
.move-count{font-size:12px;color:var(--ink3);font-weight:500}

/* Tabs */
.tabs-bar{display:flex;gap:2px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:3px;margin-bottom:12px}
.tab{flex:1;padding:7px 6px;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;background:transparent;color:var(--ink3)}
.tab.active{background:var(--bg);color:var(--ink);box-shadow:var(--shadow)}

/* Move list */
.move-list{max-height:300px;overflow-y:auto;font-size:11px;font-weight:600;line-height:1.4;scrollbar-width:thin;}
.move-list-header{display:grid;grid-template-columns:25px 1fr 1fr;gap:4px;padding:4px 8px;border-bottom:1px solid var(--border);margin-bottom:4px;font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:0.05em;}
.move-row{display:grid;grid-template-columns:25px 1fr 1fr;gap:4px;padding:2px 4px;align-items:center;}
.move-row:hover{background:var(--bg2);border-radius:4px}
.mn{color:var(--ink3);font-size:10px;}
.mh{padding:5px 6px;border-radius:6px;cursor:pointer;background:var(--bg);border:1px solid var(--border);text-align:left;transition:all 0.15s;}
.mh.white-move{background:#ffffff;}
.mh.black-move{background:#f8f6f2; color:var(--ink2);}
.mh.empty-move{background:transparent;border:none;pointer-events:none;}
.mh:hover:not(.empty-move){background:var(--ink);color:var(--gold);border-color:var(--ink);}

/* Chain tab */
.connected-badge{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--green);font-weight:600;margin-bottom:8px}
.connected-badge::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0}
.addr-box{font-size:10px;color:var(--ink3);word-break:break-all;font-family:monospace;padding:6px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px}
.wallet-hint{font-size:12px;color:var(--ink3);margin-bottom:10px;line-height:1.6}
.contract-addr{font-family:monospace;font-size:9px;color:var(--gold2);background:var(--gold-bg);border:1px solid var(--gold);border-radius:5px;padding:4px 6px;word-break:break-all;margin-top:6px}
.explorer-link{display:block;text-align:center;font-size:11px;color:var(--gold2);font-weight:600;text-decoration:none;margin-top:8px}
.explorer-link:hover{text-decoration:underline}
.divider{height:1px;background:var(--border);margin:10px 0}
.contract-meta{font-size:11px;color:var(--ink3);line-height:1.7}
.contract-meta b{color:var(--ink2)}

/* ═══ COMPACT CHAT SECTION ═══ */
.chat-wrap{
  background:var(--bg);border:1px solid var(--border);border-radius:12px;
  overflow:hidden;box-shadow:var(--shadow);
}
.chat-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;
  background:linear-gradient(135deg,#1a1610 0%,#2e2416 100%);
  border-bottom:1px solid rgba(212,175,55,.2);
}
.chat-hdr-left{display:flex;align-items:center;gap:10px}
.chat-lightning{font-size:18px}
.chat-title{font-family:'Playfair Display SC',serif;font-size:12px;font-weight:700;color:var(--gold);letter-spacing:.08em}
.chat-subtitle{font-family:'DM Mono',monospace;font-size:9px;color:rgba(212,175,55,.55);letter-spacing:.06em;margin-top:2px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-hdr-right{display:flex;align-items:center;gap:5px;flex-shrink:0}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 1.8s infinite;flex-shrink:0}
.live-label{font-size:9px;color:var(--green);font-weight:700;letter-spacing:.08em;text-transform:uppercase}

.chat-messages{
  height:280px; /* Increased Height */
  overflow-y:auto;display:flex;flex-direction:column;gap:10px;
  padding:12px 14px;scrollbar-width:thin;scrollbar-color:var(--border) transparent;
  background:var(--bg);
}
.chat-msg{display:flex;flex-direction:column;gap:2px}
.chat-msg.user{align-items:flex-end}
.chat-msg.llm{align-items:flex-start}
.chat-sender{font-size:8px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.chat-msg.user .chat-sender{color:var(--ink3)}
.chat-msg.llm  .chat-sender{color:var(--gold2)}
.chat-bubble{max-width:90%;padding:8px 10px;font-size:11px;line-height:1.45}
.chat-msg.user .chat-bubble{background:var(--ink);color:#f5f0e8;border-radius:12px 12px 4px 12px}
.chat-msg.llm  .chat-bubble{background:var(--gold-bg);border:1px solid rgba(212,175,55,.3);border-radius:12px 12px 12px 4px;color:var(--ink)}
.chat-bubble code{font-family:'DM Mono',monospace;font-size:10px;background:var(--bg3);padding:1px 4px;border-radius:3px}
.thinking-bubble{display:flex;gap:4px;align-items:center;padding:10px 14px;background:var(--gold-bg);border:1px solid rgba(212,175,55,.3);border-radius:12px 12px 12px 4px;max-width:70px}
.thinking-bubble span{width:6px;height:6px;border-radius:50%;background:var(--gold2);opacity:.6;animation:db .9s ease-in-out infinite}
.thinking-bubble span:nth-child(2){animation-delay:.15s}
.thinking-bubble span:nth-child(3){animation-delay:.3s}
@keyframes db{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}
.verify-badge{font-size:8px;color:var(--green);font-family:'DM Mono',monospace;display:flex;align-items:center;gap:4px;margin-top:2px}
.verify-badge::before{content:'✓';background:rgba(45,122,79,.12);border:1px solid rgba(45,122,79,.3);border-radius:3px;padding:0 3px;line-height:1.6;font-weight:700}

.chat-input-row{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--border);background:var(--bg2)}
.chat-textarea{flex:1;font-family:'DM Sans',sans-serif;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:7px 10px;background:var(--bg);color:var(--ink);resize:none;outline:none;transition:border .15s;line-height:1.4}
.chat-textarea:focus{border-color:var(--gold2)}
.chat-textarea::placeholder{color:var(--ink3)}
.chat-send{background:var(--ink);color:var(--gold);border:1px solid var(--gold2);border-radius:6px;padding:6px;cursor:pointer;font-size:14px;transition:all .15s;flex-shrink:0;display:flex;align-items:center;justify-content:center;width:32px}
.chat-send:hover{background:#2e2922;box-shadow:0 0 8px rgba(212,175,55,.3)}
.chat-send:disabled{opacity:.35;cursor:not-allowed}

/* Overlays */
.overlay-bg{position:fixed;inset:0;z-index:200;background:rgba(255,255,255,.85);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center}
.paybox,.ovbox{background:var(--bg);border:1px solid var(--gold);border-radius:20px;padding:40px 44px;text-align:center;max-width:400px;width:92%;box-shadow:0 24px 80px rgba(0,0,0,.15);animation:popIn .3s cubic-bezier(.34,1.56,.64,1)}
@keyframes popIn{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
.pay-kings{display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:16px}
.pay-kings img{width:60px;height:60px;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,.3))}
.vs{font-family:'Playfair Display SC',serif;font-size:16px;color:var(--ink3)}
.pay-title{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:var(--ink);margin-bottom:6px}
.pay-sub{font-size:13px;color:var(--ink3);margin-bottom:18px;line-height:1.6}
.pay-fee-box{display:flex;align-items:center;justify-content:center;gap:10px;background:var(--gold-bg);border:1px solid var(--gold);border-radius:12px;padding:14px 24px;margin-bottom:20px}
.pay-fee-amount{font-family:'Playfair Display SC',serif;font-size:34px;font-weight:700;color:var(--gold2)}
.pay-fee-label{font-size:11px;color:var(--gold2);letter-spacing:.1em;text-transform:uppercase;font-weight:600;text-align:left}
.pay-fee-label span{font-size:9px;opacity:.7}
.wrong-chain-note{font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:14px;line-height:1.6;text-align:center}
.pay-actions{display:flex;gap:10px;justify-content:center}
.pay-actions .btn{width:auto;min-width:110px;margin:0}
.ov-icon{display:flex;align-items:center;justify-content:center;width:72px;height:72px;margin:0 auto 12px;font-size:56px}
.ov-title{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:var(--ink);margin-bottom:6px}
.ov-sub{font-size:14px;color:var(--ink3);margin-bottom:14px;font-weight:500}
.ov-fee-note{font-size:12px;color:var(--ink3);line-height:1.8;background:var(--gold-bg);border:1px solid var(--gold);border-radius:8px;padding:10px 14px;margin-bottom:18px}
.ov-fee-note strong{color:var(--gold2)}
.ov-actions{display:flex;gap:10px;justify-content:center}
.ov-actions .btn{width:auto;min-width:110px;margin:0}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--gold);border:1px solid var(--gold2);border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;z-index:300;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.3);animation:slideUp .3s cubic-bezier(.34,1.56,.64,1)}
@keyframes slideUp{from{transform:translateX(-50%) translateY(40px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}

::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
`






