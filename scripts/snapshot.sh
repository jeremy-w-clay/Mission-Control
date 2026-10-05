#!/bin/bash
# Builds the app, runs it against demo data with the snapshot hook, and saves PNGs to .snapshots/.
# Usage: scripts/snapshot.sh [reduce]   ("reduce" emulates Reduce Motion inside the page)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NODE="${NODE:-$(command -v node || true)}"
if [ -z "$NODE" ] && [ -x /Applications/Cursor.app/Contents/Resources/app/resources/helpers/node ]; then
  NODE=/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node
fi
if [ -z "$NODE" ]; then echo "node is needed to write demo data" >&2; exit 1; fi

MODE="${1:-normal}"
DEMO="/tmp/organizer-demo"
OUT="$ROOT/.snapshots/$MODE"
rm -rf "$OUT"
mkdir -p "$OUT"

./scripts/build.sh >/dev/null
"$NODE" scripts/make-demo.js "$DEMO" >/dev/null

REDUCE_JS=""
if [ "$MODE" = "reduce" ]; then
  # Emulate Reduce Motion: the media query tokens and the JS matchMedia check both say "reduce".
  REDUCE_JS="var style=document.createElement('style');style.textContent=':root{--ease-spring:var(--ease-out);--duration-quick:0ms;--duration-base:0ms;--duration-slow:0ms;--duration-enter:0ms}.card.is-new,.account-row.is-new{animation:none}.chevron,.followup-body{transition:none}';document.head.appendChild(style);window.matchMedia=function(q){return {matches:/reduce/.test(q),media:q,addEventListener:function(){},removeEventListener:function(){}};};"
fi

D="window.webkit.messageHandlers.organizer.postMessage({op:'debug',text:"
export ORGANIZER_SUPPORT_DIR="$DEMO"
export ORGANIZER_SNAPSHOT_DIR="$OUT"
cat > "$OUT/steps.json" <<EOF
[
 {"name":"day","wait":0.7,"js":"(function(){${REDUCE_JS}Organizer.setView('day');var first=document.querySelector('.column');var cards=Array.prototype.map.call(first.querySelectorAll('.card .name'),function(n){return n.textContent;});var line=first.querySelector('.line-label');${D}'day cards='+cards.join('|')+' line='+(line&&line.textContent)+' chips='+Array.prototype.map.call(first.querySelectorAll('.chip'),function(c){return c.textContent;}).join('|')});})()"},
 {"name":"day-band-open","wait":0.6,"js":"(function(){var t=document.querySelector('.followup-toggle');if(t)t.click();${D}'band='+(t&&t.textContent)});})()"},
 {"name":"day-move","wait":0.8,"js":"(function(){var first=document.querySelector('.column');var grip=first.querySelector('.card[data-index=\"3\"] .grip');grip.focus();grip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));setTimeout(function(){var col=document.querySelector('.column');var cards=Array.prototype.map.call(col.querySelectorAll('.card .name'),function(n){return n.textContent;});var line=col.querySelector('.line-label');${D}'moved cards='+cards.join('|')+' line='+(line&&line.textContent)+' focus='+(document.activeElement&&document.activeElement.className)});},350);})()"},
 {"name":"day-add","wait":0.8,"js":"(function(){document.querySelectorAll('.column')[1].querySelector('.add-card').click();var name=document.querySelectorAll('.column')[1].querySelector('.card .name');name.textContent='New Person';name.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(function(){var card=document.querySelectorAll('.column')[1].querySelector('.card');var op=card?getComputedStyle(card).opacity:'none';${D}'added opacity='+op+' count='+document.querySelectorAll('.column')[1].querySelector('.count').textContent});},400);})()"},
 {"name":"picker","wait":0.6,"js":"(function(){Organizer.setView('day');var col=document.querySelector('.column');col.querySelector('.choose').click();${D}'picker='+document.querySelector('#dialog-title').textContent+' rows='+document.querySelectorAll('.contact-row').length});})()"},
 {"name":"picker-search","wait":0.6,"js":"(function(){document.querySelector('.opp-line .text-button').click();var s=document.querySelector('.dialog .search');s.value='north';s.dispatchEvent(new Event('input',{bubbles:true}));${D}'suggestions='+Array.prototype.map.call(document.querySelectorAll('.suggestion'),function(r){return r.firstChild.textContent;}).join('|')});})()"},
 {"name":"details","wait":1.2,"js":"(function(){Organizer.setView('day');document.querySelector('.column .details-button').click();setTimeout(function(){${D}'details='+document.querySelector('#dialog-title').textContent+' fields='+document.querySelectorAll('.field-list dt').length});},700);})()"},
 {"name":"week","wait":0.5,"js":"(function(){Organizer.setView('week');${D}'week='+document.querySelector('.caption').textContent+' accounts='+document.querySelectorAll('.week-account').length});})()"},
 {"name":"week-detail","wait":0.6,"js":"(function(){document.querySelector('.week-account').click();${D}'detail='+document.querySelector('.back-button').textContent+' / '+document.querySelector('.day-header h1').textContent});})()"},
 {"name":"month","wait":0.5,"js":"(function(){Organizer.setView('month');${D}'month events='+document.querySelectorAll('.event').length});})()"},
 {"name":"archive","wait":0.5,"js":"(function(){Organizer.setView('archive');${D}'archive rows='+Array.prototype.map.call(document.querySelectorAll('.account-row .account-open'),function(n){return n.textContent;}).join('|')});})()"},
 {"name":"archive-add","wait":0.8,"js":"(function(){document.querySelector('.add-account').click();var i=document.querySelector('.dialog input');i.value='Wayne Enterprises';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));setTimeout(function(){var rows=Array.prototype.map.call(document.querySelectorAll('.account-row .account-open'),function(n){return n.textContent;});var row=document.querySelector('.account-row');${D}'added rows='+rows.join('|')+' opacity='+(row?getComputedStyle(row).opacity:'')});},400);})()"}
]
EOF
export ORGANIZER_SNAPSHOT_STEPS="$(cat "$OUT/steps.json")"

"$ROOT/Organizer.app/Contents/MacOS/Organizer" >"$OUT/stdout.txt" 2>"$OUT/stderr.txt" &
PID=$!
for _ in $(seq 1 40); do
  if grep -q "snapshots-done" "$OUT/stderr.txt" 2>/dev/null; then break; fi
  sleep 1
done
sleep 0.3
kill "$PID" 2>/dev/null || true
grep CHECK "$OUT/stderr.txt"
echo "Screenshots in $OUT"
