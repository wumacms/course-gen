/**
 * Injects the Design Mode SDK into the sandbox's index.html via Vite's
 * transformIndexHtml hook — same pattern as vesa-error-reporter.
 * SDK 仅内联（getInlineSdkCode）；后端不再注入，本文件为运行时唯一来源。
 *
 * 仅 dev：`apply: "serve"`，生产 `vite build` 不注入。
 */
export default function vesaDesignMode() {
  return {
    name: "vesa-design-mode",
    apply: "serve",
    transformIndexHtml(html) {
      if (html.includes("data-vesa-design-mode")) return html;

      const sdkCode = getInlineSdkCode();
      const scriptTag = `<script data-vesa-design-mode="true">\n${sdkCode}\n</script>`;
      return html.replace("</head>", scriptTag + "\n  " + "</head>");
    },
  };
}

/** 内联 SDK 正文（修改设计模式行为时只改此处）。 */
function getInlineSdkCode() {
  return `(function () {
  if (window.__VESA_DESIGN_MODE_SDK__) return;
  window.__VESA_DESIGN_MODE_SDK__ = true;

  var isDesignModeActive = false;
  var hoveredElement = null;
  var selectedElement = null;
  var hoverOverlay = null;
  var selectOverlay = null;
  var sizeLabel = null;
  var elementInfo = null;
  var cornerHandles = [];
  var designModeListenersAttached = false;

  function cssEscape(v){if(typeof CSS!=='undefined'&&CSS.escape)return CSS.escape(v);return String(v).replace(/[\\x00-\\x1f\\x7f]|^-?\\d|^--|[^a-zA-Z0-9_-]/g,function(m){return '\\\\'+m.charCodeAt(0).toString(16)+' ';});}
  /** 自根向叶构建一段尽量可唯一定位节点的 CSS 选择器路径（供 querySelector），非随机 id */
  function buildCssSelectorPath(el) {
    var parts = [], current = el;
    while (current && current !== document.documentElement) {
      var selector = current.tagName.toLowerCase();
      if (current.id) { selector += '#' + cssEscape(current.id); }
      else if (current.className && typeof current.className === 'string') {
        var classes = current.className.trim().split(/\\s+/).filter(function(c){return c;}).slice(0,3).map(cssEscape).join('.');
        if (classes) selector += '.' + classes;
      }
      if (!current.id) {
        var parent = current.parentElement;
        if (parent) {
          var siblings = Array.from(parent.children).filter(function(s){return s.tagName===current.tagName;});
          if (siblings.length > 1) { var idx = siblings.indexOf(current); selector += ':nth-of-type(' + (idx+1) + ')'; }
        }
      }
      parts.unshift(selector); current = current.parentElement;
    }
    return parts.join(' > ');
  }
  function extractRelevantStyles(cs) {
    return { fontSize:cs.fontSize, fontWeight:cs.fontWeight, fontFamily:cs.fontFamily, color:cs.color, backgroundColor:cs.backgroundColor, lineHeight:cs.lineHeight, letterSpacing:cs.letterSpacing, textAlign:cs.textAlign, textTransform:cs.textTransform, textDecoration:cs.textDecoration, fontStyle:cs.fontStyle, marginTop:cs.marginTop, marginRight:cs.marginRight, marginBottom:cs.marginBottom, marginLeft:cs.marginLeft, paddingTop:cs.paddingTop, paddingRight:cs.paddingRight, paddingBottom:cs.paddingBottom, paddingLeft:cs.paddingLeft, borderRadius:cs.borderRadius, borderColor:cs.borderColor, borderStyle:cs.borderStyle, borderWidth:cs.borderWidth, opacity:cs.opacity, boxShadow:cs.boxShadow, display:cs.display, flexDirection:cs.flexDirection, justifyContent:cs.justifyContent, alignItems:cs.alignItems, gap:cs.gap };
  }
  function findElementBySelectorPath(path) { try { return document.querySelector(path); } catch(e) { return null; } }

  function createHoverOverlay() {
    if (hoverOverlay) return hoverOverlay;
    hoverOverlay = document.createElement('div');
    hoverOverlay.setAttribute('data-design-mode-overlay','true');
    hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;background:rgba(59,130,246,0.06);outline:1.5px solid rgba(59,130,246,0.35);outline-offset:-1px;border-radius:2px;transition:all 0.12s ease-out;';
    document.body.appendChild(hoverOverlay); return hoverOverlay;
  }
  function createCornerHandles() {
    if (cornerHandles.length > 0) return cornerHandles;
    for (var i = 0; i < 4; i++) {
      var handle = document.createElement('div');
      handle.setAttribute('data-design-mode-overlay','true');
      handle.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;width:6px;height:6px;background:white;border:1.5px solid #3b82f6;border-radius:1px;display:none;';
      document.body.appendChild(handle); cornerHandles.push(handle);
    }
    return cornerHandles;
  }
  function createSelectOverlay() {
    if (selectOverlay) return selectOverlay;
    selectOverlay = document.createElement('div');
    selectOverlay.setAttribute('data-design-mode-overlay','true');
    selectOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #3b82f6;outline-offset:-1px;border-radius:2px;box-shadow:0 0 0 1px rgba(59,130,246,0.15);';
    document.body.appendChild(selectOverlay);
    sizeLabel = document.createElement('div');
    sizeLabel.setAttribute('data-design-mode-overlay','true');
    sizeLabel.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:rgba(59,130,246,0.92);color:white;font-size:10px;padding:2px 5px;border-radius:2px;font-family:ui-monospace,monospace;white-space:nowrap;letter-spacing:0.3px;display:none;';
    document.body.appendChild(sizeLabel);
    elementInfo = document.createElement('div');
    elementInfo.setAttribute('data-design-mode-overlay','true');
    elementInfo.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:rgba(17,24,39,0.88);color:#e5e7eb;font-size:10px;padding:2px 6px;border-radius:2px;font-family:ui-monospace,monospace;white-space:nowrap;display:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;';
    document.body.appendChild(elementInfo);
    createCornerHandles(); return selectOverlay;
  }
  function positionOverlay(o, el) { var r = el.getBoundingClientRect(); o.style.left=r.left+'px'; o.style.top=r.top+'px'; o.style.width=r.width+'px'; o.style.height=r.height+'px'; }
  function positionCornerHandles(el) {
    var r = el.getBoundingClientRect(), handles = createCornerHandles(), s = 8;
    var offsets = [{left:r.left-s/2,top:r.top-s/2},{left:r.right-s/2,top:r.top-s/2},{left:r.left-s/2,top:r.bottom-s/2},{left:r.right-s/2,top:r.bottom-s/2}];
    for (var i = 0; i < 4; i++) { handles[i].style.left=offsets[i].left+'px'; handles[i].style.top=offsets[i].top+'px'; }
  }
  function updateSizeLabel(el) { if (!sizeLabel) return; var r = el.getBoundingClientRect(); var w=Math.round(r.width), h=Math.round(r.height); sizeLabel.textContent=w+' \\u00D7 '+h; sizeLabel.style.left=(r.right-sizeLabel.offsetWidth)+'px'; sizeLabel.style.top=(r.top-22)+'px'; sizeLabel.style.display=(w>30&&h>16)?'block':'none'; }
  function updateElementInfo(el) {
    if (!elementInfo) return;
    var tag = el.tagName.toLowerCase(), cls = '';
    if (el.id) { cls = '#' + el.id; }
    else if (el.className && typeof el.className === 'string') { var classes = el.className.trim().split(/\\s+/).filter(function(c){return c;}).slice(0,2); if (classes.length > 0) cls = '.' + classes.join('.'); }
    elementInfo.textContent = '<' + tag + cls + '>';
    var r = el.getBoundingClientRect(); elementInfo.style.left = r.left+'px'; elementInfo.style.top = (r.bottom+4)+'px'; elementInfo.style.display = 'block';
  }
  function hideHoverOverlay() { if (hoverOverlay) hoverOverlay.style.display='none'; }
  function hideSelectOverlay() {
    if (selectOverlay) selectOverlay.style.display='none'; if (sizeLabel) sizeLabel.style.display='none'; if (elementInfo) elementInfo.style.display='none';
    for (var i = 0; i < cornerHandles.length; i++) cornerHandles[i].style.display='none';
  }
  function showSelectOverlay(el) {
    var o=createSelectOverlay(); positionOverlay(o,el); o.style.display='block'; updateSizeLabel(el); updateElementInfo(el);
    var handles=createCornerHandles(); positionCornerHandles(el); for(var i=0;i<4;i++) handles[i].style.display='block';
  }
  function repositionOverlays() {
    if (selectedElement) { positionOverlay(selectOverlay,selectedElement); updateSizeLabel(selectedElement); updateElementInfo(selectedElement); positionCornerHandles(selectedElement); }
    if (hoveredElement && isDesignModeActive) { positionOverlay(hoverOverlay,hoveredElement); }
  }

  var CSS_PROP_MAP = { fontSize:'fontSize', fontWeight:'fontWeight', fontFamily:'fontFamily', color:'color', backgroundColor:'backgroundColor', lineHeight:'lineHeight', letterSpacing:'letterSpacing', textAlign:'textAlign', textTransform:'textTransform', textDecoration:'textDecoration', fontStyle:'fontStyle', marginTop:'marginTop', marginRight:'marginRight', marginBottom:'marginBottom', marginLeft:'marginLeft', paddingTop:'paddingTop', paddingRight:'paddingRight', paddingBottom:'paddingBottom', paddingLeft:'paddingLeft', borderRadius:'borderRadius', borderColor:'borderColor', borderStyle:'borderStyle', borderWidth:'borderWidth', opacity:'opacity', boxShadow:'boxShadow', display:'display', flexDirection:'flexDirection', justifyContent:'justifyContent', alignItems:'alignItems', gap:'gap', fill:'fill', stroke:'stroke' };
  function applyStyleToElement(uid, styles) {
    var el=findElementBySelectorPath(uid); if(!el)return; var isSvg=el instanceof SVGElement;
    for(var p in styles){var c=CSS_PROP_MAP[p];if(!c)continue; if(isSvg&&(p==='fill'||p==='stroke')){el.setAttribute(c,styles[p]);}else{el.style[c]=styles[p];}}
    if(el===selectedElement)scheduleRepositionSelectedOverlay();
  }
  function isLeafTextElement(el) { var tag=el.tagName.toLowerCase(); return ['span','p','h1','h2','h3','h4','h5','h6','label','a','li','td','th','dt','dd','em','strong','small','b','i','u','code','pre','blockquote','figcaption'].indexOf(tag)!==-1; }
  function findFirstLeafText(el) { for(var i=0;i<el.children.length;i++){var ch=el.children[i]; if(isLeafTextElement(ch)&&ch.childNodes.length<=1)return ch;} return null; }
  function updateTextContent(uid, text) {
    var el=findElementBySelectorPath(uid); if(!el)return;
    if(el.children.length===0||isLeafTextElement(el)){el.textContent=text;return;}
    var nodes=Array.from(el.childNodes); for(var i=0;i<nodes.length;i++){if(nodes[i].nodeType===3&&nodes[i].textContent&&nodes[i].textContent.trim()){nodes[i].textContent=text;return;}}
    var leaf=findFirstLeafText(el); if(leaf)leaf.textContent=text;
  }

  var _repositionRafPending = false;
  function scheduleRepositionSelectedOverlay() {
    if (_repositionRafPending) return;
    _repositionRafPending = true;
    requestAnimationFrame(function() {
      _repositionRafPending = false;
      if (selectedElement) showSelectOverlay(selectedElement);
    });
  }

  var observer = null;
  function setupMutationObserver() {
    if (observer) return;
    observer = new MutationObserver(function(mutations) {
      if (!selectedElement || !isDesignModeActive) return;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'childList') {
          var removed = mutations[i].removedNodes;
          for (var j = 0; j < removed.length; j++) {
            if (removed[j] === selectedElement || (removed[j].contains && removed[j].contains(selectedElement))) {
              selectedElement = null; hideSelectOverlay(); window.parent.postMessage({type:'ELEMENT_DESELECTED'},'*'); return;
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  function handleMouseOver(e) { if(!isDesignModeActive)return; var t=e.target; if(!t||t===document.body||t===document.documentElement)return; if(t.closest&&t.closest('[data-design-mode-overlay]'))return; e.stopPropagation(); hoveredElement=t; var uid=buildCssSelectorPath(t); var o=createHoverOverlay(); o.style.display='block'; positionOverlay(o,t); window.parent.postMessage({type:'ELEMENT_HOVER',uid:uid,selector:uid,tagName:t.tagName.toLowerCase(),textContent:(t.textContent||'').slice(0,100),className:(typeof t.className==='string')?t.className:''},'*'); }
  function handleClick(e) { if(!isDesignModeActive)return; var t=e.target; if(!t||t===document.body||t===document.documentElement)return; if(t.closest&&t.closest('[data-design-mode-overlay]'))return; e.preventDefault(); e.stopPropagation(); selectedElement=t; var uid=buildCssSelectorPath(t); var cs=window.getComputedStyle(t); showSelectOverlay(t); hideHoverOverlay(); window.parent.postMessage({type:'ELEMENT_SELECT',uid:uid,selector:uid,tagName:t.tagName.toLowerCase(),textContent:(t.textContent||'').slice(0,100),className:(typeof t.className==='string')?t.className:'',computedStyle:extractRelevantStyles(cs)},'*'); }
  function handleMouseLeave() { if(!isDesignModeActive)return; hideHoverOverlay(); hoveredElement=null; }
  function handleKeyDown(e) {
    if(!isDesignModeActive)return;
    // 在 iframe 内捕获的键盘事件通过 postMessage 转发给父页面
    if(e.key==='Escape'){window.parent.postMessage({type:'SDK_KEY_DOWN',key:'Escape'},'*');}
  }
  function handleMessage(e) { if(!e.data||!e.data.type)return; switch(e.data.type) { case 'DESIGN_MODE_UPDATE': isDesignModeActive=!!e.data.active; if(isDesignModeActive)enableDesignMode();else disableDesignMode(); break; case 'SELECT': var el=findElementBySelectorPath(e.data.uid||e.data.selector); if(el){selectedElement=el;showSelectOverlay(el);} break; case 'DESELECT': selectedElement=null;hideSelectOverlay(); break; case 'HOVER': var el2=findElementBySelectorPath(e.data.uid||e.data.selector); if(el2){var ov=createHoverOverlay();ov.style.display='block';positionOverlay(ov,el2);} break; case 'APPLY_STYLE': var s=Object.assign({},e.data.styles); var _applyUid=e.data.uid; if('textContent' in s){updateTextContent(_applyUid,s.textContent);delete s.textContent;} if(Object.keys(s).length>0){applyStyleToElement(_applyUid,s);}else{var _applyEl=findElementBySelectorPath(_applyUid);if(_applyEl&&_applyEl===selectedElement)scheduleRepositionSelectedOverlay();} break; case 'REQUEST_ELEMENT_INFO': var el3=findElementBySelectorPath(e.data.uid); if(el3){var cs3=window.getComputedStyle(el3);window.parent.postMessage({type:'ELEMENT_INFO',uid:e.data.uid,computedStyle:extractRelevantStyles(cs3)},'*');} break; } }
  function enableDesignMode() { if (designModeListenersAttached) return; designModeListenersAttached = true; setupMutationObserver(); document.addEventListener('mouseover',handleMouseOver,{capture:true}); document.addEventListener('click',handleClick,{capture:true}); document.addEventListener('mouseleave',handleMouseLeave,{capture:true}); document.addEventListener('keydown',handleKeyDown,true); window.addEventListener('scroll',repositionOverlays,true); window.addEventListener('resize',repositionOverlays,true); document.body.style.cursor='crosshair'; }
  function disableDesignMode() { if (!designModeListenersAttached) return; designModeListenersAttached = false; document.removeEventListener('mouseover',handleMouseOver,{capture:true}); document.removeEventListener('click',handleClick,{capture:true}); document.removeEventListener('mouseleave',handleMouseLeave,{capture:true}); document.removeEventListener('keydown',handleKeyDown,true); window.removeEventListener('scroll',repositionOverlays,true); window.removeEventListener('resize',repositionOverlays,true); document.body.style.cursor=''; hideHoverOverlay(); hideSelectOverlay(); selectedElement=null; hoveredElement=null; }
  window.addEventListener('message',handleMessage);
  window.parent.postMessage({type:'DESIGN_MODE_READY'},'*');
})();
`;
}
