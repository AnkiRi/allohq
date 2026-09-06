"use strict";var JoonSignup=(()=>{var u=Object.defineProperty;var y=Object.getOwnPropertyDescriptor;var f=Object.getOwnPropertyNames;var b=Object.prototype.hasOwnProperty;var x=(i,t)=>{for(var e in t)u(i,e,{get:t[e],enumerable:!0})},w=(i,t,e,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of f(t))!b.call(i,o)&&o!==e&&u(i,o,{get:()=>t[o],enumerable:!(a=y(t,o))||a.enumerable});return i};var P=i=>w(u({},"__esModule",{value:!0}),i);var E={};x(E,{init:()=>C});var h=`
  .allo-popup-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }
  .allo-popup-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .allo-popup-overlay.pos-bottom-left {
    align-items: flex-end;
    justify-content: flex-start;
    padding: 24px;
  }
  .allo-popup-overlay.pos-bottom-right {
    align-items: flex-end;
    justify-content: flex-end;
    padding: 24px;
  }
  .allo-popup-overlay.pos-top-bar {
    align-items: flex-start;
    background: transparent !important;
  }
  .allo-popup-overlay.pos-top-bar .allo-popup-container {
    max-width: none;
    width: 100%;
    border-radius: 0;
    max-height: min(70vh, 520px);
  }
  .allo-popup-container {
    position: relative;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
    max-width: 420px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    transform: translateY(20px);
    transition: transform 0.3s ease;
  }
  .allo-popup-overlay.visible .allo-popup-container {
    transform: translateY(0);
  }
  .allo-popup-overlay.anim-scale .allo-popup-container {
    transform: scale(0.9);
  }
  .allo-popup-overlay.anim-scale.visible .allo-popup-container {
    transform: scale(1);
  }
  .allo-popup-overlay.anim-slide-up .allo-popup-container {
    transform: translateY(40px);
  }
  .allo-popup-overlay.anim-slide-up.visible .allo-popup-container {
    transform: translateY(0);
  }
  .allo-popup-overlay.anim-slide-down .allo-popup-container {
    transform: translateY(-40px);
  }
  .allo-popup-overlay.anim-slide-down.visible .allo-popup-container {
    transform: translateY(0);
  }
  .allo-popup-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: rgba(0,0,0,0.06);
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #666;
    transition: background 0.2s, color 0.2s;
    z-index: 1;
  }
  .allo-popup-close:hover {
    background: rgba(0,0,0,0.12);
    color: #333;
  }
  .allo-popup-body {
    padding: 8px;
  }
  .allo-popup-success {
    padding: 32px 24px;
    text-align: center;
  }
  .allo-popup-success h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 8px;
  }
  .allo-popup-success p {
    font-size: 14px;
    color: #666;
    margin: 0;
  }
  .allo-popup-discount {
    margin-top: 16px;
    padding: 12px;
    background: #f0fdf4;
    border: 1px dashed #16a34a;
    border-radius: 8px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #16a34a;
  }
  @media (max-width: 520px) {
    .allo-popup-overlay.pos-bottom-left,
    .allo-popup-overlay.pos-bottom-right { padding: 12px; }
    .allo-popup-container { max-height: calc(100vh - 24px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .allo-popup-overlay,
    .allo-popup-container { transition: none !important; }
  }
`;function v(i,t,e){if(t.pageUrl&&!S(t.pageUrl))return()=>{};let a=()=>{};switch(i){case"exit_intent":{if(window.matchMedia("(pointer: coarse)").matches){let s=setTimeout(e,Math.max(t.delayMs??1e4,6e3));a=()=>clearTimeout(s);break}let o=s=>{s.clientY<=5&&(e(),document.removeEventListener("mouseout",o))};document.addEventListener("mouseout",o),a=()=>document.removeEventListener("mouseout",o);break}case"scroll":{let o=t.scrollPercent??50,s=()=>{window.scrollY/(document.body.scrollHeight-window.innerHeight)*100>=o&&(e(),window.removeEventListener("scroll",s))};window.addEventListener("scroll",s,{passive:!0}),a=()=>window.removeEventListener("scroll",s);break}case"timer":{let o=t.delayMs??5e3,s=setTimeout(e,o);a=()=>clearTimeout(s);break}case"page_load":{let o=setTimeout(e,500);a=()=>clearTimeout(o);break}}return a}function S(i){let t=window.location.pathname;return new RegExp("^"+i.replace(/\*/g,".*").replace(/\?/g,".")+"$").test(t)}var m="joon_popup_dismissed",c=class{constructor(t){this.popups=[];this.activePopupId=null;this.shadow=null;this.overlay=null;this.cleanups=[];this.config=t}async init(){await this.fetchPopups(),this.popups.length!==0&&(this.createShadowHost(),this.registerTriggers())}async fetchPopups(){try{let t=`${this.config.apiUrl}/widget/popups`,e=await fetch(t,{headers:{"X-Joon-Publishable-Key":this.config.apiKey,Authorization:await this.config.visitorSession.authorization()}});if(!e.ok)return;this.popups=await e.json()}catch{}}createShadowHost(){let t=document.createElement("div");t.id="allohq-popup",document.body.appendChild(t),this.shadow=t.attachShadow({mode:"closed"});let e=document.createElement("style");e.textContent=h,this.shadow.appendChild(e),this.overlay=document.createElement("div"),this.overlay.className="allo-popup-overlay",this.overlay.addEventListener("click",a=>{a.target===this.overlay&&this.hide()}),this.shadow.appendChild(this.overlay)}registerTriggers(){for(let t of this.popups){if(this.isDismissed(t.popupId,t.triggerConfig.frequencyDays??7))continue;let e=v(t.trigger,t.triggerConfig,()=>this.show(t));this.cleanups.push(e)}}show(t){if(this.activePopupId||!this.overlay||!this.shadow)return;this.activePopupId=t.popupId;let e=t.styling.position?`pos-${t.styling.position}`:"",a=t.styling.animation?`anim-${t.styling.animation}`:"";this.overlay.className=`allo-popup-overlay ${e} ${a}`,t.styling.overlayColor?this.overlay.style.backgroundColor=t.styling.overlayColor:this.overlay.style.backgroundColor="rgba(0,0,0,0.5)";let o=document.createElement("div");o.className="allo-popup-container",t.styling.width&&(o.style.maxWidth=t.styling.width);let s=document.createElement("button");s.className="allo-popup-close",s.innerHTML="&#x2715;",s.type="button",s.setAttribute("aria-label","Close signup form"),s.addEventListener("click",()=>this.hide()),o.appendChild(s);let n=document.createElement("div");n.className="allo-popup-body";let r=document.createElement("style");r.textContent=t.formCss,n.appendChild(r),n.innerHTML+=t.formHtml,o.appendChild(n),this.overlay.innerHTML="";let p=document.createElement("style");p.textContent=h,this.overlay.appendChild(p),this.overlay.appendChild(o);let l=o.querySelector("form[data-allo-form]");l&&l.addEventListener("submit",g=>{g.preventDefault(),this.handleSubmit(t.popupId,l,o)}),requestAnimationFrame(()=>{this.overlay.classList.add("visible")}),this.trackEvent("popup_view",{popupId:t.popupId})}hide(){!this.overlay||!this.activePopupId||(this.setDismissed(this.activePopupId),this.overlay.classList.remove("visible"),this.activePopupId=null,setTimeout(()=>{this.overlay&&(this.overlay.innerHTML="")},300))}async handleSubmit(t,e,a){let o=new FormData(e),s={};o.forEach((n,r)=>{s[r]=n.toString()});try{let n=await fetch(`${this.config.apiUrl}/widget/submit`,{method:"POST",headers:{"Content-Type":"application/json","X-Joon-Publishable-Key":this.config.apiKey,Authorization:await this.config.visitorSession.authorization()},body:JSON.stringify({popupId:t,data:s,source:"popup"})}),r=await n.json();if(!n.ok)throw Error(typeof r?.error=="string"?r.error:"Failed");let p=a.querySelector(".allo-popup-body");if(p){let l=`<div class="allo-popup-success">
          <h3>Thank you!</h3>
          <p>You've been successfully subscribed.</p>`;r.discountCode&&(l+=`<div class="allo-popup-discount">${r.discountCode}</div>
          <p style="margin-top:8px;font-size:12px;color:#666">Use this code at checkout</p>`),l+="</div>",p.innerHTML=l}this.trackEvent("form_submit",{popupId:t}),setTimeout(()=>this.hide(),3e3)}catch{if(!e.querySelector("[role=alert]")){let n=document.createElement("p");n.setAttribute("role","alert"),n.textContent="Please try again.",e.appendChild(n)}}}async trackEvent(t,e){fetch(`${this.config.apiUrl}/v1/events`,{method:"POST",headers:{"Content-Type":"application/json","X-Joon-Publishable-Key":this.config.apiKey,Authorization:await this.config.visitorSession.authorization()},body:JSON.stringify({type:t,data:{...e,visitorId:this.config.visitorSession.visitorId},timestamp:Date.now()})}).catch(()=>{})}isDismissed(t,e){try{let a=JSON.parse(localStorage.getItem(m)??"{}"),o=typeof a?.[t]=="number"?a[t]:0;return e>0&&Date.now()-o<e*864e5}catch{return!1}}setDismissed(t){try{let e=JSON.parse(localStorage.getItem(m)??"{}");e[t]=Date.now(),localStorage.setItem(m,JSON.stringify(e))}catch{}}};function k(){let i="allohq_visitor_id";try{let t=localStorage.getItem(i);if(t)return t;let e=`v_${crypto.randomUUID()}`;return localStorage.setItem(i,e),e}catch{return`v_${crypto.randomUUID()}`}}var d=class{constructor(t,e){this.apiKey=t;this.apiUrl=e;this.visitorId=k();this.token=null;this.expiresAt=0;this.pending=null}async authorization(){if(this.token&&this.expiresAt>Math.floor(Date.now()/1e3)+30)return`Bearer ${this.token}`;this.pending||(this.pending=this.refresh());try{return`Bearer ${await this.pending}`}finally{this.pending=null}}async refresh(){let t=await fetch(`${this.apiUrl}/v1/visitor-token`,{method:"POST",headers:{"Content-Type":"application/json","X-Joon-Publishable-Key":this.apiKey},body:JSON.stringify({visitorId:this.visitorId})});if(!t.ok)throw new Error(`Visitor authentication failed: ${t.status}`);let e=await t.json();return this.token=e.token,this.expiresAt=e.expiresAt,e.token}};function C(i){let t=new d(i.apiKey,i.apiUrl);new c({apiKey:i.apiKey,apiUrl:i.apiUrl,popupIds:[],visitorSession:t}).init()}return P(E);})();
