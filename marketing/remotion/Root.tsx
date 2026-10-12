import React from 'react';
import {English45} from './English45';
import {AbsoluteFill, Audio, Composition, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const C={paper:'#f8f7f2',ink:'#193b2d',green:'#d7f5df',purple:'#e9e4f8',muted:'#64716a'};
type Scene={start:number;duration:number;step:string;title:string[];copy:string;image?:string;tags?:string[];cta?:boolean};
const promo:Scene[]=[
 {start:0,duration:6,step:'SOLANA PRIMERO',title:['Tu idea.','Su siguiente paso.'],copy:'Ruta Builder · de una idea a una postulación preparada.',tags:['Idea','Proyecto','Postulación']},
 {start:6,duration:7,step:'01 / TU PROYECTO',title:['Cuenta qué','quieres construir.'],copy:'Problema, público y etapa. Puedes empezar sin código.',image:'01-proyecto.png'},
 {start:13,duration:7,step:'02 / CONFIRMA LOS HECHOS',title:['Contexto claro.','Límites visibles.'],copy:'En esta demo las URLs quedan declaradas, sin inspección.',image:'02-fuentes.png',tags:['Declarado','Por confirmar']},
 {start:20,duration:8,step:'03 / OPORTUNIDADES',title:['Requisitos,','no promesas.'],copy:'Compara el perfil y revisa la fuente oficial. Elegibilidad por confirmar.',image:'04-oportunidades.png',tags:['Catálogo: 11 oct 2026']},
 {start:28,duration:9,step:'04 / TU BORRADOR',title:['Revisa. Edita.','Descarga.'],copy:'Un plan y una copia editable para preparar tu postulación.',image:'06-borrador.png'},
 {start:37,duration:8,step:'PRUEBA EL RECORRIDO',title:['Construye con','una ruta clara.'],copy:'Demo accesible · código abierto MIT · cabs, builder individual.',cta:true},
];
const vertical:Scene[]=[
 {start:0,duration:5,step:'¿UNA IDEA PARA SOLANA?',title:['Dale','una ruta.'],copy:'Ruta Builder',tags:['Solana primero']},
 {start:5,duration:6,step:'01 / CUENTA TU IDEA',title:['Empieza por','tu proyecto.'],copy:'Qué construyes, para quién y en qué etapa estás.',image:'01-proyecto.png'},
 {start:11,duration:6,step:'02 / REVISA REQUISITOS',title:['Una oportunidad.','Preguntas claras.'],copy:'Fuente oficial y datos pendientes. Catálogo del 11 oct 2026.',image:'04-oportunidades.png'},
 {start:17,duration:7,step:'03 / PREPARA TU BORRADOR',title:['Revisa. Edita.','Descarga.'],copy:'Tú decides qué presentar.',image:'06-borrador.png'},
 {start:24,duration:6,step:'EXPLORA RUTA BUILDER',title:['De la idea','al siguiente paso.'],copy:'Prueba la demo. Enlace en la descripción.',cta:true},
];

function Brand(){return <div style={{display:'flex',gap:16,alignItems:'center',fontSize:32,fontWeight:750,letterSpacing:-1}}><div style={{display:'flex',flexDirection:'column',gap:6,transform:'skew(-20deg)'}}>{[C.ink,'#7cb894','#a99bcc'].map((color,i)=><span key={color} style={{height:8,width:36-i*8,background:color,borderRadius:2}}/>)}</div><span>ruta<span style={{fontWeight:400}}>builder</span></span></div>}
function Stage({scene}:{scene:Scene}){
 const f=useCurrentFrame();const {fps,width,height}=useVideoConfig();const v=height>width;
 const entrance=spring({frame:f,fps,config:{damping:22,stiffness:110}});
 const fade=interpolate(f,[0,10,scene.duration*fps-10,scene.duration*fps],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 const drift=interpolate(f,[0,scene.duration*fps],[0,-14]);
 const titleSize=v?86:92;
 return <AbsoluteFill style={{padding:v?'210px 76px 230px':'176px 112px 140px',opacity:fade,display:'flex',flexDirection:v?'column':'row',gap:v?44:66,alignItems:v?'stretch':'center'}}>
  <div style={{width:v?'100%':scene.image?'43%':'100%',transform:`translateY(${(1-entrance)*35}px)`}}>
   <div style={{fontSize:v?26:23,letterSpacing:3,fontWeight:650,color:C.muted,marginBottom:26}}>{scene.step}</div>
   <h1 style={{fontSize:titleSize,lineHeight:1.03,letterSpacing:-4,margin:'0 0 30px',fontWeight:750}}>{scene.title.map((line,i)=><React.Fragment key={line}><span style={{color:i===1?'#577e65':C.ink}}>{line}</span>{i<scene.title.length-1&&<br/>}</React.Fragment>)}</h1>
   <div style={{fontSize:v?35:32,lineHeight:1.45,color:C.muted,maxWidth:scene.image?660:1120}}>{scene.copy}</div>
   {scene.tags&&<div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:32}}>{scene.tags.map((tag,i)=><span key={tag} style={{fontSize:v?28:25,background:i%2?C.purple:C.green,padding:'12px 20px',borderRadius:14}}>{tag}</span>)}</div>}
   {scene.cta&&<div style={{marginTop:36,display:'flex',alignItems:'center',gap:28}}><div style={{padding:'20px 30px',borderRadius:18,background:C.ink,color:C.paper,fontSize:v?32:32,fontWeight:650}}>Abre la demo ↗</div><div style={{fontSize:v?25:27,color:C.muted}}>Sin cuenta ni wallet</div></div>}
   {scene.cta&&!v&&<div style={{fontSize:26,color:C.muted,marginTop:26}}>github.com/CaBsCrypto/ruta-builder</div>}
  </div>
  {scene.image&&<div style={{width:v?'100%':'57%',position:'relative',transform:`translateY(${drift+(1-entrance)*38}px) rotate(${v?0:-1.2}deg)`,border:'2px solid #dae5d8',background:'#fff',padding:10,borderRadius:24,boxShadow:'0 24px 65px #193b2d18',overflow:'hidden'}}><div style={{height:34,display:'flex',alignItems:'center',gap:8,paddingLeft:10,marginBottom:8}}>{['#b1cfb7','#d7dbc8','#c2b4da'].map(color=><i key={color} style={{height:9,width:9,background:color,borderRadius:99}}/>)}<span style={{fontSize:16,color:C.muted,marginLeft:12}}>Captura de la demo pública</span></div><Img src={staticFile(scene.image)} style={{width:'100%',display:'block',borderRadius:14}}/></div>}
  {!scene.image&&!scene.cta&&<div style={{position:'absolute',right:v?78:115,bottom:v?290:180,display:'flex',gap:20,alignItems:'center'}}>{['Idea','Plan','Borrador'].map((label,i)=><React.Fragment key={label}><div style={{background:i===1?C.purple:C.green,padding:v?'23px 28px':'30px 44px',borderRadius:22,fontSize:v?31:37,fontWeight:550,transform:`translateY(${Math.sin((f+i*22)/26)*7}px)`}}>{label}</div>{i<2&&<span style={{fontSize:35,color:C.muted}}>→</span>}</React.Fragment>)}</div>}
 </AbsoluteFill>
}
function Film({short=false}:{short?:boolean}){
 const f=useCurrentFrame();const {fps,width,height,durationInFrames}=useVideoConfig();const v=height>width;const scenes=short?vertical:promo;
 return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Arial, sans-serif',overflow:'hidden'}}>
  <div style={{position:'absolute',width:900,height:900,borderRadius:'50%',right:-290,top:-380,background:'radial-gradient(circle,#d7f5df88,transparent 70%)',transform:`translate(${Math.sin(f/100)*30}px,${Math.cos(f/100)*30}px)`}}/>
  <div style={{position:'absolute',width:900,height:900,borderRadius:'50%',left:-340,bottom:-420,background:'radial-gradient(circle,#e9e4f8bb,transparent 70%)'}}/>
  <div style={{position:'absolute',top:v?84:60,left:v?76:112}}><Brand/></div>
  <div style={{position:'absolute',right:v?76:112,top:v?92:65,fontSize:v?23:23,letterSpacing:2}}>SOLANA PRIMERO</div>
  {scenes.map((scene,i)=><Sequence key={i} from={scene.start*fps} durationInFrames={scene.duration*fps}><Stage scene={scene}/></Sequence>)}
  <div style={{position:'absolute',left:v?76:112,right:v?76:112,bottom:v?164:60,borderTop:'1px solid #d7dfd4',paddingTop:20,fontSize:v?25:24,lineHeight:1.5,color:C.muted}}><strong style={{color:C.ink}}>DEMO PÚBLICA</strong> · Fuentes, IA y acceso simulados.<br/>Compra real en devnet pendiente.</div>
  <div style={{position:'absolute',bottom:0,left:0,height:8,width:`${f/durationInFrames*100}%`,background:'#7cb894'}}/>
  <Audio src={staticFile('music.wav')} volume={0.36} endAt={durationInFrames}/>
 </AbsoluteFill>
}
export function Root(){return <><Composition id="RutaEnglish45" component={English45} durationInFrames={45*30} fps={30} width={1920} height={1080}/><Composition id="RutaPromo" component={Film} durationInFrames={45*30} fps={30} width={1920} height={1080}/><Composition id="RutaVertical" component={Film} defaultProps={{short:true}} durationInFrames={30*30} fps={30} width={1080} height={1920}/></>}
