import React from 'react';
import {AbsoluteFill,Audio,Img,Sequence,interpolate,spring,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import scenes from '../english45.json';
const C={paper:'#f8f7f2',ink:'#193b2d',muted:'#64716a'};
function Scene({scene}:{scene:typeof scenes[number]}){
 const f=useCurrentFrame();const {fps}=useVideoConfig();const entry=spring({frame:f,fps,config:{damping:22,stiffness:110}});
 const fade=interpolate(f,[0,9,scene.duration*fps-8,scene.duration*fps],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <AbsoluteFill style={{padding:'165px 95px 145px',display:'flex',flexDirection:'row',alignItems:'center',gap:55,opacity:fade}}>
  <div style={{width:scene.image?'41%':'100%',transform:`translateY(${(1-entry)*30}px)`}}><div style={{fontSize:23,letterSpacing:3,color:C.muted,marginBottom:28}}>{scene.step}</div><h1 style={{fontSize:scene.image?85:106,lineHeight:1.03,letterSpacing:-4,margin:'0 0 30px'}}>{scene.title.map((line,i)=><React.Fragment key={line}><span style={{color:i?'#577e65':C.ink}}>{line}</span>{i===0&&<br/>}</React.Fragment>)}</h1><p style={{fontSize:31,lineHeight:1.5,color:C.muted,maxWidth:1000}}>{scene.copy}</p>{!scene.image&&<><div style={{display:'inline-block',background:C.ink,color:C.paper,padding:'20px 30px',borderRadius:16,fontSize:32,marginTop:14}}>Explore the demo ↗</div><p style={{fontSize:26,color:C.muted}}>No account or wallet required</p><p style={{fontSize:25,color:C.muted}}>github.com/CaBsCrypto/ruta-builder</p></>}</div>
  {scene.image&&<div style={{width:'59%',padding:12,background:'#fff',border:'2px solid #dce3d9',borderRadius:22,boxShadow:'0 25px 60px #193b2d15',transform:`translateY(${(1-entry)*35}px)`}}><div style={{fontSize:18,color:C.muted,padding:'6px 12px 15px'}}>PUBLIC DEMO · ACTUAL SCREENSHOT</div><Img src={staticFile(`english/${scene.image}`)} style={{width:'100%',display:'block',borderRadius:12}}/></div>}
 </AbsoluteFill>;
}
export function English45(){
 const f=useCurrentFrame();const {fps}=useVideoConfig();return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Arial, sans-serif'}}>
 <div style={{position:'absolute',right:-200,top:-400,width:900,height:900,borderRadius:'50%',background:'radial-gradient(circle,#d7f5df88,transparent 70%)'}}/>
 <div style={{position:'absolute',left:95,top:60,fontSize:34,fontWeight:750,letterSpacing:-1}}>ruta<span style={{fontWeight:400}}>builder</span></div><div style={{position:'absolute',right:95,top:68,fontSize:22,letterSpacing:3}}>SOLANA FIRST</div>
 {scenes.map((scene,i)=><Sequence key={scene.start} from={scene.start*fps} durationInFrames={scene.duration*fps}><Scene scene={scene}/><Sequence from={8}><Audio src={staticFile(`english/voice-${i}.wav`)} volume={1}/></Sequence></Sequence>)}
 <div style={{position:'absolute',bottom:52,left:95,right:95,borderTop:'1px solid #dce3d9',paddingTop:19,fontSize:23,color:C.muted,lineHeight:1.5}}><strong style={{color:C.ink}}>PUBLIC DEMO</strong> · Sources, AI and access are simulated.<br/>Real devnet purchase pending.</div>
 <div style={{position:'absolute',bottom:0,left:0,height:7,width:`${f/1350*100}%`,background:'#7cb894'}}/>
 <Audio src={staticFile('music.wav')} volume={0.075} endAt={1350}/>
 </AbsoluteFill>;
}
