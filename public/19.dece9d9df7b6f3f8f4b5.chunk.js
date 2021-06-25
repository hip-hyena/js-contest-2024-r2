(this.webpackJsonp=this.webpackJsonp||[]).push([[19,20],{19:function(t,e,i){"use strict";i.r(e);var s=i(33),a=i(34),n=i(15),r=i(77),o=i(59),c=i(31),l=i(90),d=i(94),u=i(29),p=i(13),h=i(82),m=i(2),w=i(27),b=i(103),g=i(36),v=i(54);let y;const P=new o.a("page-password",!0,()=>{const t=new h.a({className:"page-password",withInputWrapper:!0,titleLangKey:"Login.Password.Title",subtitleLangKey:"Login.Password.Subtitle"}),e=Object(c.a)("btn-primary btn-color-primary"),n=new p.default.IntlElement({key:"Login.Next"});e.append(n.element);const o=new l.a({label:"LoginPassword",name:"password"});let P;y=o.input,t.inputWrapper.append(o.container,e);let k,f=()=>(P||(P=window.setInterval(f,1e4)),r.a.getState().then(t=>{k=t,k.hint?Object(g.a)(o.label,Object(b.a)(u.b.wrapEmojiText(k.hint))):o.setLabel()}));const E=t=>{if(t&&Object(m.a)(t),!y.value.length)return void y.classList.add("error");const a=Object(v.a)([y,e],!0);let c=y.value;n.update({key:"PleaseWait"});const l=Object(s.f)(e);r.a.check(c,k).then(t=>{switch(t._){case"auth.authorization":clearInterval(P),i.e(5).then(i.bind(null,17)).then(t=>{t.default.mount()}),A&&A.remove();break;default:e.removeAttribute("disabled"),n.update({key:t._}),l.remove()}}).catch(t=>{a(),o.input.classList.add("error"),t.type,n.update({key:"PASSWORD_HASH_INVALID"}),y.select(),l.remove(),f()})};Object(w.b)(e,E),y.addEventListener("keypress",(function(t){if(this.classList.remove("error"),n.update({key:"Login.Next"}),"Enter"===t.key)return E()}));const L=a.b.isMobile?100:166,A=new d.a(o,L);return t.imageDiv.append(A.container),Promise.all([A.load(),f()])},null,()=>{y.focus(),n.default.pushToState("authState",{_:"authStatePassword"})});e.default=P},54:function(t,e,i){"use strict";function s(t,e){return e?t.forEach(t=>t.setAttribute("disabled","true")):t.forEach(t=>t.removeAttribute("disabled")),()=>s(t,!e)}i.d(e,"a",(function(){return s}))},77:function(t,e,i){"use strict";var s=i(25),a=i(32),n=i(26);const r=new class{getState(){return n.a.invokeApi("account.getPassword").then(t=>t)}updateSettings(t={}){return this.getState().then(e=>{let i,s;const a={password:null,new_settings:{_:"account.passwordInputSettings",hint:t.hint,email:t.email}};i=t.currentPassword?n.a.computeSRP(t.currentPassword,e):Promise.resolve({_:"inputCheckPasswordEmpty"});const r=e.new_algo,o=new Uint8Array(r.salt1.length+32);return o.randomize(),o.set(r.salt1,0),r.salt1=o,s=t.newPassword?n.a.computeSRP(t.newPassword,e,!0):Promise.resolve(new Uint8Array),Promise.all([i,s]).then(t=>(a.password=t[0],a.new_settings.new_algo=r,a.new_settings.new_password_hash=t[1],n.a.invokeApi("account.updatePasswordSettings",a)))})}check(t,e,i={}){return n.a.computeSRP(t,e).then(t=>n.a.invokeApi("auth.checkPassword",{password:t},i).then(t=>("auth.authorization"===t._&&(a.a.saveApiUser(t.user),n.a.setUserAuth(t.user.id)),t)))}confirmPasswordEmail(t){return n.a.invokeApi("account.confirmPasswordEmail",{code:t})}resendPasswordEmail(){return n.a.invokeApi("account.resendPasswordEmail")}cancelPasswordEmail(){return n.a.invokeApi("account.cancelPasswordEmail")}};s.a.passwordManager=r,e.a=r},82:function(t,e,i){"use strict";i.d(e,"a",(function(){return a}));var s=i(13);class a{constructor(t){this.element=document.body.querySelector("."+t.className),this.container=document.createElement("div"),this.container.className="container center-align",this.imageDiv=document.createElement("div"),this.imageDiv.className="auth-image",this.title=document.createElement("h4"),t.titleLangKey&&this.title.append(Object(s.i18n)(t.titleLangKey)),this.subtitle=document.createElement("p"),this.subtitle.className="subtitle",t.subtitleLangKey&&this.subtitle.append(Object(s.i18n)(t.subtitleLangKey)),this.container.append(this.imageDiv,this.title,this.subtitle),t.withInputWrapper&&(this.inputWrapper=document.createElement("div"),this.inputWrapper.className="input-wrapper",this.container.append(this.inputWrapper)),this.element.append(this.container)}}},90:function(t,e,i){"use strict";i.d(e,"a",(function(){return n}));var s=i(2),a=i(41);class n extends a.b{constructor(t={}){super(Object.assign({plainText:!0},t)),this.passwordVisible=!1,this.onVisibilityClick=t=>{Object(s.a)(t),this.passwordVisible=!this.passwordVisible,this.toggleVisible.classList.toggle("eye-hidden",this.passwordVisible),this.input.type=this.passwordVisible?"text":"password",this.onVisibilityClickAdditional&&this.onVisibilityClickAdditional()};const e=this.input;e.type="password",e.setAttribute("required",""),e.autocomplete="off";const i=document.createElement("input");i.classList.add("stealthy"),i.tabIndex=-1,i.type="password",e.parentElement.prepend(i),e.parentElement.insertBefore(i.cloneNode(),e.nextSibling);const a=this.toggleVisible=document.createElement("span");a.classList.add("toggle-visible","tgico"),this.container.classList.add("input-field-password"),this.container.append(a),a.addEventListener("click",this.onVisibilityClick),a.addEventListener("touchend",this.onVisibilityClick)}}},94:function(t,e,i){"use strict";i.d(e,"a",(function(){return a}));var s=i(43);class a{constructor(t,e){this.passwordInputField=t,this.size=e,this.needFrame=0,this.container=document.createElement("div"),this.container.classList.add("media-sticker-wrapper")}load(){return this.loadPromise?this.loadPromise:this.loadPromise=s.b.loadAnimationFromURL({container:this.container,loop:!1,autoplay:!1,width:this.size,height:this.size,noCache:!0},"assets/img/TwoFactorSetupMonkeyPeek.tgs").then(t=>(this.animation=t,this.animation.addEventListener("enterFrame",t=>{(1===this.animation.direction&&t>=this.needFrame||-1===this.animation.direction&&t<=this.needFrame)&&(this.animation.setSpeed(1),this.animation.pause())}),this.passwordInputField.onVisibilityClickAdditional=()=>{this.passwordInputField.passwordVisible?(this.animation.setDirection(1),this.animation.curFrame=0,this.needFrame=16,this.animation.play()):(this.animation.setDirection(-1),this.animation.curFrame=16,this.needFrame=0,this.animation.play())},s.b.waitForFirstFrame(t)))}remove(){this.animation&&this.animation.remove()}}}}]);
//# sourceMappingURL=19.dece9d9df7b6f3f8f4b5.chunk.js.map