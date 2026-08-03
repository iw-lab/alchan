import{u as xe,r as m,j as r,g as ne,i as oe,c as de,o as fe,k as je,l as x,z as Ne,d as we,p as A,q as B}from"./index-Bxlg2TS8.js";import{u as ye,r as K}from"./AlchanLayout-fw8l39bG.js";import{q as ve}from"./firebaseDb-Dm8oA59Q.js";import{i as ke,N as Ae}from"./netAssets-Bu_bCvUF.js";import"./eye-BLxh7JyB.js";import"./createLucideIcon-BvBNd_Xc.js";import"./users-AKv-OQ4J.js";import"./trash-2-ryfMF-dC.js";import"./file-text-BaA1ont-.js";import"./download-BXN3eWuK.js";function qe(){const l=xe(),b=ye(),_=l?.users??[],z=l?.loading??!0,I=z?null:l?.user,k=z?null:l?.userDoc,T=l?.optimisticUpdate,F=k?.cash??0,i=I?.uid||k?.id,h=k?.classCode,V=b?.loading??!0,Y=V?[]:b?.userItems??[],[u,f]=m.useState("ongoing"),[w,X]=m.useState(""),[c,j]=m.useState(null),[o,C]=m.useState({assetId:null,assetType:"item",name:"",description:"",startPrice:"",duration:"1"}),[g,J]=m.useState({}),[P,Q]=m.useState(null),[q,le]=m.useState(new Date),[y,R]=m.useState([]),[ce,D]=m.useState(!0),p=e=>typeof e!="number"||isNaN(e)?"가격 정보 없음":`${e.toLocaleString("ko-KR")}${ne()}`;m.useEffect(()=>{const e=setInterval(()=>le(new Date),6e4);return()=>clearInterval(e)},[]);const me=async e=>{if(!(!h||!e?.id))try{await A(B,"settleAuction")({auctionId:e.id}),l.refreshUserDocument&&l.refreshUserDocument(),b.refreshData&&b.refreshData()}catch(t){x.error(`[Auction Settle] 정산 CF 실패 ${e.id}:`,t)}};m.useEffect(()=>{if(!h||!i){D(!1),R([]);return}(async()=>{try{D(!0);const t=oe(de,"classes",h,"auctions"),s=ve(t,fe("endTime","desc")),v=(await je(s)).docs.map(n=>({id:n.id,...n.data(),endTime:n.data().endTime?.toDate?n.data().endTime.toDate():null}));R(v),D(!1);const N=new Date,G=v.filter(n=>n.status==="ongoing"&&n.endTime&&n.endTime<=N);G.length>0&&(x.log(`[Auction] 정산할 경매 ${G.length}개 발견.`),G.forEach(n=>me(n)));const he=4320*60*1e3,S=v.filter(n=>(n.status==="completed"||n.status==="error")&&n.endTime&&N.getTime()-n.endTime.getTime()>he);if(S.length>0){x.log(`[Auction] ${S.length}개 오래된 완료 경매 자동 삭제`);const n=oe(de,"classes",h,"auctions");for(const $ of S)try{await Ne(we(n,$.id))}catch(H){x.error(`[Auction] 자동 삭제 실패 ${$.id}:`,H)}R($=>$.filter(H=>!S.some(ue=>ue.id===H.id)))}}catch(t){x.error("[Auction] 경매 데이터 로드 오류:",t),a("경매 데이터를 불러오는 중 오류가 발생했습니다.","error"),D(!1)}})()},[h,i]),m.useEffect(()=>{if(c){if(!c.type||c.type!=="item"){a("선택된 자산의 타입을 식별할 수 없거나 아이템이 아닙니다.","error"),j(null);return}C(e=>({...e,assetId:c.id,assetType:c.type,name:c.name||"이름 없음",description:c.description||"",startPrice:"",duration:"1"}))}else C(e=>({...e,assetId:null,assetType:"item",name:"",description:"",startPrice:"",duration:"1"}))},[c]);const W=y.filter(e=>e.status==="ongoing").filter(e=>w===""||e.name.toLowerCase().includes(w.toLowerCase())||e.description&&e.description.toLowerCase().includes(w.toLowerCase())),Z=y.filter(e=>e.seller===i),ee=y.filter(e=>e.highestBidder===i&&e.seller!==i),re=y.filter(e=>e.status==="completed"||e.status==="error"),U=e=>{if(!(e instanceof Date)||isNaN(e.getTime()))return"시간 정보 없음";const t=e.getTime()-q.getTime();if(t<=0)return"종료됨";const s=Math.floor(t/(1e3*60*60*24)),d=Math.floor(t/(1e3*60*60)%24),v=Math.floor(t/1e3/60%60);let N="";return s>0&&(N+=`${s}일 `),(d>0||s>0)&&(N+=`${d}시간 `),(v>0||s===0&&d===0)&&(N+=`${v}분`),N.trim()||"곧 종료"},a=(e,t="info")=>{Q({message:e,type:t}),setTimeout(()=>Q(null),3500)},L=m.useRef(new Set),E=m.useRef(!1),te=async e=>{if(!i||!h){a("로그인이 필요하거나 학급 정보가 없습니다.","error");return}if(L.current.has(e))return;const t=y.find(d=>d.id===e);if(!t){a("경매 정보를 찾을 수 없습니다 (로컬 상태).","error");return}const s=parseInt(g[e]||"0",10);if(!s||isNaN(s)||s<=0){a("유효한 입찰 금액을 입력하세요.","error");return}if(s<=t.currentBid){a(`현재가 (${p(t.currentBid)})보다 높은 금액을 입력하세요.`,"error");return}if(s>F&&a(`보유 금액(${p(F)})이 부족합니다. 트랜잭션에서 다시 확인됩니다.`,"warning"),t.seller===i){a("자신의 경매에는 입찰할 수 없습니다.","error");return}if(await ke(k)){a(Ae,"error");return}if(!t.endTime||!(t.endTime instanceof Date)||t.endTime<=q||t.status!=="ongoing"){a("이미 종료되었거나 유효하지 않은 경매입니다.","error");return}L.current.add(e),T&&T({cash:-s});try{await A(B,"placeBid")({auctionId:e,amount:s,idempotencyKey:crypto.randomUUID()}),l.refreshUserDocument&&l.refreshUserDocument(),a("입찰이 성공적으로 완료되었습니다.","success"),J({...g,[e]:""})}catch(d){x.error("[Auction Bid] 입찰 오류:",d),a(`입찰 실패: ${d.message}`,"error"),T&&T({cash:s})}finally{L.current.delete(e)}},pe=async e=>{if(e.preventDefault(),!i||!h||!I){a("로그인이 필요하거나 학급 또는 사용자 정보가 없습니다.","error");return}if(!c||!o.assetId||o.assetType!=="item"){a("경매에 등록할 아이템을 선택해주세요.","error");return}const t=parseFloat(o.startPrice);if(isNaN(t)||t<=0){a("유효한 시작가를 입력해주세요.","error");return}const s=parseInt(o.duration,10);if(isNaN(s)||s<1||s>24){a("유효한 경매 기간(1-24시간)을 선택해주세요.","error");return}if(!E.current){E.current=!0;try{await A(B,"createAuction")({assetId:o.assetId,startPrice:t,durationHours:s,sourceCollection:c.source||"inventory",name:o.name,description:o.description,idempotencyKey:crypto.randomUUID()}),C({assetId:null,assetType:"item",name:"",description:"",startPrice:"",duration:"1"}),j(null),b.refreshData&&b.refreshData(),a("경매가 성공적으로 등록되었습니다.","success"),f("myAuctions")}catch(d){x.error("[Auction Create] 경매 생성 오류:",d),a(`경매 등록 실패: ${d.message}`,"error")}finally{E.current=!1}}},ge=async e=>{if(!i||!h)return;const t=y.find(s=>s.id===e);if(!t||t.seller!==i){a("취소 권한이 없거나 존재하지 않는 경매입니다.","error");return}if(t.status!=="ongoing"){a("진행 중인 경매만 취소할 수 있습니다.","info");return}try{await A(B,"cancelAuction")({auctionId:e}),a("경매가 취소되었습니다.","success"),b.refreshData&&b.refreshData()}catch(s){x.error("[Auction Cancel] 경매 취소 오류:",s),a(`경매 취소 실패: ${s.message}`,"error")}},se=async e=>{if(!l.isAdmin()){a("관리자 권한이 없습니다.","error");return}if(!h||!e||e.status!=="ongoing"){a("진행 중인 경매만 취소할 수 있습니다.","error");return}if(window.confirm(`[관리자] '${e.name}' 경매를 강제로 취소하고 아이템을 판매자에게 반환하시겠습니까? 입찰금이 있다면 최고 입찰자에게 환불됩니다.`)){x.log(`[Admin Cancel] 관리자 취소 시도: ${e.id}`);try{await A(B,"cancelAuction")({auctionId:e.id}),a(`'${e.name}' 경매가 관리자에 의해 취소되었습니다.`,"success"),b.refreshData&&b.refreshData(),l.refreshAllUsers&&l.refreshAllUsers()}catch(t){x.error("[Admin Cancel] 관리자 경매 취소 오류:",t),a(`관리자 취소 실패: ${t.message}`,"error")}}},M=e=>{const{name:t,value:s}=e.target;t==="startPrice"&&s&&!/^\d*\.?\d*$/.test(s)||C({...o,[t]:s})},be=e=>{const t=e.target.value;if(!t){j(null);return}const s=Y.find(d=>d.id===t);if(s){if(!s.type||s.type!=="item"){a("선택된 자산 정보에 타입 속성이 없거나 아이템이 아닙니다.","error"),j(null);return}j(s)}else a("선택한 ID에 해당하는 아이템을 찾을 수 없습니다.","error"),j(null)},ie=(e,t)=>{const s=e.target.value;(s===""||/^\d+$/.test(s))&&J({...g,[t]:s})};if(z||V)return r.jsx(K,{});if(!I||!i)return r.jsx("div",{className:"login-required-container",children:"경매장을 이용하려면 로그인이 필요합니다."});if(!k)return r.jsx(K,{});if(!h)return r.jsx("div",{className:"login-required-container",children:"경매장을 이용하려면 학급 코드가 사용자 정보에 설정되어 있어야 합니다. (학급 코드: 없음)"});if(ce)return r.jsx(K,{});const ae=[];for(let e=1;e<=24;e++)ae.push(r.jsxs("option",{value:e,children:[e,"시간"]},e));const O=Y.filter(e=>e.quantity>=1&&e.type==="item");return r.jsxs("div",{className:"auction-container",children:[P&&r.jsx("div",{className:`notification notification-${P.type}`,children:P.message}),r.jsxs("header",{className:"auction-header",children:[r.jsx("h1",{children:"경매장"}),r.jsxs("div",{className:"auction-balance",children:[r.jsx("span",{children:"보유 잔고: "}),r.jsx("span",{className:"balance-amount",children:p(F)})]})]}),r.jsxs("nav",{className:"tab-container",children:[r.jsx("button",{className:`tab ${u==="ongoing"?"active":""}`,onClick:()=>f("ongoing"),children:"진행중"}),r.jsx("button",{className:`tab ${u==="myAuctions"?"active":""}`,onClick:()=>f("myAuctions"),children:"내 경매"}),r.jsx("button",{className:`tab ${u==="myBids"?"active":""}`,onClick:()=>f("myBids"),children:"내 입찰"}),r.jsx("button",{className:`tab ${u==="completed"?"active":""}`,onClick:()=>f("completed"),children:"종료됨"}),r.jsx("button",{className:`tab register-tab ${u==="register"?"active":""}`,onClick:()=>f("register"),children:"경매 등록"})]}),r.jsxs("main",{className:"tab-content",children:[u==="ongoing"&&r.jsxs("div",{className:"ongoing-auctions-content",children:[r.jsxs("div",{className:"search-bar",children:[r.jsx("input",{type:"text",placeholder:"경매 물품 검색...",value:w,onChange:e=>X(e.target.value),"aria-label":"경매 물품 검색"}),r.jsx("button",{onClick:()=>X(""),className:"search-reset-button","aria-label":"검색어 초기화",children:w?"초기화":"검색"})]}),W.length>0?r.jsx("div",{className:"auctions-grid",children:W.map(e=>r.jsxs("article",{className:"auction-card",children:[r.jsxs("div",{className:"auction-info",children:[r.jsxs("header",{className:"card-header",children:[r.jsxs("h3",{children:[r.jsx("span",{style:{marginRight:"5px"},children:e.itemIcon||"📦"}),e.name]}),r.jsx("span",{className:`time-left-badge ${!(e.endTime instanceof Date)||isNaN(e.endTime.getTime())?"error":""}`,title:e.endTime instanceof Date?e.endTime.toLocaleString():"종료 시간 정보 없음",children:U(e.endTime)})]}),r.jsx("p",{className:"auction-description",children:e.description||"설명 없음"}),r.jsxs("div",{className:"auction-price-details",children:[r.jsxs("p",{children:["시작가: ",r.jsx("span",{className:"price start-price",children:p(e.startPrice)})]}),r.jsxs("p",{children:["현재가: ",r.jsx("span",{className:"price current-price",children:p(e.currentBid)})]})]}),r.jsxs("p",{className:"auction-meta",children:[r.jsxs("span",{children:["입찰: ",e.bidCount,"회"]})," | ",r.jsxs("span",{children:["판매자: ",e.seller===i?"나":e.sellerName||e.seller?.substring(0,6)]})]}),e.highestBidder===i&&e.seller!==i&&r.jsx("p",{className:"bid-status-indicator highest",children:"현재 최고 입찰자입니다!"})]}),e.seller!==i&&e.status==="ongoing"&&e.endTime instanceof Date&&e.endTime>q&&r.jsx("footer",{className:"auction-actions",children:r.jsxs("div",{className:"bid-input-group",children:[r.jsx("input",{type:"text",inputMode:"numeric",pattern:"[0-9]*",className:"bid-input",placeholder:`${p(e.currentBid+1)} 이상`,value:g[e.id]||"",onChange:t=>ie(t,e.id),"aria-label":`${e.name} 입찰 금액`}),r.jsx("button",{className:"bid-button",onClick:()=>te(e.id),disabled:!g[e.id]||isNaN(parseInt(g[e.id]||"0",10))||parseInt(g[e.id]||"0",10)<=e.currentBid,children:"입찰"})]})}),e.seller===i&&e.status==="ongoing"&&r.jsx("footer",{className:"auction-actions owner-notice",children:r.jsx("span",{children:"내 경매 물품"})}),l.isAdmin()&&e.status==="ongoing"&&r.jsx("footer",{className:"auction-actions admin-actions",children:r.jsx("button",{className:"action-button admin-cancel-button",onClick:()=>se(e),children:"관리자 취소"})})]},e.id))}):r.jsx("div",{className:"no-results-message",children:w?"검색 결과가 없습니다.":"현재 진행 중인 경매가 없습니다."})]}),u==="myAuctions"&&r.jsxs("div",{className:"my-auctions-content",children:[r.jsx("h2",{children:"내 경매 물품"}),Z.length>0?r.jsx("div",{className:"list-view",children:Z.map(e=>r.jsxs("article",{className:"list-item my-auction-item",children:[r.jsxs("div",{className:"item-info",children:[r.jsxs("h3",{children:[r.jsx("span",{style:{marginRight:"5px"},children:e.itemIcon||"📦"}),e.name]}),r.jsx("p",{className:"item-description",children:e.description||"설명 없음"}),r.jsxs("div",{className:"price-details",children:[r.jsxs("span",{children:["시작가: ",p(e.startPrice)]}),r.jsxs("span",{children:["현재가: ",p(e.currentBid)]})]}),r.jsxs("p",{className:"meta-details",children:[r.jsxs("span",{children:["입찰: ",e.bidCount,"회"]})," | ",r.jsxs("span",{children:["남은 시간: ",U(e.endTime)]})]}),r.jsxs("p",{className:`status-indicator ${e.status==="ongoing"?"ongoing":"completed"}`,children:["상태: ",e.status==="ongoing"?"진행 중":e.highestBidder?"판매 완료":"유찰됨",e.status==="error"&&r.jsx("span",{className:"error-text",children:"(오류)"})]}),e.highestBidder&&r.jsxs("p",{className:"highest-bidder-info",children:["최고 입찰자: ",e.highestBidder===i?"나":_?.find(t=>t.id===e.highestBidder)?.name||e.highestBidder?.substring(0,6)]})]}),r.jsxs("div",{className:"item-actions",children:[e.status==="ongoing"&&e.bidCount===0&&e.seller===i&&r.jsx("button",{className:"action-button cancel-button",onClick:()=>ge(e.id),children:"등록 취소"}),e.status==="ongoing"&&e.bidCount>0&&r.jsx("span",{className:"action-status-text",children:"입찰 진행 중"}),l.isAdmin()&&e.status==="ongoing"&&r.jsx("button",{className:"action-button admin-cancel-button",onClick:()=>se(e),children:"관리자 취소"}),e.status==="completed"&&e.highestBidder&&r.jsx("span",{className:"action-status-text sold",children:"판매 완료"}),e.status==="completed"&&!e.highestBidder&&r.jsx("span",{className:"action-status-text unsold",children:"유찰됨"}),e.status==="error"&&r.jsx("span",{className:"action-status-text error",children:"오류 발생"})]})]},e.id))}):r.jsxs("div",{className:"no-results-message",children:[r.jsx("p",{children:"등록한 경매 물품이 없습니다."}),r.jsx("button",{className:"action-button primary",onClick:()=>f("register"),children:"경매 등록하기"})]})]}),u==="myBids"&&r.jsxs("div",{className:"my-bids-content",children:[r.jsx("h2",{children:"내 입찰 현황"}),ee.length>0?r.jsx("div",{className:"list-view",children:ee.map(e=>r.jsxs("article",{className:`list-item my-bid-item ${e.highestBidder===i?"status-highest":"status-outbid"}`,children:[r.jsxs("div",{className:"item-info",children:[r.jsxs("h3",{children:[r.jsx("span",{style:{marginRight:"5px"},children:e.itemIcon||"📦"}),e.name]}),r.jsx("p",{className:"item-description",children:e.description||"설명 없음"}),r.jsxs("p",{className:"bid-info",children:["내 최고 입찰가: ",r.jsx("span",{className:"price",children:p(e.currentBid)})]}),r.jsxs("p",{className:"meta-details",children:[r.jsxs("span",{children:["남은 시간: ",U(e.endTime)]})," | ",r.jsxs("span",{children:["판매자: ",e.seller===i?"나":e.sellerName||e.seller?.substring(0,6)]})]}),r.jsxs("p",{className:"status-indicator",children:["상태:",e.status==="completed"?e.highestBidder===i?r.jsx("span",{className:"won",children:"낙찰 완료"}):r.jsx("span",{className:"lost",children:"패찰"}):e.highestBidder===i?r.jsx("span",{className:"highest",children:"최고 입찰 중"}):r.jsx("span",{className:"outbid",children:"상회 입찰됨"})]})]}),e.status==="ongoing"&&e.highestBidder!==i&&r.jsxs("div",{className:"item-actions rebid-section",children:[r.jsx("input",{type:"text",inputMode:"numeric",pattern:"[0-9]*",className:"bid-input small",placeholder:`${p(e.currentBid+1)} 이상`,value:g[e.id]||"",onChange:t=>ie(t,e.id),"aria-label":`${e.name} 재입찰 금액`}),r.jsx("button",{className:"action-button rebid-button",onClick:()=>te(e.id),disabled:!g[e.id]||isNaN(parseInt(g[e.id]||"0",10))||parseInt(g[e.id]||"0",10)<=e.currentBid,children:"재입찰"})]}),e.status==="ongoing"&&e.highestBidder===i&&r.jsx("div",{className:"item-actions highest-bid-notice",children:r.jsx("span",{children:"최고 입찰자"})}),e.status==="completed"&&r.jsx("div",{className:"item-actions",children:r.jsx("span",{className:`action-status-text ${e.highestBidder===i?"won":"lost"}`,children:e.highestBidder===i?"낙찰":"패찰"})})]},e.id))}):r.jsxs("div",{className:"no-results-message",children:[r.jsx("p",{children:"입찰한 경매가 없습니다."}),r.jsx("button",{className:"action-button primary",onClick:()=>f("ongoing"),children:"경매 둘러보기"})]})]}),u==="completed"&&r.jsxs("div",{className:"completed-auctions-content",children:[r.jsx("h2",{children:"종료된 경매"}),re.length>0?r.jsx("div",{className:"list-view",children:re.map(e=>r.jsxs("article",{className:`list-item completed-item ${e.highestBidder===i?"result-won":""} ${e.seller===i?"result-sold":""} ${e.highestBidder?"":"result-unsold"}`,children:[r.jsxs("div",{className:"item-info",children:[r.jsxs("h3",{children:[r.jsx("span",{style:{marginRight:"5px"},children:e.itemIcon||"📦"}),e.name]}),r.jsx("p",{className:"item-description",children:e.description||"설명 없음"}),r.jsx("p",{className:"final-result",children:e.status==="error"?`오류 발생: ${e.error||"알 수 없는 오류"}`:e.highestBidder?`최종 낙찰가: ${p(e.currentBid)}`:`유찰됨 (시작가: ${p(e.startPrice)})`}),r.jsxs("p",{className:"meta-details",children:[r.jsxs("span",{children:["총 입찰: ",e.bidCount,"회"]})," | ",r.jsxs("span",{children:["판매자: ",e.seller===i?"나":e.sellerName||e.seller?.substring(0,6)]})]}),e.highestBidder&&r.jsxs("p",{className:"winner-info",children:["낙찰자: ",e.highestBidder===i?"나":_?.find(t=>t.id===e.highestBidder)?.name||e.highestBidder?.substring(0,6)]}),!e.highestBidder&&e.status!=="error"&&r.jsx("p",{className:"status-indicator unsold",children:"유찰됨"})]}),r.jsxs("div",{className:"item-actions result-badge",children:[e.highestBidder===i&&r.jsx("span",{className:"badge won",children:"낙찰 받음"}),e.seller===i&&e.highestBidder&&r.jsx("span",{className:"badge sold",children:"판매 완료"}),e.seller===i&&!e.highestBidder&&r.jsx("span",{className:"badge unsold",children:"유찰됨"}),e.seller!==i&&e.highestBidder!==i&&e.highestBidder&&r.jsx("span",{className:"badge neutral",children:"종료됨"}),e.seller!==i&&e.highestBidder!==i&&!e.highestBidder&&r.jsx("span",{className:"badge unsold",children:"유찰됨"}),e.status==="error"&&r.jsx("span",{className:"badge error",children:"오류"})]})]},e.id))}):r.jsx("div",{className:"no-results-message",children:r.jsx("p",{children:"종료된 경매가 없습니다."})})]}),u==="register"&&r.jsxs("div",{className:"register-auction-content",children:[r.jsx("h2",{children:"경매 물품 등록"}),r.jsxs("form",{className:"auction-form",onSubmit:pe,children:[r.jsxs("div",{className:"form-group",children:[r.jsx("label",{htmlFor:"auctionAssetSelect",children:"등록할 아이템 선택 *"}),r.jsxs("select",{id:"auctionAssetSelect",name:"auctionAssetSelect",className:"form-control",value:c?c.id:"",onChange:be,required:!0,"aria-describedby":"assetSelectHint",children:[r.jsx("option",{value:"",children:"-- 보유 아이템 목록 --"}),O.length>0&&r.jsx("optgroup",{label:"아이템 (수량 1개 이상)",children:O.map(e=>r.jsxs("option",{value:e.id,children:[e.icon," ",e.name," (수량: ",e.quantity,")"]},`item-${e.id}`))})]}),O.length===0&&r.jsx("p",{id:"assetSelectHint",className:"form-hint error",children:"경매에 등록할 수 있는 아이템(수량 1개 이상)이 없습니다."})]}),r.jsxs("div",{className:"form-group",children:[r.jsx("label",{htmlFor:"name",children:"물품명"}),r.jsx("input",{type:"text",id:"name",name:"name",className:"form-control",placeholder:"등록할 아이템을 선택하세요",value:o.name,readOnly:!0,"aria-label":"선택된 물품명"})]}),r.jsxs("div",{className:"form-group",children:[r.jsx("label",{htmlFor:"description",children:"물품 설명"}),r.jsx("textarea",{id:"description",name:"description",className:"form-control",rows:"3",placeholder:"자동 입력된 설명을 수정할 수 있습니다.",value:o.description,onChange:M,"aria-label":"물품 설명"})]}),r.jsxs("div",{className:"form-group",children:[r.jsxs("label",{htmlFor:"startPrice",children:["시작가 (",ne(),") *"]}),r.jsx("input",{type:"text",inputMode:"numeric",pattern:"[0-9]*",id:"startPrice",name:"startPrice",className:"form-control",placeholder:"경매 시작가를 숫자로 입력 (예: 10000)",value:o.startPrice,onChange:M,required:!0,"aria-required":"true","aria-label":"경매 시작가"})]}),r.jsxs("div",{className:"form-group",children:[r.jsx("label",{htmlFor:"duration",children:"경매 기간 *"}),r.jsx("select",{id:"duration",name:"duration",className:"form-control",value:o.duration,onChange:M,required:!0,"aria-required":"true","aria-label":"경매 기간 선택",children:ae})]}),r.jsxs("div",{className:"form-actions",children:[r.jsx("button",{type:"submit",className:"action-button primary register-button",disabled:!c||!o.startPrice||isNaN(parseFloat(o.startPrice))||parseFloat(o.startPrice)<=0||!o.duration||c.type!=="item",children:"경매 등록"}),r.jsx("button",{type:"button",className:"action-button cancel-button",onClick:()=>{j(null),f("ongoing")},children:"취소"})]})]})]})]}),r.jsx("style",{children:`
        /* --- Cyberpunk Dark Theme Styles --- */

        /* Admin Buttons */
        .action-button.admin-cancel-button {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(139, 92, 246, 0.1));
            color: #a78bfa;
            border: 1px solid rgba(139, 92, 246, 0.5);
        }
        .action-button.admin-cancel-button:hover {
            background: rgba(139, 92, 246, 0.4);
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
        }

        .auction-actions.admin-actions {
            background-color: rgba(139, 92, 246, 0.1);
            border-top: 1px solid rgba(139, 92, 246, 0.3);
            padding: 10px 15px;
        }

        .badge.error {
            background-color: rgba(239, 68, 68, 0.8);
        }
        .action-status-text.error {
          color: #f87171;
          background-color: rgba(239, 68, 68, 0.1);
          font-weight: 600;
        }
        .error-text {
            color: #f87171;
            font-weight: bold;
            margin-left: 5px;
        }
        .completed-item .final-result {
            font-size: 1em;
            font-weight: 600;
            margin-bottom: 8px;
            word-break: break-all;
        }

        /* --- Global & Layout - Dark Theme --- */
        .auction-container {
          font-family: "Rajdhani", "Noto Sans KR", sans-serif;
          max-width: none;
          margin: 0;
          padding: 15px;
          color: #1e293b;
          background-color: transparent;
        }
        .loading-container, .login-required-container {
          text-align: center;
          padding: 40px 20px;
          font-size: 1.1em;
          color: #64748b;
        }
        .auction-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(99, 102, 241, 0.2);
        }
        .auction-header h1 {
          font-size: 1.8em;
          font-weight: 600;
          color: #4f46e5;
          text-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
          margin: 0;
        }
        .auction-balance {
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.3);
          padding: 8px 15px;
          border-radius: 15px;
          font-size: 0.95em;
          color: #1e293b;
        }
        .auction-balance .balance-amount {
          font-weight: 600;
          color: #4f46e5;
          text-shadow: 0 0 5px rgba(99, 102, 241, 0.4);
          margin-left: 5px;
        }

        /* --- Tabs - Dark Theme --- */
        .tab-container {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 25px;
          border-bottom: 2px solid #e2e8f0;
          gap: 8px;
        }
        .tab {
          padding: 10px 18px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 1em;
          font-weight: 500;
          color: #64748b;
          transition: all 0.2s ease;
          white-space: nowrap;
          position: relative;
          top: 2px;
        }
        .tab:hover {
          color: #1e293b;
          background: #f8fafc;
        }
        .tab.active {
          color: #4f46e5;
          font-weight: 600;
          border-bottom-color: #4f46e5;
          text-shadow: 0 0 5px rgba(99, 102, 241, 0.3);
        }

        /* --- Search Bar - Dark Theme --- */
        .search-bar { display: flex; margin-bottom: 25px; gap: 8px; }
        .search-bar input[type="text"] {
          flex-grow: 1;
          padding: 10px 15px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 1em;
          background: rgba(20, 20, 35, 0.8);
          color: #1e293b;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-bar input[type="text"]:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
          outline: none;
        }
        .search-reset-button {
          padding: 10px 18px;
          background: rgba(100, 116, 139, 0.3);
          border: 1px solid rgba(100, 116, 139, 0.5);
          color: #1e293b;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: all 0.2s;
        }
        .search-reset-button:hover {
          background: rgba(100, 116, 139, 0.5);
        }

        /* --- Grid & Card Styles - Dark Theme --- */
        .auctions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .auction-card {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(10px);
        }
        .auction-card:hover {
          transform: translateY(-4px);
          border-color: rgba(99, 102, 241, 0.3);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4), 0 0 15px rgba(99, 102, 241, 0.08);
        }
        .auction-info { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; }
        .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .card-header h3 {
          font-size: 1.15em;
          font-weight: 600;
          color: #fff;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: calc(100% - 85px);
          display: flex;
          align-items: center;
        }
        .time-left-badge {
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.3);
          color: #4f46e5;
          padding: 3px 8px;
          border-radius: 10px;
          font-size: 0.8em;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .auction-description { color: #64748b; font-size: 0.9em; line-height: 1.5; margin-bottom: 12px; }
        .auction-price-details {
          display: flex;
          justify-content: space-between;
          font-size: 0.9em;
          margin-bottom: 8px;
          color: #64748b;
          background: rgba(0, 0, 0, 0.2);
          padding: 10px;
          border-radius: 8px;
        }
        .auction-price-details .price { font-weight: 600; }
        .auction-price-details .current-price { color: #fbbf24; text-shadow: 0 0 5px rgba(251, 191, 36, 0.3); }
        .auction-meta { font-size: 0.85em; color: #64748b; margin-bottom: 10px; }
        .bid-status-indicator.highest {
          color: #34d399;
          font-weight: 600;
          font-size: 0.9em;
          margin-top: auto;
          background: rgba(16, 185, 129, 0.1);
          padding: 8px;
          border-radius: 6px;
          text-align: center;
        }
        .auction-actions {
          padding: 12px 15px;
          background: rgba(0, 0, 0, 0.3);
          border-top: 1px solid #f8fafc;
        }
        .owner-notice {
          text-align: center;
          font-size: 0.9em;
          color: #4f46e5;
          font-weight: 500;
        }
        .bid-input-group { display: flex; gap: 8px; }
        .bid-input {
          flex-grow: 1;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          background: rgba(0, 0, 0, 0.3);
          color: #1e293b;
          border-radius: 6px;
          font-size: 0.9em;
        }
        .bid-input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }
        .bid-button {
          padding: 8px 15px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.1));
          border: 1px solid rgba(16, 185, 129, 0.5);
          color: #34d399;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 600;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .bid-button:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.4);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }
        .bid-button:disabled {
          background: rgba(75, 85, 99, 0.3);
          border-color: rgba(75, 85, 99, 0.5);
          color: #64748b;
          cursor: not-allowed;
        }

        /* --- List View Styles - Dark Theme --- */
        .my-auctions-content h2, .my-bids-content h2, .completed-auctions-content h2 {
          font-size: 1.5em;
          color: #4f46e5;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(99, 102, 241, 0.2);
          text-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
        }
        .list-view { display: flex; flex-direction: column; gap: 15px; }
        .list-item {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          padding: 15px;
          transition: all 0.2s ease;
          border-left: 4px solid transparent;
        }
        .list-item:hover {
          border-color: rgba(99, 102, 241, 0.3);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        .list-item .item-info { flex-grow: 1; padding-right: 15px; }
        .list-item h3 {
          font-size: 1.1em;
          font-weight: 600;
          color: #fff;
          margin: 0 0 5px 0;
          display: flex;
          align-items: center;
        }
        .list-item .item-description { font-size: 0.9em; color: #64748b; margin-bottom: 8px; }
        .list-item .price-details, .list-item .meta-details { font-size: 0.85em; color: #64748b; margin-bottom: 5px; }
        .list-item .bid-info .price { color: #4f46e5; font-weight: 600; }
        .list-item .status-indicator { font-size: 0.9em; font-weight: 500; margin-top: 8px; }
        .list-item .status-indicator .won, .list-item .status-indicator .highest { color: #34d399; font-weight: 600; }
        .list-item .status-indicator .outbid { color: #fbbf24; font-weight: 600; }
        .list-item .item-actions { flex-shrink: 0; display: flex; align-items: center; gap: 10px; }

        /* --- Action Buttons (공통) - Dark Theme --- */
        .action-button {
          padding: 8px 15px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .action-button.primary {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));
          border: 1px solid rgba(59, 130, 246, 0.5);
          color: #60a5fa;
        }
        .action-button.primary:hover {
          background: rgba(59, 130, 246, 0.4);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
        }
        .action-button.cancel-button {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.1));
          border: 1px solid rgba(239, 68, 68, 0.5);
          color: #f87171;
        }
        .action-button.cancel-button:hover {
          background: rgba(239, 68, 68, 0.4);
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.3);
        }
        .action-button.rebid-button {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(251, 191, 36, 0.1));
          border: 1px solid rgba(251, 191, 36, 0.5);
          color: #fbbf24;
        }
        .action-button.rebid-button:hover {
          background: rgba(251, 191, 36, 0.4);
          box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
        }

        /* --- Status Text/Badge - Dark Theme --- */
        .action-status-text {
          font-size: 0.9em;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 4px;
        }
        .action-status-text.sold {
          color: #60a5fa;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .action-status-text.unsold {
          color: #f87171;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .badge {
          font-size: 0.8em;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          color: white;
        }
        .badge.won { background: linear-gradient(135deg, #10b981, #059669); }
        .badge.sold { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .badge.unsold { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .badge.neutral { background: linear-gradient(135deg, #6b7280, #4b5563); }

        /* --- My Bids Specific --- */
        .my-bid-item.status-highest { border-left-color: #10b981; }
        .my-bid-item.status-outbid { border-left-color: #f59e0b; }

        /* --- Completed Auctions Specific --- */
        .completed-item.result-won { border-left-color: #10b981; }
        .completed-item.result-sold { border-left-color: #3b82f6; }
        .completed-item.result-unsold { border-left-color: #ef4444; }

        /* --- Auction Form Styles - Dark Theme --- */
        .register-auction-content h2 {
          font-size: 1.5em;
          color: #4f46e5;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(99, 102, 241, 0.2);
          text-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
        }
        .auction-form {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid #e2e8f0;
          padding: 25px;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          max-width: 650px;
          margin: 0 auto;
          backdrop-filter: blur(10px);
        }
        .form-group { margin-bottom: 20px; }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #1e293b;
        }
        .form-control {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          background: rgba(0, 0, 0, 0.3);
          color: #1e293b;
          border-radius: 6px;
          font-size: 1em;
        }
        .form-control:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }
        .form-control[readOnly] {
          background: rgba(75, 85, 99, 0.3);
          color: #64748b;
        }
        .form-actions { display: flex; gap: 15px; margin-top: 30px; }
        .register-button {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.1)) !important;
          border: 1px solid rgba(16, 185, 129, 0.5) !important;
          color: #34d399 !important;
        }
        .register-button:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.4) !important;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
        }
        .register-button:disabled {
          background: rgba(75, 85, 99, 0.3) !important;
          border-color: rgba(75, 85, 99, 0.5) !important;
          color: #64748b !important;
        }

        /* --- Notification - Dark Theme --- */
        .notification {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 24px;
          border-radius: 12px;
          color: white;
          animation: fadeInOut 3.5s ease-in-out forwards;
          z-index: 1001;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }
        .notification.success {
          background: rgba(16, 185, 129, 0.9);
          border: 1px solid rgba(16, 185, 129, 0.5);
        }
        .notification.error {
          background: rgba(239, 68, 68, 0.9);
          border: 1px solid rgba(239, 68, 68, 0.5);
        }
        .notification.info {
          background: rgba(59, 130, 246, 0.9);
          border: 1px solid rgba(59, 130, 246, 0.5);
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, 15px); }
          10% { opacity: 1; transform: translate(-50%, 0); }
          90% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -5px); }
        }

        .no-results-message {
          text-align: center;
          padding: 30px 20px;
          color: #64748b;
          background: #f9fafb;
          border: 1px dashed #d1d5db;
          border-radius: 12px;
        }

        /* --- Responsive --- */
        @media (max-width: 768px) {
          .auction-header { flex-direction: column; align-items: flex-start; gap: 10px; }
          .auctions-grid { grid-template-columns: 1fr; }
          .list-item { flex-direction: column; align-items: flex-start; }
          .list-item .item-actions { width: 100%; margin-top: 10px; justify-content: flex-end; }
        }
      `})]})}export{qe as default};
